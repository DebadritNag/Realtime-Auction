import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthContext } from '../../domain/types.js';
import { DomainError, requireThat } from '../../domain/errors.js';
import { toCr } from '../../domain/money.js';
import { createRoomSchema, joinSchema, restoredJoinSchema, roomCodeSchema, settingsShape } from '../../schemas/settings.js';
import { isUnclaimed } from '../restore/restore.claims.js';
import type { RoomManager } from './room.manager.js';
import { RoomService, requireMember } from './room.service.js';
import { roomState } from './room-state.js';
import { roomDetails, roomSummary } from './room-summary.js';
import { publicPlayer, publicTeam } from '../teams/team.service.js';
import { calculateResults } from '../results/result.service.js';
import type { AuctionRecommendationService } from '../recommendations/recommendation.service.js';
import type { RealtimeHub } from '../../realtime/hub.js';
declare module 'fastify' { interface FastifyRequest { auth: AuthContext } }
export function registerRoomRoutes(app: FastifyInstance, manager: RoomManager, recommendations: AuctionRecommendationService, hub: RealtimeHub): void {
  const service = new RoomService(manager);
  const params = z.object({ code: roomCodeSchema });
  const snapshot = async (code: string, userId: string) => {
    const room = await manager.loadRoom(code);
    return roomState(room, userId, manager.clock.now(), hub.connectedUsers(code), {}, await hub.hostTeamPresence(room, userId));
  };
  const memberOf = (room: Awaited<ReturnType<RoomManager['loadRoom']>>, userId: string) => {
    requireThat(room.teams.some(t => t.userId === userId), 'NOT_ROOM_MEMBER',
      'You are not a member of this auction. Use Join Auction Room to join a lobby.', 403);
  };
  const presenceOf = (room: Awaited<ReturnType<RoomManager['loadRoom']>>) => hub.presenceFor(room.code);
  // Ongoing auctions of the caller: summaries only, never snapshots. COMPLETED and CLOSED rooms are excluded by the repository.
  app.get('/api/me/rooms', async request => {
    const now = manager.clock.now();
    const rooms = await manager.repository.listOngoingForUser(request.auth.userId);
    const summaries = rooms.filter(r => r.status !== 'COMPLETED' && r.status !== 'CLOSED').map(r => roomSummary(r, request.auth.userId, now))
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    return { rooms: summaries, serverTime: now };
  });
  app.get('/api/rooms/:code/summary', async request => {
    const room = await manager.loadRoom(params.parse(request.params).code);
    memberOf(room, request.auth.userId);
    return roomDetails(room, request.auth.userId, manager.clock.now(), await presenceOf(room));
  });
  // Read-only and idempotent: reconnects an existing member to the room they already belong to. Never creates a team.
  app.post('/api/rooms/:code/rejoin', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async request => {
    z.object({}).strict().parse(request.body ?? {});
    const room = await manager.loadRoom(params.parse(request.params).code);
    memberOf(room, request.auth.userId);
    if (room.status === 'CLOSED') throw new DomainError('ROOM_CLOSED', 'This auction was cancelled.', 409);
    return roomSummary(room, request.auth.userId, manager.clock.now());
  });
  app.post('/api/rooms', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const room = await manager.create(request.auth, createRoomSchema.parse(request.body));
    return reply.code(201).send({ roomId: room.id, roomCode: room.code, settings: room.settings,
      host: { userId: room.hostUserId, teamId: room.teams[0]!.id }, team: publicTeam(room.teams[0]!, room.settings) });
  });
  app.get('/api/rooms/:code', async request => {
    const room = await manager.loadRoom(params.parse(request.params).code);
    // Authenticated preview permits prospective joiners, but does not disclose budgets or history.
    return { roomId: room.id, roomCode: room.code, auctionName: room.auctionName, status: room.status,
      settings: room.settings, teamCount: room.teams.length, host: { userId: room.hostUserId },
      // Restored rooms list their teams so a joining manager can claim one; no budgets, rosters or user ids.
      ...(room.restore ? { restore: { snapshotName: room.restore.snapshotName, teams: room.teams.map(t => ({ id: t.id, name: t.name, claimed: !isUnclaimed(t) })) } } : {}) };
  });
  app.post('/api/rooms/:code/join', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async request => {
    const code = params.parse(request.params).code;
    // A body with restoredTeamId claims a restored team; every other body keeps the original strict contract.
    const body = request.body && typeof request.body === 'object' && 'restoredTeamId' in request.body ? restoredJoinSchema.parse(request.body) : joinSchema.parse(request.body);
    const team = await service.join(code, request.auth.userId, body, request.auth.username);
    const room = await manager.loadRoom(code);
    return { roomId: room.id, roomCode: code, team: publicTeam(team, room.settings, room.retention, room.restore), sequence: room.sequence };
  });
  app.post('/api/rooms/:code/leave', async (request, reply) => {
    z.object({}).strict().parse(request.body ?? {});
    await service.leave(params.parse(request.params).code, request.auth.userId);
    return reply.code(204).send();
  });
  app.patch('/api/rooms/:code/settings', async request => {
    const code = params.parse(request.params).code;
    await service.updateSettings(code, request.auth.userId, settingsShape.partial().parse(request.body));
    return snapshot(code, request.auth.userId);
  });
  app.get('/api/rooms/:code/state', async request => snapshot(params.parse(request.params).code, request.auth.userId));
  app.get('/api/rooms/:code/results', async request => {
    const room = await manager.loadRoom(params.parse(request.params).code);
    requireMember(room, request.auth.userId);
    return calculateResults(room);
  });
  app.get('/api/rooms/:code/teams/:teamId', async request => {
    const input = params.extend({ teamId: z.string().uuid() }).parse(request.params);
    const room = await manager.loadRoom(input.code);
    requireMember(room, request.auth.userId);
    const team = room.teams.find(t => t.id === input.teamId);
    requireThat(team, 'TEAM_NOT_FOUND', 'Team does not exist.', 404);
    return { ...publicTeam(team, room.settings, room.retention, room.restore), players: room.players.filter(p => team.playerIds.includes(p.id)).map(p => {
      const purchase = room.purchases.find(x => x.playerId === p.id && x.teamId === team.id);
      return { ...publicPlayer(p), acquisitionType: purchase?.acquisitionType ?? 'AUCTION', isRetained: purchase?.isRetained ?? false,
        acquiredByTeamId: team.id, acquisitionPriceCr: purchase && !purchase.restoredFromSnapshot ? toCr(purchase.priceUnits) : null,
        ...(purchase?.restoredFromSnapshot ? { restoredFromSnapshot: true, recordedPriceCr: purchase.recordedPriceUnits == null ? null : toCr(purchase.recordedPriceUnits) } : {}) };
    }) };
  });
  app.get('/api/rooms/:code/history', async request => {
    const room = await manager.loadRoom(params.parse(request.params).code);
    requireMember(room, request.auth.userId);
    const { offset, limit } = z.object({ offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(200).default(50) }).strict().parse(request.query);
    return { sequence: room.sequence, total: room.bids.length, offset, limit,
      bids: room.bids.slice(offset, offset + limit).map(({ amountUnits, ...bid }) => ({ ...bid, amountCr: toCr(amountUnits) })) };
  });
  // One computation per room+team+sequence+active player; concurrent callers share the in-flight promise.
  const recommendationCache = new Map<string, { sequence: number; playerId: string | undefined; value: ReturnType<AuctionRecommendationService['recommend']> }>();
  app.get('/api/rooms/:code/recommendation', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async request => {
    const room = await manager.loadRoom(params.parse(request.params).code);
    const team = requireMember(room, request.auth.userId);
    const key = room.code + ':' + team.id;
    const playerId = room.active?.playerId;
    let entry = recommendationCache.get(key);
    if (!entry || entry.sequence !== room.sequence || entry.playerId !== playerId) {
      const value = recommendations.recommend(room, team);
      entry = { sequence: room.sequence, playerId, value };
      recommendationCache.delete(key);
      recommendationCache.set(key, entry);
      if (recommendationCache.size > 500) recommendationCache.delete(recommendationCache.keys().next().value!);
      const created = entry;
      value.catch(() => { if (recommendationCache.get(key) === created) recommendationCache.delete(key); });
    }
    const recommendation = await entry.value;
    return { ...recommendation, sequence: room.sequence, serverTime: manager.clock.now(), playerId };
  });
}
