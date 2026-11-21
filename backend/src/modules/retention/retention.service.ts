import { randomUUID } from 'node:crypto';
import type { Player, Room, RoomRetention, RetentionDraft, RetentionPhase, RetentionPick, RetentionSnapshot, RetentionTurn, Team } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
import { toCr } from '../../domain/money.js';
import { fc26BasePriceUnits } from '../../domain/pricing.js';
import { RETENTION_MAX_PER_TEAM, RETENTION_PRICE_CR, RETENTION_PRICE_UNITS } from '../../domain/retention.js';
import type { RoomSettings } from '../../schemas/settings.js';

/**
 * Sequential retention rules on a draft Room (pure; callers run them inside RoomManager.mutate).
 * Money and squads change only at finalize: drafts and confirmed picks live in room.retention.
 */
export const retentionPhase = (room: Room): 'OFF' | RetentionPhase =>
  !room.settings.retention.enabled ? 'OFF' : room.retention?.phase ?? 'NOT_STARTED';
export const confirmedPicks = (room: Room, teamId: string): RetentionPick[] => (room.retention?.picks ?? []).filter(p => p.teamId === teamId);
export const teamDrafts = (room: Room, teamId: string): RetentionDraft[] => (room.retention?.drafts ?? []).filter(d => d.teamId === teamId);
export const confirmedSpendUnits = (room: Room, teamId: string): number => confirmedPicks(room, teamId).reduce((sum, p) => sum + p.priceUnits, 0);
/** Confirmed spend that is not yet part of team.spentUnits (it is added at finalize). */
export const pendingSpendUnits = (room: Pick<Room, 'retention'>, teamId: string): number => room.retention?.phase === 'FINALIZED' ? 0
  : (room.retention?.picks ?? []).filter(p => p.teamId === teamId).reduce((sum, p) => sum + p.priceUnits, 0);
/** Purse after confirmed retentions, before the viewer's own unconfirmed selection. */
export const purseAfterConfirmedUnits = (room: Room, team: Team): number => team.startingBudgetUnits - team.spentUnits - pendingSpendUnits(room, team.id);

const ensure = (room: Room): RoomRetention => (room.retention ??= { phase: 'NOT_STARTED', picks: [], drafts: [], turns: [] });
const turnsOf = (r: RoomRetention): RetentionTurn[] => (r.turns ??= []);
const draftsOf = (r: RoomRetention): RetentionDraft[] => (r.drafts ??= []);

function requireEnabledLobby(room: Room): RoomRetention {
  requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Retention is only available in the lobby.', 409);
  requireThat(room.settings.retention.enabled, 'RETENTION_NOT_ENABLED', 'Player retention is not enabled for this auction.', 409);
  return ensure(room);
}
/** Resolves the team whose turn it is and checks that `actor` may act for it. The host may skip for the active team. */
function requireActiveTurn(room: Room, actor: Team, userId: string, hostMayAct = false): { retention: RoomRetention; team: Team } {
  const retention = requireEnabledLobby(room);
  const hostActing = hostMayAct && room.hostUserId === userId;
  requireThat(hostActing || turnsOf(retention).every(t => t.teamId !== actor.id),
    'TURN_ALREADY_COMPLETED', 'Your retention turn is already complete.', 409);
  requireThat(retention.phase !== 'NOT_STARTED', 'RETENTION_NOT_STARTED', 'The retention phase has not started.', 409);
  requireThat(retention.phase !== 'FINALIZED', 'RETENTION_CLOSED', 'Retention has been finalized.', 409);
  requireThat(retention.phase === 'TEAM_SELECTING' && retention.activeTeamId, 'RETENTION_NOT_ACTIVE', 'No team is selecting right now.', 409);
  const team = room.teams.find(t => t.id === retention.activeTeamId);
  requireThat(team, 'TEAM_NOT_FOUND', 'Active team not found.', 404);
  requireThat(actor.id === team.id || hostActing, 'NOT_ACTIVE_TEAM', 'It is not your team\'s turn.', 403);
  return { retention, team };
}

const snapshotOf = (player: Player, topRatingThreshold: number): RetentionSnapshot => ({ ...structuredClone(player),
  // Prices are recomputed from rating and draft pool; the catalog value is never trusted.
  basePriceUnits: fc26BasePriceUnits({ overall: player.ovr, draftPool: player.draftPool ?? 'REGULAR' }, topRatingThreshold) });

/** Host: freezes the team order (room.teams order) and opens Team 1's turn. */
export function startRetention(room: Room): RoomRetention {
  const retention = requireEnabledLobby(room);
  requireThat(retention.phase === 'NOT_STARTED', 'RETENTION_ALREADY_STARTED', 'The retention phase has already started.', 409);
  requireThat(room.teams.length >= room.settings.minimumParticipants, 'NOT_ENOUGH_PARTICIPANTS', 'Not enough participants.', 409);
  retention.order = room.teams.map(t => t.id);
  retention.activeTeamId = retention.order[0]!;
  retention.phase = 'TEAM_SELECTING';
  retention.picks = []; retention.drafts = []; retention.turns = [];
  delete retention.completion; delete retention.finalizedAt;
  return retention;
}

/** The active team reserves a player (an unconfirmed draft). */
export function draftPlayer(room: Room, actor: Team, player: Player | null, userId: string, now: number, topRatingThreshold: number): RetentionDraft {
  const { retention, team } = requireActiveTurn(room, actor, userId);
  requireThat(player, 'RETENTION_PLAYER_NOT_FOUND', 'Player is not in the FC26 database.', 404);
  requireThat(!retention.picks.some(p => p.playerId === player.id), 'PLAYER_ALREADY_RETAINED', 'Another team has already retained this player.', 409);
  const existing = draftsOf(retention).find(d => d.playerId === player.id);
  requireThat(!existing || existing.teamId !== team.id, 'ALREADY_SELECTED', 'You have already selected this player.', 409);
  requireThat(!existing, 'PLAYER_RESERVED', 'This player is reserved by another team.', 409);
  const held = confirmedPicks(room, team.id).length + teamDrafts(room, team.id).length;
  requireThat(held < RETENTION_MAX_PER_TEAM, 'RETENTION_LIMIT_REACHED', `A team can retain at most ${RETENTION_MAX_PER_TEAM} players.`, 409);
  requireThat(team.playerIds.length + held < room.settings.maxSquadSize, 'SQUAD_FULL', 'Squad is already full.', 409);
  const purse = purseAfterConfirmedUnits(room, team) - teamDrafts(room, team.id).length * RETENTION_PRICE_UNITS;
  requireThat(purse >= RETENTION_PRICE_UNITS, 'INSUFFICIENT_PURSE', 'Not enough purse to retain this player.', 409);
  const draft: RetentionDraft = { teamId: team.id, playerId: player.id, snapshot: snapshotOf(player, topRatingThreshold), at: now };
  draftsOf(retention).push(draft);
  return draft;
}

export function removeDraft(room: Room, actor: Team, userId: string, playerId: string): RetentionDraft {
  const { retention, team } = requireActiveTurn(room, actor, userId);
  const draft = draftsOf(retention).find(d => d.teamId === team.id && d.playerId === playerId);
  requireThat(draft, 'DRAFT_NOT_FOUND', 'That player is not in your selection.', 404);
  retention.drafts = draftsOf(retention).filter(d => d !== draft);
  return draft;
}

function completeTurn(room: Room, retention: RoomRetention, team: Team, kind: 'RETAINED' | 'SKIPPED', playerIds: string[], userId: string, now: number, id: string = randomUUID()): RetentionTurn {
  const turns = turnsOf(retention);
  const order = retention.order!;
  const index = order.indexOf(team.id);
  const nextTeamId = order[index + 1] ?? null;
  const turn: RetentionTurn = { id, teamId: team.id, order: index + 1, kind, playerIds,
    spentUnits: playerIds.length * RETENTION_PRICE_UNITS, remainingUnits: purseAfterConfirmedUnits(room, team), nextTeamId,
    allCompleted: nextTeamId === null, at: now, confirmedBy: userId };
  turns.push(turn);
  retention.drafts = draftsOf(retention).filter(d => d.teamId !== team.id);
  retention.activeTeamId = nextTeamId;
  if (nextTeamId === null) { retention.phase = 'ALL_TEAMS_COMPLETED'; retention.completion = { id: randomUUID(), at: now }; }
  return turn;
}

/** The active team locks 1..3 drafts; the server advances to the next team. */
export function confirmTurn(room: Room, actor: Team, userId: string, now: number): RetentionTurn {
  const { retention, team } = requireActiveTurn(room, actor, userId);
  const drafts = teamDrafts(room, team.id);
  requireThat(drafts.length > 0, 'USE_SKIP_RETENTION', 'Select at least one player, or skip retention.', 409);
  requireThat(drafts.length <= RETENTION_MAX_PER_TEAM, 'RETENTION_LIMIT_REACHED', `A team can retain at most ${RETENTION_MAX_PER_TEAM} players.`, 409);
  const order = retention.order!.indexOf(team.id) + 1;
  const turnId = randomUUID();
  for (const draft of drafts) {
    requireThat(!retention.picks.some(p => p.playerId === draft.playerId), 'PLAYER_ALREADY_RETAINED', 'Another team has already retained this player.', 409);
    retention.picks.push({ id: randomUUID(), teamId: team.id, playerId: draft.playerId, priceUnits: RETENTION_PRICE_UNITS, at: draft.at,
      userId: actor.userId, turnId, order, confirmedAt: now, confirmedBy: userId, snapshot: draft.snapshot });
  }
  return completeTurn(room, retention, team, 'RETAINED', drafts.map(d => d.playerId), userId, now, turnId);
}

/** Explicit zero-retention. The active manager, or the host on that team's behalf. */
export function skipTurn(room: Room, actor: Team, userId: string, now: number): RetentionTurn {
  const { retention, team } = requireActiveTurn(room, actor, userId, true);
  return completeTurn(room, retention, team, 'SKIPPED', [], userId, now);
}

/** Host: applies every confirmed pick to purses and squads in one commit. */
export function finalizeRetentions(room: Room, now: number, topRatingThreshold: number): RoomRetention {
  const retention = requireEnabledLobby(room);
  requireThat(retention.phase !== 'FINALIZED', 'RETENTION_CLOSED', 'Retention has already been finalized.', 409);
  requireThat(retention.phase === 'ALL_TEAMS_COMPLETED', 'RETENTION_NOT_COMPLETE', 'Every team must complete its retention turn first.', 409);
  for (const pick of retention.picks) {
    const team = room.teams.find(t => t.id === pick.teamId)!;
    const player = pick.snapshot!;
    team.spentUnits += pick.priceUnits;
    team.playerIds.push(pick.playerId);
    room.purchases.push({ id: randomUUID(), playerId: pick.playerId, teamId: team.id, priceUnits: pick.priceUnits, bidCount: 0, at: now,
      durationMs: 0, acquisitionType: 'RETENTION', isRetained: true });
    room.players.push({ ...structuredClone(player), status: 'SOLD', round: 0,
      basePriceUnits: fc26BasePriceUnits({ overall: player.ovr, draftPool: player.draftPool ?? 'REGULAR' }, topRatingThreshold) });
  }
  retention.phase = 'FINALIZED';
  retention.finalizedAt = now;
  return retention;
}

/** Reverses a materialized retention: purchases, squad entries, spend and SOLD player entries. */
function dematerialize(room: Room, picks: RetentionPick[]): void {
  const players = new Set(picks.map(p => p.playerId));
  for (const pick of picks) {
    const team = room.teams.find(t => t.id === pick.teamId);
    if (team) { team.spentUnits -= pick.priceUnits; team.playerIds = team.playerIds.filter(id => id !== pick.playerId); }
  }
  room.purchases = room.purchases.filter(p => !(p.acquisitionType === 'RETENTION' && players.has(p.playerId)));
  room.players = room.players.filter(p => !players.has(p.id));
}

/** Host reset in the lobby: reverses a finalized state and returns to NOT_STARTED. */
export function resetRetentions(room: Room): RetentionPick[] {
  requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Retention can only be reset in the lobby.', 409);
  requireThat(room.settings.retention.enabled, 'RETENTION_NOT_ENABLED', 'Player retention is not enabled for this auction.', 409);
  const retention = ensure(room);
  const removed = [...retention.picks];
  if (retention.phase === 'FINALIZED') dematerialize(room, removed);
  room.retention = { phase: 'NOT_STARTED', picks: [], drafts: [], turns: [] };
  return removed;
}

/** Legacy snapshots: the first implementation materialized picks while phase was OPEN. Undo that so nothing is lost. */
export function normalizeLegacyRetention(room: Room): void {
  const retention = room.retention;
  if (!retention) return;
  if ((retention.phase as string) === 'OPEN') {
    dematerialize(room, retention.picks);
    room.retention = { phase: 'NOT_STARTED', picks: [], drafts: [], turns: [] };
  }
}

/** Joining, leaving or being kicked is not allowed once the retention phase has started. */
export function requireRetentionOpenForMembership(room: Room): void {
  requireThat(!room.settings.retention.enabled || (room.retention?.phase ?? 'NOT_STARTED') === 'NOT_STARTED', 'RETENTION_IN_PROGRESS',
    'Retention has started; the host must reset it before the team list can change.', 409);
}

/** Host settings that change purses or the pool are frozen once retention has started. */
export function assertRetentionSettingsUnlocked(room: Room, next: RoomSettings): void {
  if (!room.retention || room.retention.phase === 'NOT_STARTED') return;
  const prev = room.settings;
  requireThat(next.startingBudgetCr === prev.startingBudgetCr && next.retention.enabled === prev.retention.enabled
    && next.playerPoolSource === prev.playerPoolSource, 'RETENTION_LOCKED',
    'Reset retentions before changing the purse, the player source or the retention setting.', 409);
}

/** Drops an empty retention record when retention is switched off. */
export function syncRetentionWithSettings(room: Room): void {
  if (room.retention && !room.settings.retention.enabled && room.retention.phase === 'NOT_STARTED') delete room.retention;
}

const playerCard = (s: RetentionSnapshot) => ({ playerId: s.id, name: s.name, fullName: s.fullName ?? s.name, ovr: s.ovr,
  position: s.subPosition ?? s.position, positions: s.positions ?? [s.subPosition ?? s.position], club: s.club ?? null, nationality: s.nationality ?? null,
  imageUrl: s.photoUrl ?? null, playerTag: s.playerTag ?? null, draftPool: s.draftPool ?? 'REGULAR', priceCr: RETENTION_PRICE_CR });
export const retentionPlayerCard = playerCard;

/** Snapshot of a confirmed pick (falls back to the room entry for legacy picks). */
export function pickSnapshot(room: Room, pick: RetentionPick): RetentionSnapshot | null {
  return pick.snapshot ?? room.players.find(p => p.id === pick.playerId) ?? null;
}

/** Announcement payload of one completed turn; identical for the live event and ROOM_STATE.retention.turns. */
export function turnAnnouncement(room: Room, turn: RetentionTurn) {
  const retention = room.retention!;
  const team = room.teams.find(t => t.id === turn.teamId);
  const next = turn.nextTeamId ? room.teams.find(t => t.id === turn.nextTeamId) : undefined;
  const players = retention.picks.filter(p => p.turnId === turn.id).map(p => pickSnapshot(room, p)).filter((s): s is RetentionSnapshot => !!s).map(playerCard);
  return { eventId: turn.id, kind: turn.kind, teamId: turn.teamId, teamName: team?.name ?? '', teamOrder: turn.order, totalTeams: retention.order?.length ?? 0,
    players, spentCr: toCr(turn.spentUnits), remainingPurseCr: toCr(turn.remainingUnits),
    nextTeamId: turn.nextTeamId, nextTeamName: next?.name ?? null, nextTeamOrder: next ? (retention.order?.indexOf(next.id) ?? -1) + 1 : null,
    allCompleted: turn.allCompleted, at: turn.at };
}

/** Announcement payload for "all teams completed". Null until the last turn is done. */
export function completionAnnouncement(room: Room) {
  const retention = room.retention;
  if (!retention?.completion) return null;
  return { eventId: retention.completion.id, at: retention.completion.at,
    teams: (retention.order ?? []).map((teamId, index) => {
      const team = room.teams.find(t => t.id === teamId);
      return { teamId, name: team?.name ?? '', order: index + 1, retainedCount: confirmedPicks(room, teamId).length,
        spentCr: toCr(confirmedSpendUnits(room, teamId)), remainingPurseCr: team ? toCr(purseAfterConfirmedUnits(room, team)) : 0 };
    }) };
}
