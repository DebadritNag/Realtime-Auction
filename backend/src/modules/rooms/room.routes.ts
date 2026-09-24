import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthContext } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
import { toCr } from '../../domain/money.js';
import { createRoomSchema, joinSchema, roomCodeSchema, settingsShape } from '../../schemas/settings.js';
import type { RoomManager } from './room.manager.js';
import { RoomService, requireMember } from './room.service.js';
import { roomState } from './room-state.js';
import { publicPlayer, publicTeam } from '../teams/team.service.js';
import { calculateResults } from '../results/result.service.js';
import type { AuctionRecommendationService } from '../recommendations/recommendation.service.js';
import type { RealtimeHub } from '../../realtime/hub.js';
declare module 'fastify' { interface FastifyRequest { auth: AuthContext } }
export function registerRoomRoutes(app: FastifyInstance, manager: RoomManager, recommendations: AuctionRecommendationService, hub: RealtimeHub): void {
  const service = new RoomService(manager);
  const params = z.object({ code: roomCodeSchema });
  const snapshot = async (code: string, userId: string) => roomState(await manager.loadRoom(code), userId, manager.clock.now(), hub.connectedUsers(code));
  app.post('/api/rooms', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const room = await manager.create(request.auth, createRoomSchema.parse(request.body));
    return reply.code(201).send({ roomId: room.id, roomCode: room.code, settings: room.settings,
      host: { userId: room.hostUserId, teamId: room.teams[0]!.id }, team: publicTeam(room.teams[0]!, room.settings) });
  });
  app.get('/api/rooms/:code', async request => {
    const room = await manager.loadRoom(params.parse(request.params).code);
    // Authenticated preview permits prospective joiners, but does not disclose budgets or history.
    return { roomId: room.id, roomCode: room.code, auctionName: room.auctionName, status: room.status,
      settings: room.settings, teamCount: room.teams.length, host: { userId: room.hostUserId } };
  });
  app.post('/api/rooms/:code/join', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async request => {
    const code = params.parse(request.params).code;
    const team = await service.join(code, request.auth.userId, joinSchema.parse(request.body), request.auth.username);
    const room = await manager.loadRoom(code);
    return { roomId: room.id, roomCode: code, team: publicTeam(team, room.settings), sequence: room.sequence };
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
    return { ...publicTeam(team, room.settings), players: room.players.filter(p => team.playerIds.includes(p.id)).map(publicPlayer) };
  });
  app.get('/api/rooms/:code/history', async request => {
    const room = await manager.loadRoom(params.parse(request.params).code);
    requireMember(room, request.auth.userId);
    const { offset, limit } = z.object({ offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(200).default(50) }).strict().parse(request.query);
    return { sequence: room.sequence, total: room.bids.length, offset, limit,
      bids: room.bids.slice(offset, offset + limit).map(({ amountUnits, ...bid }) => ({ ...bid, amountCr: toCr(amountUnits) })) };
  });
  app.get('/api/rooms/:code/recommendation', async request => {
    const room = await manager.loadRoom(params.parse(request.params).code);
    const recommendation = await recommendations.recommend(room, requireMember(room, request.auth.userId));
    return { ...recommendation, sequence: room.sequence, serverTime: manager.clock.now(), playerId: room.active?.playerId };
  });
}
