import { randomUUID } from 'node:crypto';
import type { Player, Room, RoomRetention, RetentionPick, Team } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
import { fc26BasePriceUnits } from '../../domain/pricing.js';
import { RETENTION_MAX_PER_TEAM, RETENTION_PRICE_UNITS } from '../../domain/retention.js';
import type { RoomSettings } from '../../schemas/settings.js';
import { remainingBudget } from '../auction/budget.service.js';

/** Pure retention rules on a draft Room. Callers run these inside RoomManager.mutate. */
export const retentionPhase = (room: Room): 'OFF' | 'OPEN' | 'FINALIZED' =>
  !room.settings.retention.enabled ? 'OFF' : room.retention?.phase ?? 'OPEN';
export const teamPicks = (room: Room, teamId: string): RetentionPick[] => (room.retention?.picks ?? []).filter(p => p.teamId === teamId);
export const retentionSpentUnits = (room: Room, teamId: string): number => teamPicks(room, teamId).reduce((sum, p) => sum + p.priceUnits, 0);

const ensure = (room: Room): RoomRetention => (room.retention ??= { phase: 'OPEN', picks: [] });
const requireLobbyOpen = (room: Room): RoomRetention => {
  requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Retention is only available in the lobby.', 409);
  requireThat(room.settings.retention.enabled, 'RETENTION_NOT_ENABLED', 'Player retention is not enabled for this auction.', 409);
  const retention = ensure(room);
  requireThat(retention.phase === 'OPEN', 'RETENTION_CLOSED', 'Retention has been finalized.', 409);
  return retention;
};

export function retainPlayer(room: Room, team: Team, player: Player | null, userId: string, now: number, topRatingThreshold: number): RetentionPick {
  const retention = requireLobbyOpen(room);
  requireThat(player, 'RETENTION_PLAYER_NOT_FOUND', 'Player is not in the FC26 database.', 404);
  const existing = retention.picks.find(p => p.playerId === player.id);
  requireThat(!existing || existing.teamId !== team.id, 'ALREADY_RETAINED_BY_TEAM', 'Your team has already retained this player.', 409);
  requireThat(!existing, 'PLAYER_ALREADY_RETAINED', 'Another team has already retained this player.', 409);
  requireThat(teamPicks(room, team.id).length < RETENTION_MAX_PER_TEAM, 'RETENTION_LIMIT_REACHED',
    `A team can retain at most ${RETENTION_MAX_PER_TEAM} players.`, 409);
  requireThat(team.playerIds.length < room.settings.maxSquadSize, 'SQUAD_FULL', 'Squad is already full.', 409);
  requireThat(remainingBudget(team) >= RETENTION_PRICE_UNITS, 'INSUFFICIENT_PURSE', 'Not enough purse to retain this player.', 409);
  const pick: RetentionPick = { id: randomUUID(), teamId: team.id, playerId: player.id, priceUnits: RETENTION_PRICE_UNITS, at: now, userId };
  retention.picks.push(pick);
  room.purchases.push({ id: randomUUID(), playerId: player.id, teamId: team.id, priceUnits: RETENTION_PRICE_UNITS, bidCount: 0, at: now,
    durationMs: 0, acquisitionType: 'RETENTION', isRetained: true });
  team.spentUnits += RETENTION_PRICE_UNITS;
  team.playerIds.push(player.id);
  // Prices are recomputed from rating and draft pool; the catalog value is never trusted.
  room.players.push({ ...player, status: 'SOLD', round: 0,
    basePriceUnits: fc26BasePriceUnits({ overall: player.ovr, draftPool: player.draftPool ?? 'REGULAR' }, topRatingThreshold) });
  return pick;
}

export function finalizeRetentions(room: Room, now: number): RoomRetention {
  const retention = requireLobbyOpen(room);
  retention.phase = 'FINALIZED';
  retention.finalizedAt = now;
  return retention;
}

/** Removes the given picks together with their purchases, squad entries and SOLD player entries. */
function removePicks(room: Room, picks: RetentionPick[]): void {
  const ids = new Set(picks.map(p => p.id));
  const players = new Set(picks.map(p => p.playerId));
  for (const pick of picks) {
    const team = room.teams.find(t => t.id === pick.teamId);
    if (team) { team.spentUnits -= pick.priceUnits; team.playerIds = team.playerIds.filter(id => id !== pick.playerId); }
  }
  room.purchases = room.purchases.filter(p => !(p.acquisitionType === 'RETENTION' && players.has(p.playerId)));
  room.players = room.players.filter(p => !players.has(p.id));
  if (room.retention) room.retention.picks = room.retention.picks.filter(p => !ids.has(p.id));
}

/** Host reset: removes every pick and reopens retention. Valid in OPEN or FINALIZED, in the lobby only. */
export function resetRetentions(room: Room): RetentionPick[] {
  requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Retention can only be reset in the lobby.', 409);
  requireThat(room.settings.retention.enabled, 'RETENTION_NOT_ENABLED', 'Player retention is not enabled for this auction.', 409);
  const retention = ensure(room);
  const removed = [...retention.picks];
  removePicks(room, removed);
  retention.phase = 'OPEN';
  delete retention.finalizedAt;
  return removed;
}

/** Used by kick and leave before finalization. */
export function releaseTeamRetentions(room: Room, teamId: string): RetentionPick[] {
  const picks = teamPicks(room, teamId);
  if (room.retention) requireThat(room.retention.phase === 'OPEN', 'RETENTION_FINALIZED',
    'Retentions are finalized; the host must reset them first.', 409);
  removePicks(room, picks);
  return picks;
}

/** Joining, leaving or being kicked is not allowed once retentions are final. */
export function requireRetentionOpenForMembership(room: Room): void {
  requireThat(room.retention?.phase !== 'FINALIZED', 'RETENTION_FINALIZED',
    'Retentions are finalized; the host must reset them before the team list can change.', 409);
}

/** Host settings that change purses or the pool are frozen once any pick exists or retention is final. */
export function assertRetentionSettingsUnlocked(room: Room, next: RoomSettings): void {
  const retention = room.retention;
  if (!retention || (retention.picks.length === 0 && retention.phase !== 'FINALIZED')) return;
  const prev = room.settings;
  requireThat(next.startingBudgetCr === prev.startingBudgetCr && next.retention.enabled === prev.retention.enabled
    && next.playerPoolSource === prev.playerPoolSource, 'RETENTION_LOCKED',
    'Reset retentions before changing the purse, the player source or the retention setting.', 409);
}

/** Drops an empty retention record when retention is switched off. */
export function syncRetentionWithSettings(room: Room): void {
  if (room.retention && !room.settings.retention.enabled && room.retention.picks.length === 0) delete room.retention;
}
