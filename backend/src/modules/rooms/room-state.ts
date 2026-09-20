import type { Room } from '../../domain/types.js';
import { toCr } from '../../domain/money.js';
import { minimumNextBid } from '../auction/bid.service.js';
import { publicPlayer, publicTeam } from '../teams/team.service.js';
import { requireMember } from './room.service.js';
export function roomState(room: Room, userId: string, serverTime: number, connectedUsers: string[] = [], usernames: Record<string, string> = {}) {
  const team = requireMember(room, userId);
  const player = room.players.find(p => p.id === room.active?.playerId);
  const next = minimumNextBid(room);
  return {
    room: { id: room.id, code: room.code, auctionName: room.auctionName, createdAt: room.createdAt },
    roomId: room.id, roomCode: room.code, settings: room.settings, status: room.status,
    host: { userId: room.hostUserId, teamId: room.teams.find(t => t.userId === room.hostUserId)?.id },
    currentPlayer: player ? publicPlayer(player) : null,
    activePotId: player?.potId ?? null, activePlayerId: player?.id ?? null,
    currentBidCr: room.active ? toCr(room.active.currentBidUnits) : null,
    highestBidderTeamId: room.active?.highestBidderTeamId ?? null,
    minimumNextBidCr: next === null ? null : toCr(next),
    maximumPermittedBidCr: publicTeam(team, room.settings).maximumPermittedBidCr,
    startedAt: room.active?.startedAt ?? null, endsAt: room.active?.endsAt ?? null,
    remainingTimeMs: room.active?.remainingTimeMs ?? null, biddingOpen: room.active?.biddingOpen ?? false,
    lastBidAt: room.active?.lastBidAt ?? null, bidCount: room.active?.bidCount ?? 0,
    nextPlayerAt: room.nextPlayerAt, serverTime, sequence: room.sequence,
    // Each team entry includes the manager's username when known from active WebSocket connections.
    // Falls back to an empty string; the frontend uses a neutral "Manager" label in that case.
    teams: room.teams.map(t => ({ ...publicTeam(t, room.settings), managerUsername: usernames[t.userId] ?? '' })),
    currentUserTeam: { ...publicTeam(team, room.settings), managerUsername: usernames[team.userId] ?? '' }, connectedUsers,
    playerQueue: room.playerQueue, playerQueueSummary: { remaining: room.playerQueue.length },
    players: room.players.map(publicPlayer),
    soldPlayers: room.purchases.map(({ priceUnits, ...p }) => ({ ...p, priceCr: toCr(priceUnits) })),
    unsoldPlayers: room.players.filter(p => p.status === 'UNSOLD').map(publicPlayer),
  };
}
