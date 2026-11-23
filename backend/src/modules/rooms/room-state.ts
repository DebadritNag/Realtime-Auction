import type { Player, Room, Team } from '../../domain/types.js';
import { toCr } from '../../domain/money.js';
import { minimumNextBid } from '../auction/bid.service.js';
import { remainingBudget } from '../auction/budget.service.js';
import { isUnclaimed } from '../restore/restore.claims.js';
import { publicPlayer, publicTeam } from '../teams/team.service.js';
import { skipVoteState } from '../auction/skip-vote.service.js';
import { requireMember } from './room.service.js';
import { RETENTION_MAX_PER_TEAM, RETENTION_MIN_PER_TEAM, RETENTION_PRICE_CR, RETENTION_PRICE_UNITS } from '../../domain/retention.js';
import { followIds, heldIds } from '../auction/pool-import/pool-additions.js';
import { lastActivityOf, ongoingStatus, resumePath } from './room-summary.js';
import { completionAnnouncement, confirmedPicks, confirmedSpendUnits, pickSnapshot, purseAfterConfirmedUnits, retentionPhase, turnAnnouncement } from '../retention/retention.service.js';

type TurnStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'SKIPPED';
/** Per-viewer retention projection. Unconfirmed drafts are visible only to their owner; everyone else sees reserved player ids. */
function retentionState(room: Room, viewer: Team) {
  const retention = room.retention;
  const picks = retention?.picks ?? [];
  const turns = retention?.turns ?? [];
  const phase = retentionPhase(room);
  const order = retention?.order ?? [];
  const activeTeamId = retention?.activeTeamId ?? null;
  const drafts = retention?.drafts ?? [];
  const ownDrafts = drafts.filter(d => d.teamId === viewer.id);
  const isHost = room.hostUserId === viewer.userId;
  const teamName = (id: string | null) => room.teams.find(t => t.id === id)?.name ?? null;
  const status = (teamId: string): TurnStatus => {
    const turn = turns.find(t => t.teamId === teamId);
    return turn ? (turn.kind === 'SKIPPED' ? 'SKIPPED' : 'COMPLETED') : teamId === activeTeamId ? 'ACTIVE' : 'PENDING';
  };
  return {
    enabled: room.settings.retention.enabled && !room.restore,
    config: { priceCr: RETENTION_PRICE_CR, maxPerTeam: RETENTION_MAX_PER_TEAM, minPerTeam: RETENTION_MIN_PER_TEAM },
    phase,
    order: order.map((teamId, index) => ({ teamId, name: teamName(teamId) ?? '', order: index + 1, turnStatus: status(teamId) })),
    activeTeamId, activeTeamName: teamName(activeTeamId),
    progress: { completed: turns.length, total: order.length },
    canAct: phase === 'TEAM_SELECTING' && activeTeamId === viewer.id,
    canSkipForActive: phase === 'TEAM_SELECTING' && isHost,
    picks: picks.map(pick => {
      const snapshot = pickSnapshot(room, pick);
      return { id: pick.id, teamId: pick.teamId, teamName: teamName(pick.teamId) ?? '', playerId: pick.playerId, priceCr: toCr(pick.priceUnits), at: pick.at,
        order: pick.order ?? null, turnId: pick.turnId ?? null, confirmedAt: pick.confirmedAt ?? pick.at, acquisitionType: 'RETENTION' as const,
        player: snapshot ? publicPlayer(snapshot as Player) : null };
    }),
    turns: turns.map(turn => turnAnnouncement(room, turn)),
    lastCompleted: turns.length ? turnAnnouncement(room, turns[turns.length - 1]!) : null,
    completion: completionAnnouncement(room),
    // Anonymous reservations: ids only, never the owner or the player data.
    reservedPlayerIds: drafts.map(d => d.playerId),
    ownDraft: { players: ownDrafts.map(d => ({ ...publicPlayer(d.snapshot as Player), retentionPriceCr: RETENTION_PRICE_CR })),
      spentCr: toCr(ownDrafts.length * RETENTION_PRICE_UNITS), remainingPurseCr: toCr(purseAfterConfirmedUnits(room, viewer) - ownDrafts.length * RETENTION_PRICE_UNITS) },
    teams: room.teams.map(t => {
      const spent = confirmedSpendUnits(room, t.id);
      const count = confirmedPicks(room, t.id).length;
      return { teamId: t.id, retainedCount: count, remainingSlots: Math.max(0, RETENTION_MAX_PER_TEAM - count), spentCr: toCr(spent),
        remainingPurseCr: toCr(purseAfterConfirmedUnits(room, t)), turnStatus: order.includes(t.id) ? status(t.id) : 'PENDING' as TurnStatus };
    }),
    totals: { retained: picks.length, spentCr: toCr(picks.reduce((sum, p) => sum + p.priceUnits, 0)) },
    finalizedAt: retention?.finalizedAt ?? null,
  };
}

export const ACTIVITY_LIMIT = 60;
export const RECENT_BID_LIMIT = 20;
export type ActivityKind = 'BID' | 'SOLD' | 'UNSOLD' | 'RECALLED' | 'RETENTION';
export interface ActivityEntry {
  id: string; kind: ActivityKind; at: number; teamId?: string; teamName?: string; playerId?: string; playerName?: string;
  amountCr?: number; detail?: string;
}
/** Newest-first activity feed derived from persisted history, so it survives refresh and restart. Ids are stable. */
export function roomActivity(room: Room): ActivityEntry[] {
  const teamName = (id: string) => room.teams.find(t => t.id === id)?.name;
  const playerName = (id: string) => room.players.find(p => p.id === id)?.name
    ?? (room.retention?.picks ?? []).find(p => p.playerId === id)?.snapshot?.name;
  const tail = <T,>(items: T[] | undefined) => (items ?? []).slice(-ACTIVITY_LIMIT);
  const entries: ActivityEntry[] = [];
  for (const bid of tail(room.bids)) entries.push({ id: bid.id, kind: 'BID', at: bid.at, teamId: bid.teamId, teamName: teamName(bid.teamId),
    playerId: bid.playerId, playerName: playerName(bid.playerId), amountCr: toCr(bid.amountUnits) });
  for (const purchase of tail(room.purchases.filter(p => p.acquisitionType !== 'RETENTION' && !p.restoredFromSnapshot)))
    entries.push({ id: purchase.id, kind: 'SOLD', at: purchase.at, teamId: purchase.teamId, teamName: teamName(purchase.teamId),
      playerId: purchase.playerId, playerName: playerName(purchase.playerId), amountCr: toCr(purchase.priceUnits) });
  for (const h of tail(room.playerHistory)) {
    const unsold = h.type === 'PLAYER_UNSOLD';
    entries.push({ id: `${unsold ? 'unsold' : 'recalled'}-${h.playerId}-${h.at}`, kind: unsold ? 'UNSOLD' : 'RECALLED', at: h.at,
      playerId: h.playerId, playerName: playerName(h.playerId), ...(h.reason ? { detail: h.reason } : {}) });
  }
  for (const turn of tail(room.retention?.turns))
    entries.push({ id: turn.id, kind: 'RETENTION', at: turn.at, teamId: turn.teamId, teamName: teamName(turn.teamId),
      amountCr: toCr(turn.spentUnits), detail: turn.kind === 'SKIPPED' ? 'SKIPPED' : `RETAINED:${turn.playerIds.length}` });
  return entries.sort((a, b) => b.at - a.at).slice(0, ACTIVITY_LIMIT);
}
/** Last bids of the active player, newest first. */
export function recentBids(room: Room) {
  const playerId = room.active?.playerId;
  if (!playerId) return [];
  return room.bids.filter(b => b.playerId === playerId).slice(-RECENT_BID_LIMIT).reverse().map(b => ({
    id: b.id, teamId: b.teamId, teamName: room.teams.find(t => t.id === b.teamId)?.name ?? '', amountCr: toCr(b.amountUnits), at: b.at }));
}
/** Live additions: counts, held ids and recent batches. Skipped and rejected rows are host-only. */
function poolAdditions(room: Room, isHost: boolean) {
  const held = heldIds(room);
  return {
    pendingCount: (room.addedQueue ?? []).length, followCount: followIds(room).length, heldCount: held.length,
    held: held.map(playerId => ({ playerId, potId: room.players.find(p => p.id === playerId)!.potId })),
    batches: (room.poolImports ?? []).slice(-20).reverse().map(b => ({ batchId: b.batchId, at: b.at, addedCount: b.addedPlayerIds.length, addedPlayerIds: b.addedPlayerIds,
      categoryCounts: b.categoryCounts, heldCount: b.heldCount, sourceFile: b.sourceFile, importedBy: b.by, totalRecords: b.totalRecords,
      skippedCount: b.skipped.length, rejectedCount: b.rejected.length, ...(isHost ? { skipped: b.skipped, rejected: b.rejected } : {}) })),
  };
}
/** Restore summary for restored rooms (null otherwise). Counts are the restored ones; purse and squad are live values. */
function restoreState(room: Room) {
  const restore = room.restore;
  if (!restore) return null;
  return {
    enabled: true, source: restore.source, snapshotName: restore.snapshotName, restoredAt: restore.restoredAt, warnings: restore.warnings,
    unclaimedCount: room.teams.filter(isUnclaimed).length,
    teams: room.teams.map(t => {
      const r = restore.teams.find(x => x.teamId === t.id);
      return { teamId: t.id, name: t.name, claimed: !isUnclaimed(t), purseCr: toCr(remainingBudget(t)), openingPurseCr: toCr(r?.purseUnits ?? t.startingBudgetUnits),
        squadSize: t.playerIds.length, remainingSlots: Math.max(0, room.settings.maxSquadSize - t.playerIds.length),
        retainedCount: r?.retainedCount ?? 0, auctionCount: r?.auctionCount ?? 0 };
    }),
  };
}
export interface TeamPresenceEntry { teamId: string; userId?: string; connected: boolean; lastSeenAt: number | null; managerUsername: string }

export function roomState(room: Room, userId: string, serverTime: number, connectedUsers: string[] = [], usernames: Record<string, string> = {},
  teamPresence?: TeamPresenceEntry[]) {
  const team = requireMember(room, userId);
  const player = room.players.find(p => p.id === room.active?.playerId);
  const next = minimumNextBid(room);
  return {
    room: { id: room.id, code: room.code, auctionName: room.auctionName, createdAt: room.createdAt },
    roomId: room.id, roomCode: room.code, settings: room.settings, status: room.status,
    host: { userId: room.hostUserId, teamId: room.teams.find(t => t.userId === room.hostUserId)?.id },
    currentPlayer: player ? publicPlayer(player) : null,
    skipVote: skipVoteState(room, userId), activationId: room.active?.activationId ?? null,
    activePotId: player?.potId ?? null, activePlayerId: player?.id ?? null,
    currentBidCr: room.active ? toCr(room.active.currentBidUnits) : null,
    highestBidderTeamId: room.active?.highestBidderTeamId ?? null,
    minimumNextBidCr: next === null ? null : toCr(next),
    maximumPermittedBidCr: publicTeam(team, room.settings, room.retention).maximumPermittedBidCr,
    startedAt: room.active?.startedAt ?? null, endsAt: room.active?.endsAt ?? null,
    remainingTimeMs: room.active?.remainingTimeMs ?? null, biddingOpen: room.active?.biddingOpen ?? false,
    lastBidAt: room.active?.lastBidAt ?? null, bidCount: room.active?.bidCount ?? 0,
    nextPlayerAt: room.nextPlayerAt, serverTime, sequence: room.sequence,
    // Each team entry includes the manager's username when known from active WebSocket connections.
    // Falls back to an empty string; the frontend uses a neutral "Manager" label in that case.
    teams: room.teams.map(t => ({ ...publicTeam(t, room.settings, room.retention, room.restore), managerUsername: usernames[t.userId] || t.managerUsername || '' })),
    currentUserTeam: { ...publicTeam(team, room.settings, room.retention, room.restore), managerUsername: usernames[team.userId] || team.managerUsername || '' }, connectedUsers,
    playerQueue: room.playerQueue, playerQueueSummary: { remaining: room.playerQueue.length + room.players.filter(p => p.status === 'WAITING').length, heldAdditions: heldIds(room).length },
    poolAdditions: poolAdditions(room, room.hostUserId === userId),
    players: room.players.map(publicPlayer),
    // Restored purchases have no auction price: priceCr is null and the historical price (retention only) is informational.
    soldPlayers: room.purchases.map(({ priceUnits, recordedPriceUnits, ...p }) => ({ ...p, acquisitionType: p.acquisitionType ?? 'AUCTION', isRetained: p.isRetained ?? false,
      priceCr: p.restoredFromSnapshot ? null : toCr(priceUnits),
      ...(p.restoredFromSnapshot ? { recordedPriceCr: recordedPriceUnits == null ? null : toCr(recordedPriceUnits) } : {}) })),
    restore: restoreState(room),
    retention: retentionState(room, team),
    unsoldPlayers: room.players.filter(p => p.status === 'UNSOLD').map(publicPlayer),
    activity: roomActivity(room), recentBids: recentBids(room), lastActivityAt: lastActivityOf(room),
    ongoingStatus: ongoingStatus(room), resumePath: resumePath(room),
    // Host-only; other viewers never receive per-team presence.
    ...(teamPresence && room.hostUserId === userId ? { teamPresence } : {}),
  };
}
