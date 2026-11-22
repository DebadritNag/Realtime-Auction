import type {NegotiationDialogueProvider} from './modules/manager-mode/negotiation/dialogue.provider.js';
import { ManagerModeService } from './modules/manager-mode/manager.service.js';
import { registerManagerRoutes } from './modules/manager-mode/manager.routes.js';
import { UnavailableManagerRepository, type ManagerTournamentRepository, type ManagerIdentityRepository } from './modules/manager-mode/manager.repository.js';
import Fastify from 'fastify';
import { registerPlayerRoutes } from './modules/players/player.routes.js';
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
import { CatalogPlayerRepository } from './modules/players/player.service.js';
import { RoomManager } from './modules/rooms/room.manager.js';
import { AuctionEngine } from './modules/auction/auction.engine.js';
import { TimerService, systemClock, type Clock } from './modules/auction/timer.service.js';
import { DeterministicRecommendationService, type AuctionRecommendationService } from './modules/recommendations/recommendation.service.js';
import { RealtimeHub } from './realtime/hub.js';
import type { PresenceStore } from './realtime/presence.js';
import { registerRoomRoutes } from './modules/rooms/room.routes.js';
import { registerRestoreRoutes } from './modules/restore/restore.routes.js';
import type { Fc26Catalog } from './modules/fc26/fc26.catalog.js';
import { registerFc26Routes } from './modules/fc26/fc26.routes.js';
import { registerPoolImportRoutes } from './modules/auction/pool-import/pool-import.routes.js';
import { hasRetentionEvents, type RetentionLedger } from './modules/retention/retention.ledger.js';

export interface AppOptions {
  negotiationDialogue?: NegotiationDialogueProvider;
  managerAuctionSource?: (id:string)=>Promise<import('./domain/types.js').Room|null>; managerPrepareAuction?: (id:string,user:string)=>Promise<void>;
  managerRepository?: ManagerTournamentRepository; managerIdentities?: ManagerIdentityRepository;
  database?: Sql; authService: AuthService; repository?: RoomRepository; playerRepository?: PlayerRepository;
  recommendationService?: AuctionRecommendationService; origins?: string[]; fc26?: Fc26Catalog; retentionLedger?: RetentionLedger;
  clock?: Clock; timersEnabled?: boolean; logger?: boolean; logLevel?: string; logStream?: { write(message: string): void }; trustProxyHops?: number; presenceStore?: PresenceStore;
}
export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logger === false ? false : { level: options.logLevel ?? 'info', ...(options.logStream ? { stream: options.logStream } : {}),
      // Never serialize the URL query, headers, request body or raw token-bearing errors.
      serializers: { req: request => ({ method: request.method, url: request.url?.split('?')[0], id: request.id }),
        err: error => ({ type: error.name, code: error.code, message: 'Request error', stack: '' }) },
      redact: ['req.headers.authorization', 'token', 'password'] },
    bodyLimit: 16 * 1024, requestTimeout: 15_000, trustProxy: (options.trustProxyHops ?? 0) > 0 ? (_address: string, hop: number) => hop < (options.trustProxyHops ?? 0) : false,
  });
  const origins = options.origins ?? ['http://localhost:3000', 'http://localhost:5173'];
  await app.register(cors, { origin: origins, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => Object.assign(new Error('Rate limit exceeded.'), { statusCode: 429, retryAfterSeconds: Math.max(1, Math.ceil(context.ttl / 1000)) }) });
  await app.register(websocket, { options: { maxPayload: 16 * 1024, perMessageDeflate: false,
    // Only the fixed marker protocol is ever selected; the bearer entry is never echoed back.
    handleProtocols: (protocols: Set<string>) => protocols.has('auction.v1') ? 'auction.v1' : false } });
  const clock = options.clock ?? systemClock;
  const auctionRepository = options.repository ?? new MemoryRoomRepository();
  const managerMode = new ManagerModeService(options.managerRepository ?? new UnavailableManagerRepository(), options.managerAuctionSource ?? (async id => (await auctionRepository.listRecoverable()).find(r => r.id === id) ?? null), options.managerIdentities, options.managerPrepareAuction, options.negotiationDialogue,app.log);
  const manager = new RoomManager(auctionRepository,
    options.playerRepository ?? await CatalogPlayerRepository.fromDefaultPool(), clock, undefined, undefined, options.fc26);
  const engine = new AuctionEngine(manager);
  const timers = new TimerService(clock, (code, id) => engine.onTimer(code, id),
    (_error, roomCode) => app.log.error({ roomCode, eventType: 'TIMER_RETRY' }, 'Timer transition failed; retrying'));
  const unsubscribe = manager.subscribe((room, events) => {
    // A pool-only commit leaves endsAt and nextPlayerAt untouched, so the armed timer stays as it is.
    if (options.timersEnabled !== false && !events.every(e => e.type === 'PLAYER_POOL_UPDATED')) timers.schedule(room);
    app.log.info({ roomId: room.id, sequence: room.sequence, status: room.status, eventTypes: events.map(e => e.type) }, 'Room committed');
    // Write-behind: the room snapshot is authoritative; ledger failures never reach the commit.
    if (options.retentionLedger && hasRetentionEvents(events)) void options.retentionLedger.sync(room).catch(() => undefined);
  });
  const hub = new RealtimeHub(manager, engine, app.log, managerMode, options.presenceStore);
  const recovered = await manager.recover();
  if (options.retentionLedger) for (const room of recovered) if (room.retention) void options.retentionLedger.sync(room).catch(() => undefined);
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
      // Browser clients send Sec-WebSocket-Protocol: auction.v1, bearer.<jwt>; the ?token= query is deprecated.
      const offered = String(request.headers['sec-websocket-protocol'] ?? '').split(',').map(s => s.trim()).find(s => s.startsWith('bearer.'));
      if (!token && offered) {
        requireThat(String(request.headers['sec-websocket-protocol']).split(',').some(s => s.trim() === 'auction.v1'), 'UNAUTHENTICATED', 'Unsupported websocket protocol.', 400);
        token = offered.slice(7);
      }
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
    if (status === 429) {
      const retryAfterSeconds = Math.max(1, Number((error as { retryAfterSeconds?: number }).retryAfterSeconds) || Number(reply.getHeader('retry-after')) || 1);
      app.log.warn({ eventType: 'RATE_LIMITED', route: request.routeOptions.url, method: request.method, retryAfterSeconds }, 'Rate limit exceeded');
      return reply.code(429).header('retry-after', String(retryAfterSeconds)).send({ error: { code: 'RATE_LIMITED', message: 'Request rejected.', retryAfterSeconds }, requestId: request.id });
    }
    return reply.code(status).send({ error: { code: status < 500 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR',
      message: status < 500 ? 'Request rejected.' : 'Unable to process request.' }, requestId: request.id });
  });
  app.get('/api/health', async () => ({ status: 'ok', serverTime: clock.now() }));
  registerManagerRoutes(app, managerMode);
  registerProfileRoutes(app, manager, options.database);
  registerPlayerRoutes(app, manager.players, manager.fc26);
  registerFc26Routes(app, manager.fc26, manager);
  registerPoolImportRoutes(app, manager);
  registerRestoreRoutes(app, manager);
  registerRoomRoutes(app, manager, options.recommendationService ?? new DeterministicRecommendationService(), hub);
  app.get('/ws', { websocket: true }, (socket, request) => hub.attach(socket, request.auth));
  app.addHook('onClose', async () => { hub.close(); timers.close(); unsubscribe(); });
  return { app, managerMode, manager, engine, timers, hub };
}
