import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { StaticTokenAuthService } from '../src/modules/auth-context/auth.service.js';
import { MemoryFc26Catalog } from '../src/modules/fc26/fc26.catalog.js';
import { resolveFc26Config } from '../src/modules/fc26/fc26.config.js';
import { InMemoryRetentionLedger } from '../src/modules/retention/retention.ledger.js';
import { roomState } from '../src/modules/rooms/room-state.js';
import { RETENTION_MAX_PER_TEAM, RETENTION_MIN_PER_TEAM, RETENTION_PRICE_CR, RETENTION_PRICE_UNITS } from '../src/domain/retention.js';
import { assertRoom } from '../src/modules/auction/squad.service.js';
import { fixture } from './helpers.js';
import { RoomManager } from '../src/modules/rooms/room.manager.js';
import { MemoryRoomRepository } from '../src/repositories/memory.js';
import { CatalogPlayerRepository, demoPlayers } from '../src/modules/players/player.service.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures/fc26');
const loadCatalog = async () => { const c = new MemoryFc26Catalog(resolveFc26Config({ FC26_DATA_DIR: FIXTURES })); await c.importAll(); return c; };
// Fixture catalog ids: GK 1001; CB 2001/2002; FB 3001; MID 4001-4003; ATT 5001/5002; Underdogs 6001-6003, 9001.
const TOTAL_PLAYERS = 14;
async function setup(settings: Record<string, unknown> = {}, enabled = true) {
  const catalog = await loadCatalog();
  const f = await fixture({ playerPoolSource: 'FC26', retention: { enabled }, startingBudgetCr: 100, minSquadSize: 1, maxSquadSize: 5,
    ...settings } as never, undefined, 2, catalog);
  const retain = (user: string, playerId: string) => f.command('RETAIN_PLAYER', user, { playerId });
  const team = async (user: string) => (await f.state()).teams.find(t => t.userId === user)!;
  return { ...f, catalog, retain, team };
}
const code = (error: unknown) => (error as { code?: string }).code;
const rejects = async (promise: Promise<unknown>, expected: string) => {
  const error = await promise.then(() => null, e => e);
  expect(code(error), String(error)).toBe(expected);
};

describe('retention constants', () => {
  it('fixes the price at 15 Cr (30 units) with 0..3 players per team', () => {
    expect([RETENTION_PRICE_CR, RETENTION_PRICE_UNITS, RETENTION_MIN_PER_TEAM, RETENTION_MAX_PER_TEAM]).toEqual([15, 30, 0, 3]);
  });
});

describe('retaining players', () => {
  it.each([0, 1, 2, 3])('lets a team retain %i players at exactly 30 units each', async count => {
    const f = await setup();
    for (const id of ['2001', '4001', '5001'].slice(0, count)) await f.retain('alice', id);
    const room = await f.state();
    const alice = room.teams.find(t => t.userId === 'alice')!;
    expect(alice.spentUnits).toBe(30 * count);
    expect(alice.playerIds).toHaveLength(count);
    expect(room.purchases.filter(p => p.teamId === alice.id)).toHaveLength(count);
    expect(room.purchases.every(p => p.priceUnits === 30 && p.acquisitionType === 'RETENTION' && p.isRetained)).toBe(true);
    expect(room.players.filter(p => p.status === 'SOLD')).toHaveLength(count);
    expect(room.retention?.picks ?? []).toHaveLength(count);
    expect(() => assertRoom(room)).not.toThrow();
  });
  it('blocks a fourth player', async () => {
    const f = await setup();
    for (const id of ['2001', '4001', '5001']) await f.retain('alice', id);
    await rejects(f.retain('alice', '3001'), 'RETENTION_LIMIT_REACHED');
    expect((await f.team('alice')).spentUnits).toBe(90);
  });
  it('blocks a team whose purse cannot cover 15 Cr', async () => {
    const f = await setup({ startingBudgetCr: 20 });
    await f.retain('alice', '2001');
    await rejects(f.retain('alice', '4001'), 'INSUFFICIENT_PURSE');
    expect((await f.team('alice')).spentUnits).toBe(30);
  });
  it('rejects a player that is not in the FC26 catalog', async () => {
    const f = await setup();
    await rejects(f.retain('alice', 'nobody-123'), 'RETENTION_PLAYER_NOT_FOUND');
    expect((await f.state()).purchases).toHaveLength(0);
  });
  it('respects the maximum squad size', async () => {
    const f = await setup({ minSquadSize: 1, maxSquadSize: 1 });
    await f.retain('alice', '2001');
    await rejects(f.retain('alice', '4001'), 'SQUAD_FULL');
  });
  it('lets only one team retain a player, sequentially', async () => {
    const f = await setup();
    await f.retain('alice', '2001');
    await rejects(f.retain('bob', '2001'), 'PLAYER_ALREADY_RETAINED');
    await rejects(f.retain('alice', '2001'), 'ALREADY_RETAINED_BY_TEAM');
    expect((await f.state()).retention?.picks).toHaveLength(1);
  });
  it('lets exactly one of two concurrent retains of the same player succeed', async () => {
    const f = await setup();
    const results = await Promise.allSettled([f.retain('alice', '2001'), f.retain('bob', '2001'), f.retain('host', '2001')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(failed.map(r => code(r.reason))).toEqual(['PLAYER_ALREADY_RETAINED', 'PLAYER_ALREADY_RETAINED']);
    const room = await f.state();
    expect(room.retention?.picks).toHaveLength(1);
    expect(room.purchases).toHaveLength(1);
    expect(room.teams.reduce((sum, t) => sum + t.spentUnits, 0)).toBe(30);
  });
  it('only retains for the caller\'s own team and only for members', async () => {
    const f = await setup();
    await f.retain('alice', '2001');
    const room = await f.state();
    expect(room.retention?.picks[0]?.teamId).toBe(room.teams.find(t => t.userId === 'alice')!.id);
    await rejects(f.retain('mallory', '4001'), 'NOT_ROOM_MEMBER');
    await expect(f.engine.execute(room.code, 'alice', { type: 'RETAIN_PLAYER', payload: { roomCode: room.code, playerId: '4001', price: 1 } } as never)).rejects.toThrow();
  });
  it('is not available when retention is off', async () => {
    const f = await setup({}, false);
    await rejects(f.retain('alice', '2001'), 'RETENTION_NOT_ENABLED');
    await rejects(f.command('FINALIZE_RETENTIONS'), 'RETENTION_NOT_ENABLED');
  });
  it('closes after finalization', async () => {
    const f = await setup();
    await f.command('FINALIZE_RETENTIONS');
    await rejects(f.retain('alice', '2001'), 'RETENTION_CLOSED');
    await rejects(f.command('FINALIZE_RETENTIONS'), 'RETENTION_CLOSED');
  });
  it('replays an idempotent retain without charging twice', async () => {
    const f = await setup();
    await f.command('RETAIN_PLAYER', 'alice', { playerId: '2001' }, 'req-1');
    const again = await f.command('RETAIN_PLAYER', 'alice', { playerId: '2001' }, 'req-1');
    expect(again.duplicate).toBe(true);
    expect((await f.team('alice')).spentUnits).toBe(30);
  });
});

describe('finalizing and starting', () => {
  it('blocks START_AUCTION until retentions are finalized', async () => {
    const f = await setup();
    await f.retain('alice', '2001');
    await rejects(f.command('START_AUCTION'), 'RETENTION_NOT_FINALIZED');
    expect((await f.state()).status).toBe('LOBBY');
    await f.command('FINALIZE_RETENTIONS');
    await f.command('START_AUCTION');
    expect((await f.state()).status).toBe('RUNNING');
  });
  it('accepts zero retentions as a valid finalized state', async () => {
    const f = await setup();
    await f.command('FINALIZE_RETENTIONS');
    await f.command('START_AUCTION');
    const room = await f.state();
    expect(room.players).toHaveLength(TOTAL_PLAYERS);
  });
  it('only the host can finalize or reset', async () => {
    const f = await setup();
    await rejects(f.command('FINALIZE_RETENTIONS', 'alice'), 'HOST_REQUIRED');
    await rejects(f.command('RESET_RETENTIONS', 'alice'), 'HOST_REQUIRED');
    await f.command('FINALIZE_RETENTIONS');
    await rejects(f.command('RESET_RETENTIONS', 'bob'), 'HOST_REQUIRED');
  });
  it('skips the phase entirely when retention is off', async () => {
    const f = await setup({}, false);
    await f.command('START_AUCTION');
    const room = await f.state();
    expect(room.status).toBe('RUNNING');
    expect(room.retention).toBeUndefined();
    expect(room.players).toHaveLength(TOTAL_PLAYERS);
    expect(roomState(room, 'host', 0).retention).toMatchObject({ enabled: false, phase: 'OFF', picks: [] });
  });
  it('keeps retained players out of the queue, the active slot, unsold and recall for a whole auction', async () => {
    const f = await setup();
    const retained = ['2001', '4001', '5001'];
    for (const id of retained) await f.retain('alice', id);
    await f.retain('bob', '1001');
    await f.command('FINALIZE_RETENTIONS');
    await f.command('START_AUCTION');
    const all = [...retained, '1001'];
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      const room = await f.state();
      expect(all).not.toContain(room.active!.playerId);
      expect(room.players.filter(p => all.includes(p.id)).every(p => p.status === 'SOLD')).toBe(true);
      seen.push(room.active!.playerId);
      await f.expire();
      if (!(await f.state()).players.some(p => p.status === 'WAITING')) break;
      await f.command('NEXT_PLAYER');
    }
    expect(seen).toHaveLength(TOTAL_PLAYERS - all.length);
    expect(new Set(seen).size).toBe(seen.length);
    const done = await f.state();
    expect(done.players.filter(p => p.status === 'UNSOLD').map(p => p.id).sort()).toEqual([...seen].sort());
    await f.command('START_RECALL');
    const recall = await f.state();
    expect(recall.playerQueue.every(id => !all.includes(id))).toBe(true);
    expect(all).not.toContain(recall.active!.playerId);
    expect(recall.players.filter(p => all.includes(p.id)).every(p => p.status === 'SOLD')).toBe(true);
  });
  it('reflects the retention spend in purses and in ROOM_STATE', async () => {
    const f = await setup();
    await f.retain('alice', '2001');
    await f.retain('alice', '4001');
    await f.retain('bob', '5001');
    const room = await f.state();
    const state = roomState(room, 'alice', 5);
    expect(state.retention).toMatchObject({
      enabled: true, phase: 'OPEN', config: { priceCr: 15, maxPerTeam: 3, minPerTeam: 0 }, totals: { retained: 3, spentCr: 45 } });
    const alice = state.teams.find(t => t.userId === 'alice')!;
    expect(alice).toMatchObject({ retainedCount: 2, retentionSpentCr: 30, spentCr: 30, remainingBudgetCr: 70, auctionPurseCr: 70, startingBudgetCr: 100 });
    const host = state.teams.find(t => t.userId === 'host')!;
    expect(host).toMatchObject({ retainedCount: 0, retentionSpentCr: 0, remainingBudgetCr: 100, auctionPurseCr: 100 });
    expect(state.retention.teams.find(t => t.teamId === alice.id)).toEqual({ teamId: alice.id, retainedCount: 2, remainingSlots: 1, spentCr: 30, remainingPurseCr: 70 });
    expect(state.retention.picks).toHaveLength(3);
    expect(state.retention.picks[0]).toMatchObject({ priceCr: 15, player: { id: '2001', name: expect.any(String) } });
    expect(state.soldPlayers.every(p => p.acquisitionType === 'RETENTION' && p.isRetained === true && p.priceCr === 15)).toBe(true);
    expect(state.currentUserTeam.retainedCount).toBe(2);
    await f.command('FINALIZE_RETENTIONS');
    expect(roomState(await f.state(), 'bob', 5).retention).toMatchObject({ phase: 'FINALIZED', totals: { retained: 3 } });
  });
  it('marks Underdog tags on retained players', async () => {
    const f = await setup();
    await f.retain('alice', '6001');
    const state = roomState(await f.state(), 'alice', 0);
    expect(state.retention.picks[0]?.player).toMatchObject({ playerTag: 'UNDERDOG', draftPool: 'UNDERDOG', basePriceCr: 1 });
  });
});

describe('reset and locks', () => {
  it('resets purses, picks, squads and player entries', async () => {
    const f = await setup();
    await f.retain('alice', '2001');
    await f.retain('bob', '4001');
    await f.command('FINALIZE_RETENTIONS');
    await f.command('RESET_RETENTIONS');
    const room = await f.state();
    expect(room.retention).toMatchObject({ phase: 'OPEN', picks: [] });
    expect(room.purchases).toHaveLength(0);
    expect(room.players).toHaveLength(0);
    expect(room.teams.every(t => t.spentUnits === 0 && t.playerIds.length === 0 && t.startingBudgetUnits === 200)).toBe(true);
    await f.retain('alice', '2001');
    expect((await f.team('alice')).spentUnits).toBe(30);
  });
  it('locks purse, source and retention settings once picks exist, until reset', async () => {
    const f = await setup();
    await f.retain('alice', '2001');
    await rejects(f.command('UPDATE_SETTINGS', 'host', { settings: { startingBudgetCr: 80 } }), 'RETENTION_LOCKED');
    await rejects(f.command('UPDATE_SETTINGS', 'host', { settings: { retention: { enabled: false } } }), 'RETENTION_LOCKED');
    await rejects(f.rooms.updateSettings(f.room.code, 'host', { startingBudgetCr: 80 }), 'RETENTION_LOCKED');
    await f.command('UPDATE_SETTINGS', 'host', { settings: { playerTimerSeconds: 30 } });
    expect((await f.state()).settings.playerTimerSeconds).toBe(30);
    await f.command('RESET_RETENTIONS');
    await f.command('UPDATE_SETTINGS', 'host', { settings: { startingBudgetCr: 80 } });
    expect((await f.state()).teams.every(t => t.startingBudgetUnits === 160)).toBe(true);
  });
  it('locks the settings after finalize even with zero picks', async () => {
    const f = await setup();
    await f.command('FINALIZE_RETENTIONS');
    await rejects(f.rooms.updateSettings(f.room.code, 'host', { startingBudgetCr: 80 }), 'RETENTION_LOCKED');
  });
  it('lets the host switch retention off while nothing was retained', async () => {
    const f = await setup();
    await f.command('UPDATE_SETTINGS', 'host', { settings: { retention: { enabled: false } } });
    const room = await f.state();
    expect(room.settings.retention.enabled).toBe(false);
    expect(room.retention).toBeUndefined();
    await f.command('START_AUCTION');
  });
  it('releases picks when a team is kicked or leaves before finalize', async () => {
    const f = await setup();
    await f.retain('alice', '2001');
    await f.retain('bob', '4001');
    const alice = await f.team('alice');
    await f.command('KICK_MEMBER', 'host', { targetTeamId: alice.id });
    let room = await f.state();
    expect(room.teams.map(t => t.userId)).toEqual(['host', 'bob']);
    expect(room.retention?.picks.map(p => p.playerId)).toEqual(['4001']);
    expect(room.players.map(p => p.id)).toEqual(['4001']);
    await f.rooms.leave(f.room.code, 'bob');
    room = await f.state();
    expect(room.retention?.picks).toEqual([]);
    expect(room.purchases).toHaveLength(0);
    expect(room.players).toHaveLength(0);
    // The released player can be retained again.
    await f.retain('host', '2001');
  });
  it('blocks join, leave and kick after finalize until the host resets', async () => {
    const f = await setup();
    await f.retain('alice', '2001');
    await f.command('FINALIZE_RETENTIONS');
    await rejects(f.rooms.join(f.room.code, 'carol', { teamName: 'Carol FC' }), 'RETENTION_FINALIZED');
    await rejects(f.rooms.leave(f.room.code, 'alice'), 'RETENTION_FINALIZED');
    await rejects(f.command('KICK_MEMBER', 'host', { targetTeamId: (await f.team('bob')).id }), 'RETENTION_FINALIZED');
    await f.command('RESET_RETENTIONS');
    await f.rooms.join(f.room.code, 'carol', { teamName: 'Carol FC' });
  });
  it('clears retentions when the host closes the lobby', async () => {
    const f = await setup();
    await f.retain('alice', '2001');
    await f.command('END_AUCTION');
    const room = await f.state();
    expect(room.status).toBe('CLOSED');
    expect(room.retention?.picks).toEqual([]);
    expect(room.purchases).toHaveLength(0);
  });
});

describe('bidding after retention', () => {
  it('runs bid, sold and unsold as usual and keeps retained purchases', async () => {
    const f = await setup();
    await f.retain('alice', '2001');
    await f.command('FINALIZE_RETENTIONS');
    await f.command('START_AUCTION');
    const first = await f.state();
    const base = first.active!.currentBidUnits;
    await f.command('PLACE_BID', 'alice', { amountCr: base / 2 });
    await f.expire();
    let room = await f.state();
    const auctioned = room.purchases.find(p => !p.isRetained)!;
    expect(auctioned).toMatchObject({ playerId: first.active!.playerId, priceUnits: base });
    expect(auctioned.acquisitionType).toBeUndefined();
    const alice = room.teams.find(t => t.userId === 'alice')!;
    expect(alice.spentUnits).toBe(30 + base);
    expect(alice.playerIds).toEqual(['2001', first.active!.playerId]);
    await f.command('NEXT_PLAYER');
    await f.expire();
    room = await f.state();
    expect(room.players.filter(p => p.status === 'UNSOLD')).toHaveLength(1);
    expect(room.purchases.filter(p => p.isRetained)).toHaveLength(1);
  });
  it('runs the full flow: settings, join, retain, finalize, start, bid, sold', async () => {
    const f = await setup({ numberOfTeams: 3, minimumParticipants: 3 });
    expect((await f.state()).teams).toHaveLength(3);
    await f.retain('host', '5001');
    await f.retain('alice', '6001');
    await f.retain('alice', '6002');
    await rejects(f.command('START_AUCTION'), 'RETENTION_NOT_FINALIZED');
    await f.command('FINALIZE_RETENTIONS');
    await f.command('START_AUCTION');
    const live = await f.state();
    expect(live.status).toBe('RUNNING');
    expect(live.players.filter(p => p.status === 'SOLD')).toHaveLength(3);
    const price = live.active!.currentBidUnits / 2;
    await f.command('PLACE_BID', 'bob', { amountCr: price });
    await f.expire();
    const done = await f.state();
    const bob = done.teams.find(t => t.userId === 'bob')!;
    expect(bob.spentUnits).toBe(price * 2);
    expect(done.purchases).toHaveLength(4);
    expect(roomState(done, 'bob', 0).soldPlayers.filter(p => p.isRetained)).toHaveLength(3);
  });
});

describe('retention search route', () => {
  it('serves members only, excludes retained players and filters by group', async () => {
    const catalog = await loadCatalog();
    const { app, manager, engine } = await buildApp({
      authService: new StaticTokenAuthService(new Map([['host', { userId: 'host' }], ['outsider', { userId: 'outsider' }]])),
      fc26: catalog, logger: false, timersEnabled: false });
    try {
      const headers = { authorization: 'Bearer host' };
      const created = await app.inject({ method: 'POST', url: '/api/rooms', headers, payload: { auctionName: 'Retention Route', teamName: 'Host FC',
        settings: { playerPoolSource: 'FC26', retention: { enabled: true }, minSquadSize: 1, minimumParticipants: 1 } } });
      expect(created.statusCode).toBe(201);
      const roomCode = created.json().roomCode as string;
      const url = `/api/rooms/${roomCode}/retention/players`;
      expect((await app.inject({ url })).statusCode).toBe(401);
      expect((await app.inject({ url, headers: { authorization: 'Bearer outsider' } })).statusCode).toBe(403);
      const all = await app.inject({ url, headers });
      expect(all.statusCode).toBe(200);
      expect(all.json()).toMatchObject({ total: TOTAL_PLAYERS, retentionPriceCr: 15 });
      expect(all.json().players[0]).toMatchObject({ retentionPriceCr: 15, retainedByTeamId: null, basePriceCr: expect.any(Number) });
      await engine.execute(roomCode, 'host', { type: 'RETAIN_PLAYER', payload: { roomCode, playerId: '2001' } });
      const after = (await app.inject({ url, headers })).json();
      expect(after.total).toBe(TOTAL_PLAYERS - 1);
      expect(after.players.map((p: { id: string }) => p.id)).not.toContain('2001');
      const gk = (await app.inject({ url: `${url}?group=GK`, headers })).json();
      expect(gk.players.length).toBeGreaterThan(0);
      expect(gk.players.every((p: { positions: string[] }) => p.positions.includes('GK'))).toBe(true);
      const search = (await app.inject({ url: `${url}?search=mid%20one`, headers })).json();
      expect(search.players.map((p: { id: string }) => p.id)).toEqual(['4001']);
      expect((await app.inject({ url: `${url}?limit=101`, headers })).statusCode).toBe(400);
      expect((await app.inject({ url: `${url}?group=XX`, headers })).statusCode).toBe(400);
      expect((await manager.loadRoom(roomCode)).retention?.picks).toHaveLength(1);
    } finally { await app.close(); }
  });
});

describe('retention ledger', () => {
  it('mirrors picks and rejects a duplicate (room, player)', async () => {
    const f = await setup();
    await f.retain('alice', '2001');
    await f.retain('bob', '4001');
    const room = await f.state();
    const ledger = new InMemoryRetentionLedger();
    await ledger.sync(room);
    expect(ledger.rows(room.id).map(r => r.playerId).sort()).toEqual(['2001', '4001']);
    expect(ledger.rows(room.id).every(r => r.status === 'ACTIVE' && r.priceUnits === 30)).toBe(true);
    await f.command('FINALIZE_RETENTIONS');
    const final = await f.state();
    await ledger.sync(final);
    expect(ledger.rows(room.id).every(r => r.status === 'FINALIZED' && r.finalizedAt !== null)).toBe(true);
    const duplicated = structuredClone(final);
    duplicated.retention!.picks.push({ ...duplicated.retention!.picks[0]!, id: 'dup', teamId: duplicated.teams[0]!.id });
    await expect(ledger.sync(duplicated)).rejects.toMatchObject({ code: 'DUPLICATE_RETENTION' });
    await f.command('RESET_RETENTIONS');
    await ledger.sync(await f.state());
    expect(ledger.rows(room.id)).toEqual([]);
  });
  it('is fed by the app after retention commits', async () => {
    const catalog = await loadCatalog();
    const ledger = new InMemoryRetentionLedger();
    const { app, engine, manager } = await buildApp({ authService: new StaticTokenAuthService(new Map([['host', { userId: 'host' }]])),
      fc26: catalog, retentionLedger: ledger, logger: false, timersEnabled: false });
    try {
      const created = await app.inject({ method: 'POST', url: '/api/rooms', headers: { authorization: 'Bearer host' }, payload: {
        auctionName: 'Ledger Room', teamName: 'Host FC', settings: { playerPoolSource: 'FC26', retention: { enabled: true }, minSquadSize: 1, minimumParticipants: 1 } } });
      const roomCode = created.json().roomCode as string;
      await engine.execute(roomCode, 'host', { type: 'RETAIN_PLAYER', payload: { roomCode, playerId: '2001' } });
      const room = await manager.loadRoom(roomCode);
      expect(ledger.rows(room.id).map(r => r.playerId)).toEqual(['2001']);
    } finally { await app.close(); }
  });
});

describe('assertRoom retention invariants', () => {
  it('rejects tampered retention state', async () => {
    const f = await setup();
    await f.retain('alice', '2001');
    const good = await f.state();
    const tamper = (change: (room: typeof good) => void) => { const room = structuredClone(good); change(room); return () => assertRoom(room); };
    expect(tamper(r => { r.retention!.picks.push({ ...r.retention!.picks[0]!, id: 'x' }); })).toThrow();
    expect(tamper(r => { r.purchases[0]!.priceUnits = 20; r.teams.find(t => t.userId === 'alice')!.spentUnits = 20; })).toThrow();
    expect(tamper(r => { r.settings.retention.enabled = false; r.settings.playerPoolSource = 'DEFAULT'; })).toThrow();
    expect(tamper(r => { r.retention!.picks[0]!.priceUnits = 20; })).toThrow();
    expect(tamper(r => { r.retention!.picks = []; })).toThrow();
  });
});

describe('legacy snapshots', () => {
  it('hydrates a room saved without the retention/playerPoolSource settings as retention OFF', async () => {
    const f = await fixture({});
    const stored = structuredClone(await f.manager.repository.findByCode(f.room.code)) as unknown as { settings: Record<string, unknown> };
    delete stored.settings.retention;
    delete stored.settings.playerPoolSource;
    const repo = new MemoryRoomRepository();
    await repo.create(stored as never);
    const fresh = new RoomManager(repo, new CatalogPlayerRepository(demoPlayers.slice(0, 2)), { now: () => 1_000_000 });
    const loaded = await fresh.loadRoom(f.room.code);
    expect(loaded.settings.retention).toEqual({ enabled: false });
    expect(roomState(loaded, 'host', 0).retention).toMatchObject({ enabled: false, phase: 'OFF' });
  });
});
