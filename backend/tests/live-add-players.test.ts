import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { buildApp } from '../src/app.js';
import { StaticTokenAuthService } from '../src/modules/auth-context/auth.service.js';
import { assertRoom } from '../src/modules/auction/squad.service.js';
import { PoolImportService } from '../src/modules/auction/pool-import/pool-import.service.js';
import type { PoolImportInput } from '../src/modules/auction/pool-import/pool-import.types.js';
import { MemoryFc26Catalog } from '../src/modules/fc26/fc26.catalog.js';
import { resolveFc26Config } from '../src/modules/fc26/fc26.config.js';
import { archiveCompletedAuction } from '../src/modules/manager-mode/completed-auction-archive.js';
import { CatalogPlayerRepository, demoPlayers } from '../src/modules/players/player.service.js';
import { roomState } from '../src/modules/rooms/room-state.js';
import { RoomManager } from '../src/modules/rooms/room.manager.js';
import { PostgresLiveRoomRepository } from '../src/repositories/postgres-live.js';
import type { ServerEvent } from '../src/domain/types.js';
import { FakeLiveSql } from './helpers-pg-double.js';
import { fixture } from './helpers.js';

afterEach(() => vi.restoreAllMocks());
const FIXTURES = resolve(import.meta.dirname, 'fixtures/fc26');
const loadCatalog = async () => { const c = new MemoryFc26Catalog(resolveFc26Config({ FC26_DATA_DIR: FIXTURES })); await c.importAll(); return c; };
// Fixture catalog ids: GK 1001/1002; CB 2001/2002; FB 3001; MID 4001-4003; ATT 5001/5002; Underdogs 6001-6003, 9001.
const HEAD = 'player_id,short_name,long_name,player_positions,overall,draft_pool';
const csv = (...rows: string[]) => [HEAD, ...rows].join('\n');
const code = (error: unknown) => (error as { code?: string }).code;
const rejects = async (promise: Promise<unknown>, expected: string) => {
  const error = await promise.then(() => null, e => e);
  expect(code(error), String(error)).toBe(expected);
};
const input = (text: string, extra: Partial<PoolImportInput> = {}): PoolImportInput =>
  ({ source: 'CSV', fileName: 'players.csv', csv: text, batchId: randomUUID(), ...extra });

/** Live FC26 auction. Math.random is pinned to 0 so selection is deterministic: the first pot and player in room order. */
async function live(pool = ['1001', '1002', '4001'], extra: Record<string, unknown> = {}, repository?: PostgresLiveRoomRepository) {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const fc26 = await loadCatalog();
  const f = await fixture({ playerPoolSource: 'FC26', startingBudgetCr: 100, minSquadSize: 1, maxSquadSize: 5, playerPoolConfig: { playerIds: pool }, ...extra } as never,
    repository, 2, fc26);
  await f.command('START_AUCTION');
  const svc = new PoolImportService(f.manager);
  const events: ServerEvent[] = [];
  f.manager.subscribe((_room, committed) => { events.push(...committed); });
  return { ...f, fc26, svc, events };
}
type Live = Awaited<ReturnType<typeof live>>;
const activeId = async (t: Live) => (await t.state()).active?.playerId;
/** Resolve the live lot unsold (or sold if bid) and activate the next player. */
const advance = async (t: Live) => { await t.expire(); await t.command('NEXT_PLAYER'); return activeId(t); };

describe('live import is additive', () => {
  it('leaves the live lot, bid, timer, queue, history and existing players untouched, and the lot resolves at its original endsAt', async () => {
    const t = await live();
    await t.command('PLACE_BID', 'alice', { amountCr: 3.5 });
    const before = await t.state();
    t.clock.value += 2_000;
    const report = await t.svc.commit(t.room.code, 'host', input(csv(
      '7001,N. One,New One,ST,88,', '7002,N. Two,New Two,ST,91,', '7003,N. Three,New Three,ST,80,UNDERDOG', '7004,N. Four,New Four,GK,80,', '7005,N. Five,New Five,CM,80,'),
      { fileName: 'C:\\evil\\..\\players.csv' }));
    const after = await t.state();
    expect(report.totals).toMatchObject({ totalRecords: 5, eligible: 5, added: 5, skipped: 0, rejected: 0 });
    expect(after.active).toEqual(before.active);
    expect(after.active).toMatchObject({ playerId: '4001', currentBidUnits: 7, bidCount: 1 });
    expect(after.purchases).toEqual(before.purchases);
    expect(after.bids).toEqual(before.bids);
    expect(after.teams).toEqual(before.teams);
    expect(after.playerQueue).toEqual(before.playerQueue);
    expect(after.playerHistory).toEqual(before.playerHistory);
    expect([after.lastPot, after.consecutivePotCount, after.nextPlayerAt]).toEqual([before.lastPot, before.consecutivePotCount, before.nextPlayerAt]);
    expect(after.players.slice(0, before.players.length)).toEqual(before.players);
    expect(after.players.map(p => p.id)).toEqual([...before.players.map(p => p.id), '7001', '7002', '7003', '7004', '7005']);
    expect(after.sequence).toBe(before.sequence + 1);
    const added = (id: string) => after.players.find(p => p.id === id)!;
    expect(added('7001')).toMatchObject({ status: 'WAITING', round: 0, potId: 'ATT', basePriceUnits: 6, poolMeta: { poolStatus: 'PENDING', importedBy: 'host',
      importBatchId: report.batchId, importedAt: t.clock.value, sourceFile: 'players.csv', sourceCategory: 'ATT', release: 'HELD' } });
    expect(added('7002').basePriceUnits).toBe(10);
    expect(added('7003')).toMatchObject({ basePriceUnits: 2, draftPool: 'UNDERDOG', playerTag: 'UNDERDOG', poolMeta: { sourceCategory: 'UNDERDOG', release: 'HELD' } });
    expect(added('7004')).toMatchObject({ potId: 'GK', poolMeta: { release: 'FOLLOW' } });
    expect(added('7005')).toMatchObject({ potId: 'MID', poolMeta: { release: 'FOLLOW' } });
    expect(after.addedQueue).toEqual(['7001', '7002', '7003', '7004', '7005']);
    assertRoom(after);
    // The countdown was never reset: expiring at the original endsAt sells the lot to the bidder.
    await t.expire();
    const sold = await t.state();
    expect(sold.purchases.map(p => [p.playerId, p.priceUnits])).toEqual([['4001', 7]]);
    expect(sold.active).toBeNull();
  });
  it('ignores client prices, never modifies a pool player and stores only what the server computed', async () => {
    const t = await live();
    const before = (await t.state()).players.find(p => p.id === '1002')!;
    const text = 'player_id,short_name,player_positions,overall,base_price_cr,price\n1002,Hacked,GK,99,0.5,1\n7001,Cheap,ST,99,0.5,1';
    const report = await t.svc.commit(t.room.code, 'host', input(text));
    const room = await t.state();
    expect(report.rows.find(r => r.playerId === '1002')).toMatchObject({ status: 'SKIPPED', code: 'ALREADY_IN_POOL' });
    expect(room.players.find(p => p.id === '1002')).toEqual(before);
    expect(room.players.find(p => p.id === '7001')!.basePriceUnits).toBe(10);
  });
});

describe('eligibility', () => {
  it('skips sold, unsold, live, in-pool and in-file duplicates and rejects invalid rows with reasons', async () => {
    const t = await live(['1001', '1002', '4001', '4003']);
    await t.command('PLACE_BID', 'alice', { amountCr: 3.5 });
    await t.expire();                         // 4001 sold
    await t.command('NEXT_PLAYER');
    expect(await activeId(t)).toBe('1001');
    expect(await advance(t)).toBe('4003');    // 1001 unsold
    const before = await t.state();
    expect(before.players.map(p => [p.id, p.status])).toEqual([['4001', 'SOLD'], ['1001', 'UNSOLD'], ['4003', 'ACTIVE'], ['1002', 'WAITING']]);
    const preview = await t.svc.preview(t.room.code, 'host', input(csv('4001,A,A,CM,86,', '1001,B,B,GK,85,', '1002,C,C,GK,80,', '4003,D,D,LM,84,',
      '7001,E,E,ST,88,', '7001,E2,E2,ST,88,', '7002,F,F,ST,abc,', '7003,G,G,XX,80,', '7004,H,H,ST,80,')));
    expect(await t.state()).toEqual(before);   // preview never changes state
    expect(preview.mode).toBe('PREVIEW');
    expect(preview.totals).toMatchObject({ totalRecords: 9, eligible: 2, added: 0, skipped: 5, rejected: 2,
      byReason: { SOLD: 1, ALREADY_UNSOLD: 1, CURRENTLY_LIVE: 1, ALREADY_IN_POOL: 1, DUPLICATE_IN_FILE: 1, INVALID: 2 } });
    expect(preview.rows.filter(r => r.status === 'REJECTED').every(r => r.reason.length > 0)).toBe(true);
    const report = await t.svc.commit(t.room.code, 'host', input(csv('4001,A,A,CM,86,', '1002,C,C,GK,80,', '7001,E,E,ST,88,', '7001,E2,E2,ST,88,', '7002,F,F,ST,abc,', '7004,H,H,ST,80,')));
    const after = await t.state();
    expect(report.totals).toMatchObject({ added: 2, skipped: 3, rejected: 1 });
    expect(after.players.map(p => p.id)).toEqual(['4001', '1001', '4003', '1002', '7001', '7004']);
    expect(after.players.slice(0, 4)).toEqual(before.players);
    expect(new Set(after.players.map(p => p.id)).size).toBe(after.players.length);
    expect(after.addedQueue).toEqual(['7001', '7004']);
    expect(after.active).toEqual(before.active);
    assertRoom(after);
  });
  it('excludes retained players', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fc26 = await loadCatalog();
    const f = await fixture({ playerPoolSource: 'FC26', retention: { enabled: true }, startingBudgetCr: 100, minSquadSize: 1, maxSquadSize: 5 } as never, undefined, 2, fc26);
    await f.command('START_RETENTION');
    await f.command('RETAIN_PLAYER', 'host', { playerId: '2001' });
    await f.command('CONFIRM_RETENTION', 'host');
    await f.command('SKIP_RETENTION', 'alice');
    await f.command('SKIP_RETENTION', 'bob');
    await f.command('FINALIZE_RETENTIONS');
    await f.command('START_AUCTION');
    const svc = new PoolImportService(f.manager);
    const report = await svc.commit(f.room.code, 'host', input(csv('2001,R,R,CB,80,', '8001,N,N,CB,80,')));
    expect(report.rows.find(r => r.playerId === '2001')).toMatchObject({ status: 'SKIPPED', code: 'RETAINED' });
    expect(report.totals).toMatchObject({ added: 1, skipped: 1 });
    expect((await f.state()).players.filter(p => p.id === '2001')).toHaveLength(1);
  });
  it('imports from the FC26 database source with server prices, and rejects the default pool in an FC26 room', async () => {
    const t = await live();
    const report = await t.svc.commit(t.room.code, 'host', { source: 'FC26_DATABASE', playerIds: ['5001', '6003'], batchId: randomUUID() });
    const room = await t.state();
    expect(report.totals).toMatchObject({ totalRecords: 2, added: 2 });
    expect(room.players.find(p => p.id === '5001')).toMatchObject({ basePriceUnits: 10, poolMeta: { sourceFile: 'FC26 database', sourceCategory: 'ATT' } });
    expect(room.players.find(p => p.id === '6003')).toMatchObject({ basePriceUnits: 2, playerTag: 'UNDERDOG' });
    await rejects(t.svc.preview(t.room.code, 'host', { source: 'DEFAULT_POOL' }), 'SOURCE_MISMATCH');
  });
});

describe('categories and order', () => {
  it('plays additions only after every regular waiting player, in import order', async () => {
    const t = await live();
    await t.svc.commit(t.room.code, 'host', input(csv('7010,G1,G1,GK,80,', '7011,G2,G2,GK,80,', '7012,M1,M1,CM,80,')));
    const order = [await activeId(t)];
    for (let i = 0; i < 5; i++) order.push(await advance(t));
    expect(order).toEqual(['4001', '1001', '1002', '7010', '7011', '7012']);
    expect((await t.state()).addedQueue).toEqual([]);
  });
  it('holds additions to a completed category and never reopens it until the host releases them', async () => {
    const t = await live(['1001', '4001']);
    await t.expire();                        // 4001 unsold; MID is now completed
    const report = await t.svc.commit(t.room.code, 'host', input(csv('7001,M,M,CM,80,', '7002,G,G,GK,80,', '7003,A,A,ST,80,')));
    expect(report.rows.map(r => [r.playerId, r.categoryState])).toEqual([['7001', 'COMPLETED'], ['7002', 'ACTIVE'], ['7003', 'NOT_IN_AUCTION']]);
    await t.command('NEXT_PLAYER');
    expect(await activeId(t)).toBe('1001');
    await t.expire();
    await t.command('NEXT_PLAYER');
    expect(await activeId(t)).toBe('7002');
    await t.expire();
    const room = await t.state();
    expect(room.players.find(p => p.id === '7001')!.status).toBe('WAITING');
    await rejects(t.command('NEXT_PLAYER'), 'NO_WAITING_PLAYERS');
    expect(room.status).toBe('RUNNING');
    const view = roomState(room, 'alice', t.clock.now()).poolAdditions;
    expect(view).toMatchObject({ pendingCount: 2, followCount: 0, heldCount: 2, held: [{ playerId: '7001', potId: 'MID' }, { playerId: '7003', potId: 'ATT' }] });
    await rejects(t.command('RELEASE_POOL_ADDITIONS', 'alice'), 'HOST_REQUIRED');
    await rejects(t.command('RELEASE_POOL_ADDITIONS', 'host', { playerIds: ['4001'] }), 'PLAYER_NOT_RELEASABLE');
    const first = await t.command('RELEASE_POOL_ADDITIONS', 'host', { playerIds: ['7001'] }, 'rel-1');
    expect(await t.command('RELEASE_POOL_ADDITIONS', 'host', { playerIds: ['7001'] }, 'rel-1')).toMatchObject({ duplicate: true, sequence: first.sequence });
    expect(t.events.filter(e => e.type === 'POOL_ADDITIONS_RELEASED')).toHaveLength(1);
    await t.command('NEXT_PLAYER');
    expect(await activeId(t)).toBe('7001');
    await t.expire();
    await rejects(t.command('NEXT_PLAYER'), 'NO_WAITING_PLAYERS');
    await t.command('RELEASE_POOL_ADDITIONS', 'host');
    await t.command('NEXT_PLAYER');
    expect(await activeId(t)).toBe('7003');
    await t.expire();
    await rejects(t.command('RELEASE_POOL_ADDITIONS', 'host'), 'NO_HELD_ADDITIONS');
  });
  it('keeps START_RECALL working while additions are held', async () => {
    const t = await live(['1001', '4001']);
    await t.expire();
    await t.svc.commit(t.room.code, 'host', input(csv('7001,M,M,CM,80,')));
    await t.command('NEXT_PLAYER');
    await t.expire();
    await t.command('START_RECALL');
    const room = await t.state();
    expect(room.active).not.toBeNull();
    expect(room.players.find(p => p.id === '7001')).toMatchObject({ status: 'WAITING', poolMeta: { release: 'HELD' } });
  });
  it('clears queued additions when the auction ends and archives imported players with valid rows', async () => {
    const t = await live(['1001', '4001']);
    await t.svc.commit(t.room.code, 'host', input(csv('7001,G,G,GK,80,', '7002,A,A,ST,88,')));
    await t.command('END_AUCTION');
    const room = await t.state();
    expect(room.status).toBe('COMPLETED');
    expect(room.addedQueue).toEqual([]);
    const written: Record<string, unknown[]> = {};
    const tx: any = (first: unknown, ...v: unknown[]) => {
      if (!Array.isArray(first) || !('raw' in (first as object))) return { rows: first };
      const text = (first as unknown as string[]).join('?').replace(/\s+/g, ' ').trim();
      const target = text.match(/^insert into (public\.\w+)/)?.[1];
      const rows = (v[0] as { rows?: unknown[] } | undefined)?.rows;
      if (target && rows) written[target] = rows;
      return Promise.resolve([]);
    };
    tx.json = (x: unknown) => x;
    await archiveCompletedAuction({ begin: async (fn: (x: unknown) => Promise<void>) => fn(tx) } as unknown as Sql, room, 'host');
    const players = written['public.football_players'] as { external_id: string; base_price_units: number; position: string }[];
    expect(players.map(p => p.external_id)).toEqual(['4001', '1001', '7001', '7002']);
    expect(players.every(p => Number.isInteger(p.base_price_units) && p.base_price_units > 0 && p.position)).toBe(true);
    expect(written['public.auction_pool']).toHaveLength(4);
  });
});

describe('concurrency and idempotency', () => {
  it('keeps a concurrent bid and the import, in either order', async () => {
    for (const bidFirst of [true, false]) {
      const t = await live();
      const bid = () => t.command('PLACE_BID', 'alice', { amountCr: 3.5 });
      const add = () => t.svc.commit(t.room.code, 'host', input(csv('7001,A,A,ST,80,')));
      await Promise.all(bidFirst ? [bid(), add()] : [add(), bid()]);
      const room = await t.state();
      expect(room.active).toMatchObject({ playerId: '4001', currentBidUnits: 7, bidCount: 1 });
      expect(room.bids).toHaveLength(1);
      expect(room.players.map(p => p.id)).toContain('7001');
      assertRoom(room);
    }
  });
  it('adds once for a repeated batchId and for the same CSV committed twice', async () => {
    const t = await live();
    const one = input(csv('7001,A,A,ST,80,'));
    const [a, b] = await Promise.all([t.svc.commit(t.room.code, 'host', one), t.svc.commit(t.room.code, 'host', one)]);
    expect([a.duplicate, b.duplicate].filter(Boolean)).toHaveLength(1);
    expect((await t.state()).players.filter(p => p.id === '7001')).toHaveLength(1);
    const sequence = (await t.state()).sequence;
    const replay = await t.svc.commit(t.room.code, 'host', one);
    expect(replay).toMatchObject({ duplicate: true, totals: { added: 1 }, sequence });
    expect((await t.state()).sequence).toBe(sequence);
    await rejects(t.svc.commit(t.room.code, 'host', input(csv('7002,B,B,ST,80,'), { batchId: one.batchId })), 'IDEMPOTENCY_CONFLICT');
    const [c, d] = await Promise.all([t.svc.commit(t.room.code, 'host', input(csv('7005,A,A,ST,80,'))), t.svc.commit(t.room.code, 'host', input(csv('7005,A,A,ST,80,')))]);
    expect([c.totals.added, d.totals.added].sort()).toEqual([0, 1]);
    expect((await t.state()).players.filter(p => p.id === '7005')).toHaveLength(1);
  });
  it('re-checks eligibility at commit, so a preview taken earlier is not trusted', async () => {
    const t = await live();
    const stale = await t.svc.preview(t.room.code, 'host', input(csv('7001,A,A,ST,80,')));
    expect(stale.rows[0]).toMatchObject({ status: 'ELIGIBLE' });
    await t.svc.commit(t.room.code, 'host', input(csv('7001,A,A,ST,80,')));
    const late = await t.svc.commit(t.room.code, 'host', input(csv('7001,A,A,ST,80,')));
    expect(late.rows[0]).toMatchObject({ status: 'SKIPPED', code: 'ALREADY_IN_POOL' });
  });
  it('commits nothing when no player is eligible', async () => {
    const t = await live();
    const before = await t.state();
    const report = await t.svc.commit(t.room.code, 'host', input(csv('1002,A,A,GK,80,', '7002,B,B,ST,abc,')));
    expect(report.totals).toMatchObject({ added: 0, skipped: 1, rejected: 1 });
    expect(await t.state()).toEqual(before);
    expect(t.events).toHaveLength(0);
  });
});

describe('permissions, state and limits', () => {
  it('allows only the host of a RUNNING or PAUSED auction and validates the file', async () => {
    const t = await live();
    const ok = csv('7001,A,A,ST,80,');
    await rejects(t.svc.preview(t.room.code, 'alice', input(ok)), 'HOST_REQUIRED');
    await rejects(t.svc.commit(t.room.code, 'alice', input(ok)), 'HOST_REQUIRED');
    await rejects(t.svc.commit(t.room.code, 'zed', input(ok)), 'NOT_ROOM_MEMBER');
    await rejects(t.svc.commit(t.room.code, 'host', { ...input(ok), batchId: undefined }), 'BATCH_ID_REQUIRED');
    await rejects(t.svc.preview(t.room.code, 'host', input('player_id,name\n1,A')), 'MISSING_COLUMNS');
    await rejects(t.svc.preview(t.room.code, 'host', input('')), 'EMPTY_FILE');
    await rejects(t.svc.preview(t.room.code, 'host', input(HEAD)), 'EMPTY_FILE');
    await rejects(t.svc.preview(t.room.code, 'host', input(csv(...Array.from({ length: 1001 }, (_, i) => `${80000 + i},P,P,ST,80,`)))), 'TOO_MANY_ROWS');
    await t.command('PAUSE_AUCTION');
    expect((await t.svc.commit(t.room.code, 'host', input(ok))).totals.added).toBe(1);
    await t.command('END_AUCTION');
    await rejects(t.svc.commit(t.room.code, 'host', input(csv('7002,A,A,ST,80,'))), 'INVALID_STATE');
  });
  it('is rejected in the lobby', async () => {
    const fc26 = await loadCatalog();
    const f = await fixture({ playerPoolSource: 'FC26', startingBudgetCr: 100 } as never, undefined, 2, fc26);
    await rejects(new PoolImportService(f.manager).preview(f.room.code, 'host', input(csv('7001,A,A,ST,80,'))), 'INVALID_STATE');
  });
  it('accepts the default CSV schema in a default-pool room with the default price ladder', async () => {
    const f = await fixture({ startingBudgetCr: 100, minSquadSize: 1 } as never, undefined, 2);
    await f.command('START_AUCTION');
    const svc = new PoolImportService(f.manager);
    const text = 'player_id,name,overall,auction_group,position\nD1,Def One,92,DEF,CB\nD2,Att Two,82,ATT,ST\nD3,Bad,80,XX,';
    const report = await svc.commit(f.room.code, 'host', input(text));
    const room = await f.state();
    expect(report.totals).toMatchObject({ added: 2, rejected: 1 });
    expect(room.players.find(p => p.id === 'D1')).toMatchObject({ potId: 'DEF', basePriceUnits: 18 });
    expect(room.players.find(p => p.id === 'D2')).toMatchObject({ potId: 'ATT', position: 'FWD', basePriceUnits: 4 });
  });
});

describe('persistence and realtime', () => {
  it('rehydrates players, queue and batches after a server restart and shows them in the member state', async () => {
    const repository = new PostgresLiveRoomRepository(new FakeLiveSql().fn);
    const t = await live(undefined, {}, repository);
    await t.svc.commit(t.room.code, 'host', input(csv('7001,A,A,ST,80,', '7004,G,G,GK,80,')));
    const before = await t.state();
    const manager = new RoomManager(repository, new CatalogPlayerRepository(demoPlayers.slice(0, 2)), t.clock, undefined, undefined, t.fc26);
    await manager.recover();
    const after = await manager.loadRoom(t.room.code);
    expect(after.addedQueue).toEqual(['7001', '7004']);
    expect(after.poolImports).toEqual(before.poolImports);
    expect(after.players).toEqual(before.players);
    const state = roomState(after, 'alice', t.clock.now());
    expect(state.poolAdditions).toMatchObject({ pendingCount: 2, followCount: 1, heldCount: 1,
      batches: [{ addedCount: 2, categoryCounts: { ATT: 1, GK: 1 }, heldCount: 1, sourceFile: 'players.csv', importedBy: 'host' }] });
    expect(state.poolAdditions.batches[0]).not.toHaveProperty('skipped');
    expect(roomState(after, 'host', t.clock.now()).poolAdditions.batches[0]).toHaveProperty('skipped');
    expect(state.playerQueueSummary).toMatchObject({ heldAdditions: 1 });
    expect(state.players.find(p => p.id === '7001')).toMatchObject({ poolMeta: { poolStatus: 'PENDING' } });
  });
  it('publishes one PLAYER_POOL_UPDATED event per import with the announced payload', async () => {
    const t = await live();
    const sequence = (await t.state()).sequence;
    t.clock.value += 5;
    const report = await t.svc.commit(t.room.code, 'host', input(csv('7001,A,A,ST,80,', '7004,G,G,GK,80,')));
    expect(t.events.map(e => [e.type, e.sequence])).toEqual([['PLAYER_POOL_UPDATED', sequence + 1]]);
    expect(t.events[0]!.payload).toEqual({ auctionId: t.room.id, roomCode: t.room.code, batchId: report.batchId, addedCount: 2,
      addedPlayerIds: ['7001', '7004'], addedPlayers: [{ playerId: '7001', category: 'ATT', releaseState: 'HELD' }, { playerId: '7004', category: 'GK', releaseState: 'FOLLOW' }],
      categoryCounts: { ATT: 1, GK: 1 }, heldCount: 1, importedAt: t.clock.value });
  });
  it('serves the HTTP routes: large body, host only, and no timer re-arm for a pool-only commit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fc26 = await loadCatalog();
    const { app, engine, timers } = await buildApp({
      authService: new StaticTokenAuthService(new Map([['host', { userId: 'host' }], ['alice', { userId: 'alice' }]])), fc26, logger: false });
    try {
      const host = { authorization: 'Bearer host' };
      const created = await app.inject({ method: 'POST', url: '/api/rooms', headers: host, payload: { auctionName: 'Live Add', teamName: 'Host FC',
        settings: { playerPoolSource: 'FC26', playerPoolConfig: { playerIds: ['1001', '1002'] }, minSquadSize: 1, minimumParticipants: 2, maxSquadSize: 5, startingBudgetCr: 100 } } });
      const roomCode = created.json().roomCode as string;
      await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/join`, headers: { authorization: 'Bearer alice' }, payload: { teamName: 'Alice FC' } });
      const base = `/api/rooms/${roomCode}/pool-import`;
      expect((await app.inject({ method: 'POST', url: `${base}/preview`, headers: host, payload: { source: 'CSV', csv: csv('7001,A,A,ST,80,') } })).statusCode).toBe(409);
      await engine.execute(roomCode, 'host', { type: 'START_AUCTION', payload: { roomCode } });
      const schedule = vi.spyOn(timers, 'schedule');
      const big = csv(...Array.from({ length: 400 }, (_, i) => `${70000 + i},Player Number ${i},Player Number ${i} Long,ST,80,`));
      expect(big.length).toBeGreaterThan(16 * 1024);
      const denied = await app.inject({ method: 'POST', url: `${base}/commit`, headers: { authorization: 'Bearer alice' }, payload: { source: 'CSV', csv: big, batchId: randomUUID() } });
      expect([denied.statusCode, denied.json().error.code]).toEqual([403, 'HOST_REQUIRED']);
      expect((await app.inject({ method: 'POST', url: `${base}/commit`, headers: host, payload: { source: 'CSV', csv: big, path: '/etc/passwd', batchId: randomUUID() } })).statusCode).toBe(400);
      const preview = await app.inject({ method: 'POST', url: `${base}/preview`, headers: host, payload: { source: 'CSV', csv: big } });
      expect(preview.json()).toMatchObject({ mode: 'PREVIEW', totals: { totalRecords: 400, eligible: 400, added: 0 } });
      const endsAt = (await app.inject({ url: '/api/health' })) && (await engine.manager.loadRoom(roomCode)).active!.endsAt;
      const response = await app.inject({ method: 'POST', url: `${base}/commit`, headers: host, payload: { source: 'CSV', fileName: 'big.csv', csv: big, batchId: randomUUID() } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ mode: 'COMMIT', totals: { added: 400 } });
      expect(schedule).not.toHaveBeenCalled();
      const room = await engine.manager.loadRoom(roomCode);
      expect(room.active!.endsAt).toBe(endsAt);
      expect(room.players).toHaveLength(402);
      expect((await app.inject({ method: 'POST', url: `${base}/commit`, headers: host, payload: { source: 'CSV', csv: 'x', batchId: 'nope' } })).statusCode).toBe(400);
    } finally { await app.close(); }
  });
});
