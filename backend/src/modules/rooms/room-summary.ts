import type { Room } from '../../domain/types.js';
import { toCr } from '../../domain/money.js';
import { publicTeam } from '../teams/team.service.js';
import { retentionPhase } from '../retention/retention.service.js';
import { isUnclaimed } from '../restore/restore.claims.js';

export type OngoingStatus = 'NOT_STARTED' | 'WAITING_FOR_TEAMS' | 'RETENTION_IN_PROGRESS' | 'READY_TO_START'
  | 'LIVE_AUCTION' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

/** Server-side status mapping; the client never derives it. */
export function ongoingStatus(room: Room): OngoingStatus {
  if (room.status === 'CLOSED') return 'CANCELLED';
  if (room.status === 'COMPLETED') return 'COMPLETED';
  if (room.status === 'PAUSED') return 'PAUSED';
  if (room.status === 'STARTING' || room.status === 'RUNNING') return 'LIVE_AUCTION';
  const phase = retentionPhase(room);
  if (phase === 'TEAM_SELECTING' || phase === 'ALL_TEAMS_COMPLETED') return 'RETENTION_IN_PROGRESS';
  const enough = room.teams.length >= room.settings.minimumParticipants;
  if (!enough) return room.teams.length <= 1 ? 'NOT_STARTED' : 'WAITING_FOR_TEAMS';
  if (room.restore && room.teams.some(isUnclaimed)) return 'WAITING_FOR_TEAMS';
  return phase === 'OFF' || phase === 'FINALIZED' ? 'READY_TO_START' : 'NOT_STARTED';
}

/** Where the client should open this auction. COMPLETED goes to the read-only results page. */
export function resumePath(room: Room): string {
  const code = room.code;
  if (room.status === 'COMPLETED' || room.status === 'CLOSED') return `/results/${code}`;
  if (room.status === 'LOBBY') {
    const phase = retentionPhase(room);
    return phase === 'TEAM_SELECTING' || phase === 'ALL_TEAMS_COMPLETED' ? `/room/${code}/retention` : `/room/${code}`;
  }
  return `/auction/${code}`;
}

export const lastActivityOf = (room: Room): number => room.lastActivityAt ?? room.createdAt;

const remainingIds = (room: Room): Set<string> => {
  const ids = new Set<string>(room.players.filter(p => p.status === 'WAITING').map(p => p.id));
  for (const id of room.playerQueue) ids.add(id);
  if (room.active) ids.add(room.active.playerId);
  return ids;
};

/** Compact, snapshot-free description of one room for the viewer. Never includes players, bids or receipts arrays. */
export function roomSummary(room: Room, userId: string, now: number) {
  const status = ongoingStatus(room);
  const team = room.teams.find(t => t.userId === userId) ?? null;
  const player = room.active ? room.players.find(p => p.id === room.active!.playerId) ?? null : null;
  const phase = retentionPhase(room);
  const order = room.retention?.order ?? [];
  const activeTeam = room.teams.find(t => t.id === room.retention?.activeTeamId);
  const retained = room.purchases.filter(p => p.acquisitionType === 'RETENTION').length;
  const hasPool = room.players.length > 0;
  const endsAt = room.active?.endsAt ?? null;
  const remainingTimeMs = !room.active ? null
    : room.active.remainingTimeMs ?? (room.active.biddingOpen && endsAt !== null ? Math.max(0, endsAt - now) : null);
  const bidder = room.active?.highestBidderTeamId ? room.teams.find(t => t.id === room.active!.highestBidderTeamId) : undefined;
  return {
    roomId: room.id, roomCode: room.code, auctionName: room.auctionName,
    ongoingStatus: status, rawStatus: room.status,
    retention: phase === 'OFF' ? null : { phase, activeTeamName: activeTeam?.name ?? null,
      completed: room.retention?.turns?.length ?? 0, total: order.length },
    teamCount: room.teams.length, capacity: room.settings.numberOfTeams,
    role: { isHost: room.hostUserId === userId, teamId: team?.id ?? null, teamName: team?.name ?? null },
    round: player?.round ?? null, category: player?.potId ?? null,
    currentPlayer: player && room.active ? { id: player.id, name: player.name, position: player.position, potId: player.potId,
      currentBidCr: toCr(room.active.currentBidUnits), highestBidderTeamName: bidder?.name ?? null, endsAt, remainingTimeMs } : null,
    playersSold: room.purchases.filter(p => p.acquisitionType !== 'RETENTION').length,
    playersRetained: retained,
    playersUnsold: room.players.filter(p => p.status === 'UNSOLD').length,
    playersRemaining: hasPool ? remainingIds(room).size : null,
    lastActivityAt: lastActivityOf(room), createdAt: room.createdAt,
    canContinue: status !== 'COMPLETED' && status !== 'CANCELLED',
    resumePath: resumePath(room),
    serverTime: now,
  };
}

/** Summary plus per-team rows. `lastSeenAt` is only visible to the host. */
export function roomDetails(room: Room, userId: string, now: number, presence: Record<string, { connected: boolean; lastSeenAt: number | null }> = {}) {
  const isHost = room.hostUserId === userId;
  return {
    ...roomSummary(room, userId, now),
    teams: room.teams.map(t => {
      const pub = publicTeam(t, room.settings, room.retention);
      return { id: t.id, name: t.name, managerUsername: t.managerUsername ?? '', isHost: t.userId === room.hostUserId,
        remainingBudgetCr: pub.remainingBudgetCr, playersOwned: pub.playersOwned, retainedCount: pub.retainedCount,
        connected: presence[t.userId]?.connected ?? false,
        ...(isHost ? { lastSeenAt: presence[t.userId]?.lastSeenAt ?? null } : {}) };
    }),
  };
}
