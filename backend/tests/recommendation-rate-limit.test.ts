import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { readEnvironment } from '../src/config/env.js';
import { StaticTokenAuthService } from '../src/modules/auth-context/auth.service.js';
import { CatalogPlayerRepository, demoPlayers } from '../src/modules/players/player.service.js';
import { DeterministicRecommendationService } from '../src/modules/recommendations/recommendation.service.js';
import { MemoryRoomRepository } from '../src/repositories/memory.js';
import { PostgresLiveRoomRepository } from '../src/repositories/postgres-live.js';
import { RoomManager } from '../src/modules/rooms/room.manager.js';
import { FakeLiveSql } from './helpers-pg-double.js';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
const users = ['host', 'a', 'b', 'outsider'];
const auth = new StaticTokenAuthService(new Map(users.map(id => [id + '-token', { userId: id }])));

async function app(opts: { trustProxyHops?: number; repository?: MemoryRoomRepository; recommend?: () => void } = {}) {
  const real = new DeterministicRecommendationService();
  const recommendationService = { recommend: async (...args: Parameters<typeof real.recommend>) => { opts.recommend?.(); await new Promise(r => setTimeout(r, 20)); return real.recommend(...args); } };
  const built = await buildApp({ authService: auth, logger: false, timersEnabled: false, trustProxyHops: opts.trustProxyHops,
    repository: opts.repository, recommendationService, clock: { now: () => Date.now() },
    playerRepository: new CatalogPlayerRepository(demoPlayers.slice(0, 2)) });
  cleanup.push(() => built.app.close());
  await built.app.ready();
  const rest = (user: string, method: 'GET' | 'POST', url: string, payload?: object, headers: Record<string, string> = {}) => built.app.inject({
    method, url, headers: { authorization: 'Bearer ' + user + '-token', ...headers }, ...(payload ? { payload } : {}) });
  const create = async () => (await rest('host', 'POST', '/api/rooms', { auctionName: 'Cup', teamName: 'Host FC',
    settings: { numberOfTeams: 3, minimumParticipants: 3, minSquadSize: 1, maxSquadSize: 3, playerTimerSeconds: 10, autoAdvance: false } })).json<{ roomCode: string }>().roomCode;
  const start = async () => {
    const code = await create();
    await rest('a', 'POST', `/api/rooms/${code}/join`, { teamName: 'A FC' });
    await rest('b', 'POST', `/api/rooms/${code}/join`, { teamName: 'B FC' });
    await built.engine.execute(code, 'host', { type: 'START_AUCTION', payload: { roomCode: code } } as never);
    return code;
  };
  return { ...built, rest, create, start };
}

describe('recommendation endpoint', () => {
  it('computes once for concurrent requests of the same room, team and sequence, and per team', async () => {
    const recommend = vi.fn();
    const t = await app({ recommend });
    const code = await t.start();
    const responses = await Promise.all(Array.from({ length: 8 }, () => t.rest('a', 'GET', `/api/rooms/${code}/recommendation`)));
    expect(responses.every(r => r.statusCode === 200)).toBe(true);
    expect(recommend).toHaveBeenCalledTimes(1);
    expect((await t.rest('a', 'GET', `/api/rooms/${code}/recommendation`)).statusCode).toBe(200);
    expect(recommend).toHaveBeenCalledTimes(1);
    expect((await t.rest('b', 'GET', `/api/rooms/${code}/recommendation`)).statusCode).toBe(200);
    expect(recommend).toHaveBeenCalledTimes(2);
  });

  it('recomputes when the room sequence changes', async () => {
    const recommend = vi.fn();
    const t = await app({ recommend });
    const code = await t.start();
    await t.rest('a', 'GET', `/api/rooms/${code}/recommendation`);
    const room = await t.manager.loadRoom(code);
    const minimum = room.active!.currentBidUnits;
    await t.engine.execute(code, 'b', { type: 'PLACE_BID', payload: { roomCode: code, amountCr: minimum / 10_000_000 + 1 } } as never).catch(() => undefined);
    const after = await t.manager.loadRoom(code);
    await t.rest('a', 'GET', `/api/rooms/${code}/recommendation`);
    expect(recommend).toHaveBeenCalledTimes(after.sequence === room.sequence ? 1 : 2);
  });

  it('keeps ROOM_NOT_FOUND 404, NOT_ROOM_MEMBER 403 and NO_ACTIVE_PLAYER 409 distinct', async () => {
    const t = await app();
    const missing = await t.rest('a', 'GET', '/api/rooms/ZZZZZZ/recommendation');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('ROOM_NOT_FOUND');
    const code = await t.create();
    expect((await t.rest('outsider', 'GET', `/api/rooms/${code}/recommendation`)).statusCode).toBe(403);
    const lobby = await t.rest('host', 'GET', `/api/rooms/${code}/recommendation`);
    expect(lobby.statusCode).toBe(409);
    expect(lobby.json().error.code).toBe('NO_ACTIVE_PLAYER');
  });

  it('returns Retry-After and a RATE_LIMITED body when the route limit is exceeded', async () => {
    const t = await app();
    const code = await t.start();
    let limited;
    for (let i = 0; i < 70 && !limited; i++) {
      const r = await t.rest('a', 'GET', `/api/rooms/${code}/recommendation`);
      if (r.statusCode === 429) limited = r;
    }
    expect(limited).toBeDefined();
    expect(Number(limited!.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    const body = limited!.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(body)).not.toContain('token');
  });

  it('gives distinct clients behind one proxy separate buckets only when proxy hops are trusted', async () => {
    const untrustedApp = await app({ trustProxyHops: 0 });
    for (let i = 0; i < 125; i++) await untrustedApp.rest('a', 'GET', '/api/rooms/ZZZZZZ', undefined, { 'x-forwarded-for': '198.51.100.' + (i % 200) });
    expect((await untrustedApp.rest('a', 'GET', '/api/rooms/ZZZZZZ', undefined, { 'x-forwarded-for': '198.51.100.250' })).statusCode).toBe(429);
    const trustedApp = await app({ trustProxyHops: 1 });
    for (let i = 0; i < 125; i++) await trustedApp.rest('a', 'GET', '/api/rooms/ZZZZZZ', undefined, { 'x-forwarded-for': '198.51.100.' + (i % 200) });
    expect((await trustedApp.rest('a', 'GET', '/api/rooms/ZZZZZZ', undefined, { 'x-forwarded-for': '198.51.100.250' })).statusCode).toBe(404);
  });
});

describe('required room-state fields and restart', () => {
  it('state response carries the authoritative live fields', async () => {
    const t = await app();
    const code = await t.start();
    const state = (await t.rest('a', 'GET', `/api/rooms/${code}/state`)).json();
    for (const field of ['roomCode', 'status', 'host', 'currentPlayer', 'currentBidCr', 'highestBidderTeamId', 'endsAt', 'remainingTimeMs', 'playerQueue',
      'teams', 'soldPlayers', 'unsoldPlayers', 'retention', 'activity', 'recentBids', 'serverTime', 'sequence', 'connectedUsers'])
      expect(state, field).toHaveProperty(field);
    expect(state.currentPlayer).not.toBeNull();
    expect(state.teams[0]).toHaveProperty('remainingBudgetCr');
  });

  it('a new manager over the same durable repository returns the same room; a non-durable one reports ROOM_NOT_FOUND', async () => {
    const repository = new PostgresLiveRoomRepository(new FakeLiveSql().fn);
    const clock = { now: () => 1_000_000 };
    const players = new CatalogPlayerRepository(demoPlayers.slice(0, 2));
    const first = new RoomManager(repository, players, clock);
    const room = await first.create({ userId: 'host' }, { auctionName: 'Cup', teamName: 'Host FC', settings: { minSquadSize: 1, maxSquadSize: 3, minimumParticipants: 2 } } as never);
    const second = new RoomManager(repository, players, clock);
    await second.recover();
    expect((await second.loadRoom(room.code)).id).toBe(room.id);
    const lost = new RoomManager(new MemoryRoomRepository(), players, clock);
    await expect(lost.loadRoom(room.code)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND', statusCode: 404 });
  });
});

describe('storage and proxy environment', () => {
  const prod = { NODE_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: 'k', DATABASE_URL: 'postgres://x/y' } as NodeJS.ProcessEnv;
  it('defaults production to postgres with one trusted proxy hop', () => {
    const env = readEnvironment(prod);
    expect(env.STORAGE).toBe('postgres');
    expect(env.TRUST_PROXY_HOPS).toBe(1);
    expect(readEnvironment({ NODE_ENV: 'development' }).TRUST_PROXY_HOPS).toBe(0);
    expect(readEnvironment({ ...prod, TRUST_PROXY_HOPS: '2' }).TRUST_PROXY_HOPS).toBe(2);
  });
  it('rejects ephemeral storage in production unless explicitly allowed', () => {
    expect(() => readEnvironment({ ...prod, STORAGE: 'file' })).toThrow(/ALLOW_EPHEMERAL_STORAGE/);
    expect(() => readEnvironment({ ...prod, STORAGE: 'memory' })).toThrow(/ALLOW_EPHEMERAL_STORAGE/);
    expect(readEnvironment({ ...prod, STORAGE: 'file', ALLOW_EPHEMERAL_STORAGE: 'true' }).STORAGE).toBe('file');
  });
});
