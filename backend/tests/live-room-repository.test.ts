import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sql } from 'postgres';
import type { Room } from '../src/domain/types.js';
import type { RoomRepository } from '../src/repositories/interfaces.js';
import { MemoryRoomRepository } from '../src/repositories/memory.js';
import { FileRoomRepository } from '../src/repositories/file.js';
import { PostgresLiveRoomRepository } from '../src/repositories/postgres-live.js';
import { RoomManager } from '../src/modules/rooms/room.manager.js';
import { AuctionEngine } from '../src/modules/auction/auction.engine.js';
import { TimerService } from '../src/modules/auction/timer.service.js';
import { CatalogPlayerRepository, demoPlayers } from '../src/modules/players/player.service.js';
import { archiveCompletedAuction } from '../src/modules/manager-mode/completed-auction-archive.js';
import { loadManagerAuction } from '../src/modules/manager-mode/auction-snapshot.repository.js';
import { readEnvironment } from '../src/config/env.js';
import { FakeLiveSql } from './helpers-pg-double.js';
import { fixture } from './helpers.js';

afterEach(() => vi.useRealTimers());
const dirs: string[] = [];
afterEach(async () => { while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true }); });
const kinds: [string, () => Promise<{ repo: RoomRepository; sql?: FakeLiveSql }>][] = [
  ['memory', async () => ({ repo: new MemoryRoomRepository() })],
  ['file', async () => { const d = await mkdtemp(join(tmpdir(), 'live-room-')); dirs.push(d); return { repo: new FileRoomRepository(d) }; }],
  ['postgres(fake)', async () => { const sql = new FakeLiveSql(); return { repo: new PostgresLiveRoomRepository(sql.fn), sql }; }],
];
const code = (e: unknown) => (e as { code?: string }).code;
const rejectsWith = async (p: Promise<unknown>, c: string) => expect(await p.then(() => 'ok', code)).toBe(c);
async function sample(repo: RoomRepository, settings = {}) { const f = await fixture(settings, repo); return { f, room: structuredClone(await f.state()) }; }

describe.each(kinds)('RoomRepository contract: %s', (_name, make) => {
  it('creates, finds, rejects duplicates and returns copies', async () => {
    const { repo } = await make();
    const { room } = await sample(repo);
    const found = (await repo.findByCode(room.code))!;
    expect(found).toEqual(JSON.parse(JSON.stringify(room)));
    found.auctionName = 'mutated';
    expect((await repo.findByCode(room.code))!.auctionName).toBe(room.auctionName);
    await rejectsWith(repo.create(room), 'ROOM_CODE_CONFLICT');
    expect(await repo.findByCode('ZZZZZZ')).toBeNull();
  });
  it('commits with an expected-sequence check', async () => {
    const { repo } = await make();
    const { room } = await sample(repo);
    const next = { ...room, sequence: room.sequence + 1, auctionName: 'v2' };
    await rejectsWith(repo.commit(next, room.sequence + 5), 'VERSION_CONFLICT');
    await repo.commit(next, room.sequence);
    expect((await repo.findByCode(room.code))!.auctionName).toBe('v2');
    await rejectsWith(repo.commit({ ...next, sequence: next.sequence + 1 }, room.sequence), 'VERSION_CONFLICT');
  });
  it('lists all, active, by id and by user', async () => {
    const { repo } = await make();
    const { room } = await sample(repo);
    const done: Room = { ...structuredClone(room), id: 'c0a80101-0000-4000-8000-000000000001', code: 'DKNE22', status: 'COMPLETED' };
    await repo.create(done);
    expect((await repo.listRecoverable()).map(r => r.code).sort()).toEqual([room.code, 'DKNE22'].sort());
    expect((await repo.listActive()).map(r => r.code)).toEqual([room.code]);
    expect((await repo.findById(done.id))?.code).toBe('DKNE22');
    expect(await repo.findById('missing')).toBeNull();
    expect(await repo.listForUser('alice')).toHaveLength(2);
    expect(await repo.listForUser('nobody')).toHaveLength(0);
  });
  it('lets exactly one of two concurrent commits win', async () => {
    const { repo } = await make();
    const { room } = await sample(repo);
    const results = await Promise.allSettled([
      repo.commit({ ...room, sequence: room.sequence + 1, auctionName: 'A' }, room.sequence),
      repo.commit({ ...room, sequence: room.sequence + 1, auctionName: 'B' }, room.sequence),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map(r => code(r.reason))).toEqual(['VERSION_CONFLICT']);
  });
  it('round-trips retention and queue state losslessly', async () => {
    const { repo } = await make();
    const { room } = await sample(repo);
    const t = room.teams;
    const rich = { ...structuredClone(room), id: 'c0a80101-0000-4000-8000-000000000002', code: 'RET222', playerQueue: ['p-2', 'p-1'],
      retention: { phase: 'IN_PROGRESS', activeTeamId: t[1]!.id, order: t.map(x => x.id), picks: [{ teamId: t[0]!.id, playerId: 'p-1', priceUnits: 30 }],
        drafts: [{ teamId: t[1]!.id, playerId: 'p-2', priceUnits: 30 }], turns: [{ teamId: t[0]!.id, kind: 'RETAINED', order: 1, confirmedBy: 'host' }] } } as unknown as Room;
    await repo.create(rich);
    expect(await repo.findByCode('RET222')).toEqual(JSON.parse(JSON.stringify(rich)));
  });
});

describe.each(kinds)('restart simulation: %s', (_name, make) => {
  it('keeps the active auction, receipts and timers after a new RoomManager recovers', async () => {
    vi.useFakeTimers();
    const { repo } = await make();
    const f = await fixture({}, repo);
    await f.command('START_AUCTION');
    await f.command('PLACE_BID', 'alice', { amountCr: 3 }, 'r1');
    const manager = new RoomManager(repo, new CatalogPlayerRepository(demoPlayers), f.clock);
    const recovered = await manager.recover();
    expect(recovered.map(r => r.code)).toEqual([f.room.code]);
    const engine = new AuctionEngine(manager);
    const restored = await manager.loadRoom(f.room.code);
    expect(restored.active?.currentBidUnits).toBe(6);
    const dup = await engine.execute(f.room.code, 'alice', { type: 'PLACE_BID', requestId: 'r1', payload: { roomCode: f.room.code, amountCr: 3 } });
    expect(dup.duplicate).toBe(true);
    const errors: unknown[] = [];
    const timers = new TimerService(f.clock, (c, id) => engine.onTimer(c, id), e => errors.push(e));
    try {
      for (const room of recovered) timers.schedule(room);
      f.clock.value = restored.active!.endsAt + 10;
      await vi.advanceTimersByTimeAsync(20_000);
      expect((await manager.loadRoom(f.room.code)).purchases).toHaveLength(1);
      expect(errors).toHaveLength(0);
    } finally { timers.close(); }
  });
  it('fills defaults for settings missing from an old snapshot', async () => {
    const { repo } = await make();
    const { room } = await sample(repo);
    const legacy = structuredClone(room) as unknown as { settings: Record<string, unknown>; sequence: number };
    delete legacy.settings.autoAdvance; delete legacy.settings.antiSnipingEnabled;
    await repo.commit(legacy as unknown as Room, room.sequence);
    const manager = new RoomManager(repo, new CatalogPlayerRepository(demoPlayers), { now: () => 1 });
    await manager.recover();
    const loaded = await manager.loadRoom(room.code);
    expect(typeof loaded.settings.autoAdvance).toBe('boolean');
    expect(typeof loaded.settings.antiSnipingEnabled).toBe('boolean');
  });
});

/** Records statements and emulates just enough of the archive's reads. */
function recordingDb() {
  const inserts: string[] = []; let archived = false;
  const tx: any = (first: unknown, ...v: unknown[]) => {
    if (!Array.isArray(first) || !('raw' in (first as object))) return { rows: first };
    const text = (first as unknown as string[]).join('?').replace(/\s+/g, ' ').trim();
    for (const m of text.matchAll(/insert into (public\.\w+)/g)) inserts.push(m[1]!);
    if (text.startsWith('select id from public.auction_rooms')) return Promise.resolve(archived ? [{ id: v[0] }] : []);
    if (text.startsWith('insert into public.auction_runtime_snapshots')) archived = true;
    return Promise.resolve([]);
  };
  tx.json = (x: unknown) => x;
  const db = { begin: async (fn: (t: unknown) => Promise<void>) => fn(tx) } as unknown as Sql;
  return { db, inserts };
}

describe('completion archive with the live repository', () => {
  async function completed() {
    const sql = new FakeLiveSql();
    const repo = new PostgresLiveRoomRepository(sql.fn);
    const f = await fixture({}, repo);
    await f.command('START_AUCTION');
    await f.expire();
    await f.command('END_AUCTION');
    return { sql, repo, f, room: await f.state() };
  }
  it('archives once, touches no other live table, and Manager Mode loads new and old rooms', async () => {
    const { sql, repo, f, room } = await completed();
    expect(room.status).toBe('COMPLETED');
    const { db, inserts } = recordingDb();
    await archiveCompletedAuction(db, (await repo.findById(room.id))!, 'host');
    await archiveCompletedAuction(db, (await repo.findById(room.id))!, 'host');
    expect(inserts.filter(t => t === 'public.auction_rooms')).toHaveLength(1);
    expect(inserts.filter(t => t === 'public.auction_pool')).toHaveLength(1);
    expect([...sql.tables]).toEqual(['public.live_room_snapshots']);
    expect(sql.rows.size).toBe(1);
    expect((await loadManagerAuction(null, repo, room.id))?.code).toBe(f.room.code);
    expect(await loadManagerAuction(null, repo, 'old-room-id')).toBeNull();
    // Old completed rooms are absent from the live table and fall back to the archive reader.
    const archiveRead = vi.fn(async () => []);
    const oldDb = Object.assign(archiveRead, { begin: vi.fn() }) as unknown as Sql;
    await expect(loadManagerAuction(oldDb, repo, 'old-room-id')).resolves.toBeNull();
    expect(archiveRead).toHaveBeenCalled();
  });
  it('still resolves legacy {listRecoverable} sources', async () => {
    const { room } = await completed();
    expect(await loadManagerAuction(null, { listRecoverable: async () => [room] }, room.id)).toBe(room);
  });
});

describe('purgeStale', () => {
  it('deletes only old LOBBY rooms and never when ttl is 0', async () => {
    const sql = new FakeLiveSql();
    const repo = new PostgresLiveRoomRepository(sql.fn);
    const { room } = await sample(repo);
    const mk = (id: string, c: string, status: string) => ({ ...structuredClone(room), id, code: c, status }) as Room;
    await repo.create(mk('c0a80101-0000-4000-8000-0000000000a1', 'KLDLB2', 'LOBBY'));
    await repo.create(mk('c0a80101-0000-4000-8000-0000000000a2', 'KLDRN2', 'RUNNING'));
    await repo.create(mk('c0a80101-0000-4000-8000-0000000000a3', 'KLDCP2', 'COMPLETED'));
    const day = 86_400_000;
    for (const r of sql.rows.values()) r.updated_at = sql.now - 30 * day;
    sql.rows.get(room.code)!.updated_at = sql.now;
    expect(await repo.purgeStale(0)).toBe(0);
    expect(sql.rows.size).toBe(4);
    expect(await repo.purgeStale(14)).toBe(1);
    expect([...sql.rows.keys()].sort()).toEqual([room.code, 'KLDCP2', 'KLDRN2'].sort());
  });
});

describe('storage selection', () => {
  const base = { DATABASE_URL: 'postgres://x', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  it('defaults to postgres in production and file elsewhere', () => {
    expect(readEnvironment({ ...base, NODE_ENV: 'production' }).STORAGE).toBe('postgres');
    expect(readEnvironment({ NODE_ENV: 'development' }).STORAGE).toBe('file');
    expect(readEnvironment({ NODE_ENV: 'test', STORAGE: 'memory' }).STORAGE).toBe('memory');
  });
  it('requires DATABASE_URL for STORAGE=postgres and defaults the lobby TTL', () => {
    expect(() => readEnvironment({ STORAGE: 'postgres' })).toThrow(/DATABASE_URL/);
    expect(readEnvironment({}).LIVE_ROOM_LOBBY_TTL_DAYS).toBe(14);
  });
});
