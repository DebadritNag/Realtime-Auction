import Fastify from 'fastify';
import type { Sql } from 'postgres';
import { registerProfileRoutes } from './modules/profile/profile.routes.js';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { ZodError, z } from 'zod';
import { DomainError, requireThat } from './domain/errors.js';
import type { AuthService } from './modules/auth-context/auth.service.js';
import type { PlayerRepository, RoomRepository } from './repositories/interfaces.js';
import { MemoryRoomRepository } from './repositories/memory.js';
import { CatalogPlayerRepository, demoPlayers } from './modules/players/player.service.js';
import { RoomManager } from './modules/rooms/room.manager.js';
import { AuctionEngine } from './modules/auction/auction.engine.js';
import { TimerService, systemClock, type Clock } from './modules/auction/timer.service.js';
import { DeterministicRecommendationService, type AuctionRecommendationService } from './modules/recommendations/recommendation.service.js';
import { RealtimeHub } from './realtime/hub.js';
import { registerRoomRoutes } from './modules/rooms/room.routes.js';

export interface AppOptions {
  database?: Sql; authService: AuthService; repository?: RoomRepository; playerRepository?: PlayerRepository;
  recommendationService?: AuctionRecommendationService; origins?: string[];
  clock?: Clock; timersEnabled?: boolean; logger?: boolean; logLevel?: string;
}
export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logger === false ? false : { level: options.logLevel ?? 'info',
      // Never serialize the URL query, headers, request body or raw token-bearing errors.
      serializers: { req: request => ({ method: request.method, url: request.url?.split('?')[0], id: request.id }),
        err: error => ({ type: error.name, code: error.code, message: 'Request error', stack: '' }) },
      redact: ['req.headers.authorization', 'token', 'password'] },
    bodyLimit: 16 * 1024, requestTimeout: 15_000, trustProxy: false,
  });
  const origins = options.origins ?? ['http://localhost:3000', 'http://localhost:5173'];
  await app.register(cors, { origin: origins, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'] });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(websocket, { options: { maxPayload: 16 * 1024, perMessageDeflate: false } });
  const clock = options.clock ?? systemClock;
  const manager = new RoomManager(options.repository ?? new MemoryRoomRepository(),
    options.playerRepository ?? new CatalogPlayerRepository(demoPlayers), clock);
  const engine = new AuctionEngine(manager);
  const timers = new TimerService(clock, (code, id) => engine.onTimer(code, id),
    (_error, roomCode) => app.log.error({ roomCode, eventType: 'TIMER_RETRY' }, 'Timer transition failed; retrying'));
  const unsubscribe = manager.subscribe((room, events) => {
    if (options.timersEnabled !== false) timers.schedule(room);
    app.log.info({ roomId: room.id, sequence: room.sequence, status: room.status, eventTypes: events.map(e => e.type) }, 'Room committed');
  });
  const hub = new RealtimeHub(manager, engine, app.log);
  const recovered = await manager.recover();
  if (options.timersEnabled !== false) for (const room of recovered) timers.schedule(room);
  app.decorateRequest('auth');
  app.addHook('preValidation', async request => {
    if (request.routeOptions.url === '/api/health' || request.method === 'OPTIONS') return;
    const isSocket = request.routeOptions.url === '/ws';
    const origin = request.headers.origin;
    requireThat(isSocket ? Boolean(origin && origins.includes(origin)) : !origin || origins.includes(origin),
      'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed.', 403);
    let token: string | undefined;
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) token = authorization.slice(7);
    if (isSocket) {
      const query = z.object({ token: z.string().min(1).max(8192).optional() }).strict().parse(request.query);
      token ??= query.token;
    }
    requireThat(token && token.length <= 8192, 'UNAUTHENTICATED', 'Bearer access token required.', 401);
    request.auth = await options.authService.verifyAccessToken(token);
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, ...error.details }, requestId: request.id });
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request.',
      issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) }, requestId: request.id });
    const errorStatus = (error as { statusCode?: number }).statusCode;
    const status = errorStatus && errorStatus >= 400 && errorStatus < 500 ? errorStatus : 500;
    if (status === 500) app.log.error({ requestId: request.id, eventType: 'REQUEST_FAILED' }, 'Request failed');
    return reply.code(status).send({ error: { code: status === 429 ? 'RATE_LIMITED' : status < 500 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR',
      message: status < 500 ? 'Request rejected.' : 'Unable to process request.' }, requestId: request.id });
  });
  app.get('/api/health', async () => ({ status: 'ok', serverTime: clock.now() }));
  registerProfileRoutes(app, manager, options.database);
  registerRoomRoutes(app, manager, options.recommendationService ?? new DeterministicRecommendationService(), hub);
  app.get('/ws', { websocket: true }, (socket, request) => hub.attach(socket, request.auth));
  app.addHook('onClose', async () => { hub.close(); timers.close(); unsubscribe(); });
  return { app, manager, engine, timers, hub };
}
