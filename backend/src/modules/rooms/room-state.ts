import type { Room } from '../../domain/types.js';
import { toCr } from '../../domain/money.js';
import { minimumNextBid } from '../auction/bid.service.js';
import { publicPlayer, publicTeam } from '../teams/team.service.js';
import { skipVoteState } from '../auction/skip-vote.service.js';
import { requireMember } from './room.service.js';
import { RETENTION_MAX_PER_TEAM, RETENTION_MIN_PER_TEAM, RETENTION_PRICE_CR } from '../../domain/retention.js';
import { retentionPhase } from '../retention/retention.service.js';

function retentionState(room: Room) {
  const picks = room.retention?.picks ?? [];
  return {
    enabled: room.settings.retention.enabled,
    config: { priceCr: RETENTION_PRICE_CR, maxPerTeam: RETENTION_MAX_PER_TEAM, minPerTeam: RETENTION_MIN_PER_TEAM },
    phase: retentionPhase(room),
    picks: picks.map(pick => {
      const player = room.players.find(p => p.id === pick.playerId);
      return { id: pick.id, teamId: pick.teamId, playerId: pick.playerId, priceCr: toCr(pick.priceUnits), at: pick.at, player: player ? publicPlayer(player) : null };
    }),
    teams: room.teams.map(t => {
      const own = picks.filter(p => p.teamId === t.id);
      const spent = own.reduce((sum, p) => sum + p.priceUnits, 0);
      return { teamId: t.id, retainedCount: own.length, remainingSlots: Math.max(0, RETENTION_MAX_PER_TEAM - own.length),
        spentCr: toCr(spent), remainingPurseCr: toCr(t.startingBudgetUnits - t.spentUnits) };
    }),
    totals: { retained: picks.length, spentCr: toCr(picks.reduce((sum, p) => sum + p.priceUnits, 0)) },
    finalizedAt: room.retention?.finalizedAt ?? null,
  };
}
export function roomState(room: Room, userId: string, serverTime: number, connectedUsers: string[] = [], usernames: Record<string, string> = {}) {
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
    teams: room.teams.map(t => ({ ...publicTeam(t, room.settings, room.retention), managerUsername: usernames[t.userId] ?? '' })),
    currentUserTeam: { ...publicTeam(team, room.settings, room.retention), managerUsername: usernames[team.userId] ?? '' }, connectedUsers,
    playerQueue: room.playerQueue, playerQueueSummary: { remaining: room.playerQueue.length + room.players.filter(p => p.status === 'WAITING').length },
    players: room.players.map(publicPlayer),
    soldPlayers: room.purchases.map(({ priceUnits, ...p }) => ({ ...p, acquisitionType: p.acquisitionType ?? 'AUCTION', isRetained: p.isRetained ?? false, priceCr: toCr(priceUnits) })),
    retention: retentionState(room),
    unsoldPlayers: room.players.filter(p => p.status === 'UNSOLD').map(publicPlayer),
  };
}
