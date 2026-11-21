import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
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
import type { Room, ServerEvent } from '../src/domain/types.js';
const FIXTURES = resolve(import.meta.dirname, 'fixtures/fc26');
const loadCatalog = async () => { const c = new MemoryFc26Catalog(resolveFc26Config({ FC26_DATA_DIR: FIXTURES })); await c.importAll(); return c; };
// Fixture catalog ids: GK 1001; CB 2001/2002; FB 3001; MID 4001-4003; ATT 5001/5002; Underdogs 6001-6003, 9001.
const TOTAL_PLAYERS = 14;
// Team order is the joining order: host (Team 1), alice (Team 2), bob (Team 3), optionally carol (Team 4).
async function setup(settings: Record<string, unknown> = {}, enabled = true) {
  const catalog = await loadCatalog();
  const f = await fixture({ playerPoolSource: 'FC26', retention: { enabled }, startingBudgetCr: 100, minSquadSize: 1, maxSquadSize: 5,
    ...settings } as never, undefined, 2, catalog);
  const retain = (user: string, playerId: string) => f.command('RETAIN_PLAYER', user, { playerId });
  const remove = (user: string, playerId: string) => f.command('REMOVE_RETENTION_PLAYER', user, { playerId });
  const confirm = (user: string) => f.command('CONFIRM_RETENTION', user);
  const skip = (user: string) => f.command('SKIP_RETENTION', user);
  const start = () => f.command('START_RETENTION');
  const team = async (user: string) => (await f.state()).teams.find(t => t.userId === user)!;
  const events: ServerEvent[] = [];
  f.manager.subscribe((_room, committed) => { events.push(...committed); });
  const turn = async (user: string, ids: string[]) => {
    for (const id of ids) await retain(user, id);
    return ids.length ? confirm(user) : skip(user);
  };
  const view = async (user: string) => roomState(await f.state(), user, 0).retention;
  return { ...f, catalog, retain, remove, confirm, skip, start, team, events, turn, view };
}
const code = (error: unknown) => (error as { code?: string }).code;
const rejects = async (promise: Promise<unknown>, expected: string) => {
  const error = await promise.then(() => null, e => e);
  expect(code(error), String(error)).toBe(expected);
};
const ofType = (events: ServerEvent[], type: string) => events.filter(e => e.type === type);

describe('retention constants', () => {
  it('fixes the price at 15 Cr (30 units) with 0..3 players per team', () => {
    expect([RETENTION_PRICE_CR, RETENTION_PRICE_UNITS, RETENTION_MIN_PER_TEAM, RETENTION_MAX_PER_TEAM]).toEqual([15, 30, 0, 3]);
  });
});

describe('retention OFF', () => {
  it('skips the phase entirely: no retention commands, START_AUCTION unchanged', async () => {
    const f = await setup({}, false);
    await rejects(f.start(), 'RETENTION_NOT_ENABLED');
    await rejects(f.retain('host', '2001'), 'RETENTION_NOT_ENABLED');
    await f.command('START_AUCTION');
    const room = await f.state();
    expect(room.status).toBe('RUNNING');
    expect(room.retention).toBeUndefined();
    expect(room.players).toHaveLength(TOTAL_PLAYERS);
    expect(roomState(room, 'host', 0).retention).toMatchObject({ enabled: false, phase: 'OFF', picks: [], turns: [], order: [] });
  });
});

describe('sequential order', () => {
  it('blocks START_AUCTION until the sequence is finalized', async () => {
    const f = await setup();
    await rejects(f.command('START_AUCTION'), 'RETENTION_NOT_FINALIZED');
    await f.start();
    await rejects(f.command('START_AUCTION'), 'RETENTION_NOT_FINALIZED');
    for (const user of ['host', 'alice', 'bob']) await f.turn(user, []);
    await rejects(f.command('START_AUCTION'), 'RETENTION_NOT_FINALIZED');
    await f.command('FINALIZE_RETENTIONS');
    await f.command('START_AUCTION');
    expect((await f.state()).status).toBe('RUNNING');
  });
  it('only the host starts it, Team 1 is active first and the order is frozen', async () => {
    const f = await setup();
    await rejects(f.retain('host', '2001'), 'RETENTION_NOT_STARTED');
    await rejects(f.command('START_RETENTION', 'alice'), 'HOST_REQUIRED');
    await f.start();
    await rejects(f.start(), 'RETENTION_ALREADY_STARTED');
    const state = await f.view('alice');
    const room = await f.state();
    expect(state).toMatchObject({ phase: 'TEAM_SELECTING', activeTeamId: room.teams[0]!.id, activeTeamName: 'Host FC', canAct: false, canSkipForActive: false,
      progress: { completed: 0, total: 3 } });
    expect(state.order.map(o => [o.name, o.order, o.turnStatus])).toEqual([['Host FC', 1, 'ACTIVE'], ['Alice FC', 2, 'PENDING'], ['Bob FC', 3, 'PENDING']]);
    expect((await f.view('host')).canAct).toBe(true);
    expect((await f.view('host')).canSkipForActive).toBe(true);
  });
  it('rejects a non-active team that tries to select, remove, confirm or skip', async () => {
    const f = await setup();
    await f.start();
    await rejects(f.retain('alice', '2001'), 'NOT_ACTIVE_TEAM');
    await rejects(f.remove('alice', '2001'), 'NOT_ACTIVE_TEAM');
    await rejects(f.confirm('bob'), 'NOT_ACTIVE_TEAM');
    await rejects(f.skip('bob'), 'NOT_ACTIVE_TEAM');
    await rejects(f.retain('mallory', '2001'), 'NOT_ROOM_MEMBER');
    const room = await f.state();
    expect(room.retention).toMatchObject({ picks: [], drafts: [], turns: [] });
  });
  it('does not trust a client-supplied team or price', async () => {
    const f = await setup();
    await f.start();
    const room = await f.state();
    await expect(f.engine.execute(room.code, 'alice', { type: 'RETAIN_PLAYER', payload: { roomCode: room.code, playerId: '2001', teamId: room.teams[1]!.id, price: 1 } } as never)).rejects.toThrow();
    await expect(f.engine.execute(room.code, 'alice', { type: 'CONFIRM_RETENTION', payload: { roomCode: room.code, teamId: room.teams[1]!.id } } as never)).rejects.toThrow();
    expect((await f.state()).retention?.drafts).toEqual([]);
  });
  it('advances automatically after confirm and after skip, one team at a time', async () => {
    const f = await setup();
    await f.start();
    await f.turn('host', ['2001']);
    let state = await f.view('alice');
    expect(state).toMatchObject({ phase: 'TEAM_SELECTING', activeTeamName: 'Alice FC', canAct: true, progress: { completed: 1, total: 3 } });
    expect(state.order.map(o => o.turnStatus)).toEqual(['COMPLETED', 'ACTIVE', 'PENDING']);
    await rejects(f.retain('host', '4001'), 'TURN_ALREADY_COMPLETED');
    await rejects(f.confirm('bob'), 'NOT_ACTIVE_TEAM');
    await f.turn('alice', []);
    state = await f.view('bob');
    expect(state.order.map(o => o.turnStatus)).toEqual(['COMPLETED', 'SKIPPED', 'ACTIVE']);
    await f.turn('bob', ['5001']);
    state = await f.view('host');
    expect(state).toMatchObject({ phase: 'ALL_TEAMS_COMPLETED', activeTeamId: null, progress: { completed: 3, total: 3 }, canAct: false });
    await rejects(f.retain('bob', '4001'), 'TURN_ALREADY_COMPLETED');
  });
  it('lets the host skip on behalf of an absent active manager, and nobody else', async () => {
    const f = await setup();
    await f.start();
    await f.turn('host', []);
    await rejects(f.skip('bob'), 'NOT_ACTIVE_TEAM');
    await f.retain('alice', '2001');
    await f.skip('host');
    const room = await f.state();
    expect(room.retention?.drafts).toEqual([]);
    expect(room.retention?.turns?.map(t => [t.kind, t.confirmedBy])).toEqual([['SKIPPED', 'host'], ['SKIPPED', 'host']]);
    expect(room.retention?.activeTeamId).toBe(room.teams[2]!.id);
    await rejects(f.retain('alice', '2001'), 'TURN_ALREADY_COMPLETED');
  });
});

describe('selecting players', () => {
  it.each([1, 2, 3])('confirms %i retained players for the active team', async count => {
    const f = await setup();
    await f.start();
    await f.turn('host', ['2001', '4001', '5001'].slice(0, count));
    const room = await f.state();
    expect(room.retention?.picks).toHaveLength(count);
    expect(room.retention?.turns?.[0]).toMatchObject({ kind: 'RETAINED', order: 1, spentUnits: 30 * count, remainingUnits: 200 - 30 * count });
    // Nothing is charged or added to the squad before finalize.
    expect(room.teams.every(t => t.spentUnits === 0 && t.playerIds.length === 0)).toBe(true);
    expect(room.purchases).toHaveLength(0);
    expect(() => assertRoom(room)).not.toThrow();
    const host = (await f.view('alice')).teams[0]!;
    expect(host).toMatchObject({ retainedCount: count, remainingSlots: 3 - count, spentCr: 15 * count, remainingPurseCr: 100 - 15 * count });
    expect(roomState(room, 'alice', 0).teams[0]).toMatchObject({ retainedCount: count, retentionSpentCr: 15 * count, remainingBudgetCr: 100 - 15 * count });
  });
  it('rejects confirm with zero players (explicit skip is required) and allows zero via skip', async () => {
    const f = await setup();
    await f.start();
    await rejects(f.confirm('host'), 'USE_SKIP_RETENTION');
    await f.skip('host');
    expect((await f.view('host')).turns[0]).toMatchObject({ kind: 'SKIPPED', players: [], spentCr: 0, remainingPurseCr: 100 });
  });
  it('rejects a fourth player, a duplicate selection and unknown players', async () => {
    const f = await setup();
    await f.start();
    for (const id of ['2001', '4001', '5001']) await f.retain('host', id);
    await rejects(f.retain('host', '3001'), 'RETENTION_LIMIT_REACHED');
    await rejects(f.retain('host', '2001'), 'ALREADY_SELECTED');
    await f.remove('host', '5001');
    await rejects(f.remove('host', '5001'), 'DRAFT_NOT_FOUND');
    await rejects(f.retain('host', 'nobody-123'), 'RETENTION_PLAYER_NOT_FOUND');
    await f.retain('host', '3001');
    expect((await f.state()).retention?.drafts).toHaveLength(3);
  });
  it('rejects a player another team already retained, and frees removed players', async () => {
    const f = await setup();
    await f.start();
    await f.retain('host', '2001');
    await f.remove('host', '2001');
    await f.retain('host', '2001');
    await f.confirm('host');
    await rejects(f.retain('alice', '2001'), 'PLAYER_ALREADY_RETAINED');
    await f.retain('alice', '4001');
    await f.remove('alice', '4001');
    await f.skip('alice');
    await f.retain('bob', '4001');
    expect((await f.state()).retention?.drafts?.map(d => d.teamId)).toEqual([(await f.team('bob')).id]);
  });
  it('rejects selections the purse cannot cover and respects the squad limit', async () => {
    const poor = await setup({ startingBudgetCr: 20 });
    await poor.start();
    await poor.retain('host', '2001');
    await rejects(poor.retain('host', '4001'), 'INSUFFICIENT_PURSE');
    await poor.confirm('host');
    const room = await poor.state();
    expect(room.teams.every(t => t.spentUnits === 0)).toBe(true);
    const tight = await setup({ minSquadSize: 1, maxSquadSize: 1 });
    await tight.start();
    await tight.retain('host', '2001');
    await rejects(tight.retain('host', '4001'), 'SQUAD_FULL');
  });
  it('lets exactly one of several concurrent selections of the same player succeed', async () => {
    const f = await setup();
    await f.start();
    const results = await Promise.allSettled([f.retain('host', '2001'), f.retain('alice', '2001'), f.retain('bob', '2001')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map(r => code(r.reason))).toEqual(['NOT_ACTIVE_TEAM', 'NOT_ACTIVE_TEAM']);
    expect((await f.state()).retention?.drafts).toHaveLength(1);
  });
  it('replays an idempotent confirm without creating a second turn', async () => {
    const f = await setup();
    await f.start();
    await f.retain('host', '2001');
    await f.command('CONFIRM_RETENTION', 'host', {}, 'confirm-1');
    const again = await f.command('CONFIRM_RETENTION', 'host', {}, 'confirm-1');
    expect(again.duplicate).toBe(true);
    const room = await f.state();
    expect(room.retention?.turns).toHaveLength(1);
    expect(ofType(f.events, 'RETENTION_TEAM_CONFIRMED')).toHaveLength(1);
  });
});

describe('privacy of unconfirmed selections', () => {
  it('shows other viewers only anonymous reservations, never the owner or player data', async () => {
    const f = await setup();
    await f.start();
    await f.retain('host', '2001');
    const name = (await f.catalog.get('2001'))!.name;
    const room = await f.state();
    const ownerView = roomState(room, 'host', 0);
    expect(ownerView.retention.ownDraft.players.map(p => p.id)).toEqual(['2001']);
    expect(ownerView.retention.ownDraft).toMatchObject({ spentCr: 15, remainingPurseCr: 85 });
    for (const viewer of ['alice', 'bob']) {
      const view = roomState(room, viewer, 0);
      expect(view.retention.reservedPlayerIds).toEqual(['2001']);
      expect(view.retention.ownDraft.players).toEqual([]);
      expect(view.retention.picks).toEqual([]);
      expect(JSON.stringify(view)).not.toContain(name);
      expect(view.teams.every(t => t.retainedCount === 0 && t.remainingBudgetCr === 100)).toBe(true);
      expect(view.players).toEqual([]);
    }
    const reserved = ofType(f.events, 'RETENTION_PLAYER_RESERVED');
    expect(reserved).toHaveLength(1);
    expect(reserved[0]!.payload).toEqual({ playerId: '2001' });
    await f.remove('host', '2001');
    expect(ofType(f.events, 'RETENTION_PLAYER_RELEASED')[0]!.payload).toEqual({ playerId: '2001' });
  });
});

describe('announcement events', () => {
  it('emits one RETENTION_TEAM_CONFIRMED per turn with a unique id and the confirmed data only', async () => {
    const f = await setup();
    await f.start();
    expect(ofType(f.events, 'RETENTION_STARTED')[0]!.payload).toMatchObject({ order: [{ name: 'Host FC', order: 1 }, { name: 'Alice FC', order: 2 }, { name: 'Bob FC', order: 3 }] });
    expect(ofType(f.events, 'RETENTION_TURN_STARTED')).toHaveLength(1);
    await f.retain('host', '2001');
    expect(ofType(f.events, 'RETENTION_TEAM_CONFIRMED')).toHaveLength(0);
    await f.confirm('host');
    await f.skip('alice');
    await f.turn('bob', ['6001', '4001']);
    const confirmed = ofType(f.events, 'RETENTION_TEAM_CONFIRMED').map(e => e.payload as Record<string, unknown> & { players: Record<string, unknown>[] });
    expect(confirmed).toHaveLength(3);
    expect(new Set(confirmed.map(c => c.eventId)).size).toBe(3);
    expect(confirmed[0]).toMatchObject({ kind: 'RETAINED', teamName: 'Host FC', teamOrder: 1, totalTeams: 3, spentCr: 15, remainingPurseCr: 85, nextTeamName: 'Alice FC',
      nextTeamOrder: 2, allCompleted: false });
    expect(confirmed[0]!.players[0]).toMatchObject({ playerId: '2001', ovr: expect.any(Number), position: 'CB', priceCr: 15, imageUrl: expect.any(String), nationality: expect.any(String) });
    expect(confirmed[1]).toMatchObject({ kind: 'SKIPPED', teamName: 'Alice FC', players: [], spentCr: 0, remainingPurseCr: 100, nextTeamName: 'Bob FC' });
    expect(confirmed[2]).toMatchObject({ kind: 'RETAINED', teamOrder: 3, spentCr: 30, remainingPurseCr: 70, nextTeamId: null, nextTeamName: null, allCompleted: true });
    expect(confirmed[2]!.players.find(p => p.playerId === '6001')).toMatchObject({ playerTag: 'UNDERDOG', draftPool: 'UNDERDOG' });
    expect(ofType(f.events, 'RETENTION_TURN_STARTED')).toHaveLength(3);
    // The room state exposes the same persisted payloads, so a reconnecting client can dedupe by eventId.
    const state = await f.view('alice');
    expect(state.turns.map(t => t.eventId)).toEqual(confirmed.map(c => c.eventId));
    expect(state.turns[0]).toEqual(confirmed[0]);
    expect(state.lastCompleted?.eventId).toBe(confirmed[2]!.eventId);
  });
  it('emits RETENTION_ALL_COMPLETED exactly once, with every team overview', async () => {
    const f = await setup();
    await f.start();
    await f.turn('host', ['2001']);
    await f.turn('alice', []);
    expect(ofType(f.events, 'RETENTION_ALL_COMPLETED')).toHaveLength(0);
    await f.turn('bob', ['4001', '5001']);
    const all = ofType(f.events, 'RETENTION_ALL_COMPLETED');
    expect(all).toHaveLength(1);
    expect(all[0]!.payload).toMatchObject({ eventId: expect.any(String), teams: [
      { name: 'Host FC', order: 1, retainedCount: 1, spentCr: 15, remainingPurseCr: 85 },
      { name: 'Alice FC', order: 2, retainedCount: 0, spentCr: 0, remainingPurseCr: 100 },
      { name: 'Bob FC', order: 3, retainedCount: 2, spentCr: 30, remainingPurseCr: 70 }] });
    const eventIds = [...ofType(f.events, 'RETENTION_TEAM_CONFIRMED'), ...all].map(e => (e.payload as { eventId: string }).eventId);
    expect(new Set(eventIds).size).toBe(4);
    expect((await f.view('host')).completion?.eventId).toBe((all[0]!.payload as { eventId: string }).eventId);
  });
});

describe('finalize', () => {
  it('is host-only and needs every team to complete', async () => {
    const f = await setup();
    await rejects(f.command('FINALIZE_RETENTIONS'), 'RETENTION_NOT_COMPLETE');
    await f.start();
    await rejects(f.command('FINALIZE_RETENTIONS'), 'RETENTION_NOT_COMPLETE');
    await f.turn('host', []);
    await f.turn('alice', []);
    await rejects(f.command('FINALIZE_RETENTIONS'), 'RETENTION_NOT_COMPLETE');
    await f.turn('bob', []);
    await rejects(f.command('FINALIZE_RETENTIONS', 'alice'), 'HOST_REQUIRED');
    await rejects(f.command('RESET_RETENTIONS', 'bob'), 'HOST_REQUIRED');
    await f.command('FINALIZE_RETENTIONS');
    await rejects(f.command('FINALIZE_RETENTIONS'), 'RETENTION_CLOSED');
    expect(ofType(f.events, 'RETENTION_FINALIZED')).toHaveLength(1);
  });
  it('puts retained players into squads at 15 Cr and deducts purses: 200 -> 200/185/170/155', async () => {
    const f = await setup({ startingBudgetCr: 200, numberOfTeams: 4 });
    await f.rooms.join(f.room.code, 'carol', { teamName: 'Carol FC' });
    await f.start();
    await f.turn('host', []);
    await f.turn('alice', ['2001']);
    await f.turn('bob', ['4001', '5001']);
    await f.turn('carol', ['6001', '6002', '1001']);
    const before = roomState(await f.state(), 'host', 0);
    expect(before.teams.map(t => t.remainingBudgetCr)).toEqual([200, 185, 170, 155]);
    expect(before.soldPlayers).toEqual([]);
    await f.command('FINALIZE_RETENTIONS');
    const room = await f.state();
    expect(room.retention?.phase).toBe('FINALIZED');
    expect(room.teams.map(t => (t.startingBudgetUnits - t.spentUnits) / 2)).toEqual([200, 185, 170, 155]);
    expect(room.teams.map(t => t.playerIds)).toEqual([[], ['2001'], ['4001', '5001'], ['6001', '6002', '1001']]);
    expect(room.purchases).toHaveLength(6);
    expect(room.purchases.every(p => p.priceUnits === 30 && p.acquisitionType === 'RETENTION' && p.isRetained)).toBe(true);
    expect(room.players.filter(p => p.status === 'SOLD').map(p => p.id).sort()).toEqual(['1001', '2001', '4001', '5001', '6001', '6002']);
    expect(() => assertRoom(room)).not.toThrow();
    const state = roomState(room, 'bob', 0);
    expect(state.teams.map(t => [t.spentCr, t.remainingBudgetCr, t.playersOwned, t.retainedCount])).toEqual([[0, 200, 0, 0], [15, 185, 1, 1], [30, 170, 2, 2], [45, 155, 3, 3]]);
    expect(state.soldPlayers.every(p => p.acquisitionType === 'RETENTION' && p.isRetained && p.priceCr === 15)).toBe(true);
    expect(state.retention).toMatchObject({ phase: 'FINALIZED', totals: { retained: 6, spentCr: 90 } });
    expect(state.retention.picks.map(p => [p.teamName, p.playerId])).toContainEqual(['Carol FC', '6001']);
    expect(state.retention.picks[0]!.player).toMatchObject({ id: '2001', name: expect.any(String) });
    const detail = await f.manager.loadRoom(f.room.code);
    expect(detail.purchases.find(p => p.playerId === '6001')).toMatchObject({ teamId: room.teams[3]!.id });
    expect(ofType(f.events, 'RETENTION_FINALIZED')[0]!.payload).toMatchObject({ totalRetained: 6, totalSpentCr: 90 });
  });
  it('keeps retained players out of the queue, the active slot, unsold and recall for a whole auction', async () => {
    const f = await setup();
    await f.start();
    const retained = ['2001', '4001', '5001'];
    await f.turn('host', retained);
    await f.turn('alice', ['1001']);
    await f.turn('bob', []);
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
    await f.command('START_RECALL');
    const recall = await f.state();
    expect(recall.playerQueue.every(id => !all.includes(id))).toBe(true);
    expect(all).not.toContain(recall.active!.playerId);
    expect(recall.purchases.filter(p => p.isRetained)).toHaveLength(4);
  });
  it('runs bids after retention with unchanged rules and keeps retained purchases', async () => {
    const f = await setup();
    await f.start();
    await f.turn('host', []);
    await f.turn('alice', ['2001']);
    await f.turn('bob', []);
    await f.command('FINALIZE_RETENTIONS');
    await f.command('START_AUCTION');
    const first = await f.state();
    const base = first.active!.currentBidUnits;
    await f.command('PLACE_BID', 'alice', { amountCr: base / 2 });
    await f.expire();
    const room = await f.state();
    const alice = room.teams.find(t => t.userId === 'alice')!;
    expect(alice.spentUnits).toBe(30 + base);
    expect(alice.playerIds).toEqual(['2001', first.active!.playerId]);
    expect(room.purchases.find(p => !p.isRetained)).toMatchObject({ playerId: first.active!.playerId, priceUnits: base });
  });
});

describe('reset, locks and membership', () => {
  it('resets drafts, picks, turns, purses and squads, then allows a fresh start', async () => {
    const f = await setup();
    await f.start();
    await f.turn('host', ['2001']);
    await f.turn('alice', ['4001']);
    await f.retain('bob', '5001');
    await f.command('RESET_RETENTIONS');
    let room = await f.state();
    expect(room.retention).toEqual({ phase: 'NOT_STARTED', picks: [], drafts: [], turns: [] });
    await f.start();
    for (const user of ['host', 'alice', 'bob']) await f.turn(user, user === 'host' ? ['2001'] : []);
    await f.command('FINALIZE_RETENTIONS');
    await f.command('RESET_RETENTIONS');
    room = await f.state();
    expect(room.purchases).toHaveLength(0);
    expect(room.players).toHaveLength(0);
    expect(room.teams.every(t => t.spentUnits === 0 && t.playerIds.length === 0)).toBe(true);
  });
  it('locks purse, source and retention settings once started, until reset', async () => {
    const f = await setup();
    await f.command('UPDATE_SETTINGS', 'host', { settings: { startingBudgetCr: 90 } });
    await f.start();
    await rejects(f.command('UPDATE_SETTINGS', 'host', { settings: { startingBudgetCr: 80 } }), 'RETENTION_LOCKED');
    await rejects(f.command('UPDATE_SETTINGS', 'host', { settings: { retention: { enabled: false } } }), 'RETENTION_LOCKED');
    await rejects(f.rooms.updateSettings(f.room.code, 'host', { startingBudgetCr: 80 }), 'RETENTION_LOCKED');
    await f.command('UPDATE_SETTINGS', 'host', { settings: { playerTimerSeconds: 30 } });
    await f.command('RESET_RETENTIONS');
    await f.command('UPDATE_SETTINGS', 'host', { settings: { startingBudgetCr: 80 } });
    expect((await f.state()).teams.every(t => t.startingBudgetUnits === 160)).toBe(true);
  });
  it('lets the host switch retention off while it has not started', async () => {
    const f = await setup();
    await f.command('UPDATE_SETTINGS', 'host', { settings: { retention: { enabled: false } } });
    expect((await f.state()).retention).toBeUndefined();
    await f.command('START_AUCTION');
  });
  it('blocks join, leave and kick while retention is in progress or finalized', async () => {
    const f = await setup();
    await f.start();
    await rejects(f.rooms.join(f.room.code, 'carol', { teamName: 'Carol FC' }), 'RETENTION_IN_PROGRESS');
    await rejects(f.rooms.leave(f.room.code, 'alice'), 'RETENTION_IN_PROGRESS');
    await rejects(f.command('KICK_MEMBER', 'host', { targetTeamId: (await f.team('bob')).id }), 'RETENTION_IN_PROGRESS');
    // An existing member re-joining is idempotent.
    await f.rooms.join(f.room.code, 'alice', { teamName: 'Alice FC' });
    await f.command('RESET_RETENTIONS');
    await f.rooms.join(f.room.code, 'carol', { teamName: 'Carol FC' });
  });
  it('clears retention when the host closes the lobby', async () => {
    const f = await setup();
    await f.start();
    await f.turn('host', ['2001']);
    await f.command('END_AUCTION');
    const room = await f.state();
    expect(room.status).toBe('CLOSED');
    expect(room.retention).toEqual({ phase: 'NOT_STARTED', picks: [], drafts: [], turns: [] });
  });
});

describe('refresh and reconnect', () => {
  it('reloads the same retention state from the repository, including the owner draft', async () => {
    const f = await setup();
    await f.start();
    await f.turn('host', ['2001']);
    await f.retain('alice', '4001');
    const repo = f.manager.repository;
    const fresh = new RoomManager(repo, new CatalogPlayerRepository(demoPlayers.slice(0, 2)), { now: () => 1_000_000 }, undefined, undefined, f.catalog);
    const reloaded = await fresh.loadRoom(f.room.code);
    for (const user of ['host', 'alice', 'bob']) {
      expect(roomState(reloaded, user, 0).retention).toEqual(roomState(await f.state(), user, 0).retention);
    }
    expect(roomState(reloaded, 'alice', 0).retention).toMatchObject({ phase: 'TEAM_SELECTING', canAct: true, activeTeamName: 'Alice FC',
      ownDraft: { players: [expect.objectContaining({ id: '4001' })] }, progress: { completed: 1, total: 3 } });
    expect(roomState(reloaded, 'bob', 0).retention.ownDraft.players).toEqual([]);
    // The reloaded manager continues the same sequence.
    await fresh.mutate(f.room.code, () => undefined);
    expect(reloaded.retention?.turns).toHaveLength(1);
  });
});

describe('retention search route', () => {
  it('serves members only, hides confirmed picks and others\' reservations, flags own drafts', async () => {
    const catalog = await loadCatalog();
    const { app, manager, engine } = await buildApp({
      authService: new StaticTokenAuthService(new Map([['host', { userId: 'host' }], ['alice', { userId: 'alice' }], ['outsider', { userId: 'outsider' }]])),
      fc26: catalog, logger: false, timersEnabled: false });
    try {
      const headers = { authorization: 'Bearer host' };
      const created = await app.inject({ method: 'POST', url: '/api/rooms', headers, payload: { auctionName: 'Retention Route', teamName: 'Host FC',
        settings: { playerPoolSource: 'FC26', retention: { enabled: true }, minSquadSize: 1, minimumParticipants: 1 } } });
      expect(created.statusCode).toBe(201);
      const roomCode = created.json().roomCode as string;
      await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/join`, headers: { authorization: 'Bearer alice' }, payload: { teamName: 'Alice FC' } });
      const url = `/api/rooms/${roomCode}/retention/players`;
      expect((await app.inject({ url })).statusCode).toBe(401);
      expect((await app.inject({ url, headers: { authorization: 'Bearer outsider' } })).statusCode).toBe(403);
      const all = await app.inject({ url, headers });
      expect(all.statusCode).toBe(200);
      expect(all.json()).toMatchObject({ total: TOTAL_PLAYERS, retentionPriceCr: 15 });
      expect(all.json().players[0]).toMatchObject({ retentionPriceCr: 15, retainedByTeamId: null, selected: false, basePriceCr: expect.any(Number) });
      await engine.execute(roomCode, 'host', { type: 'START_RETENTION', payload: { roomCode } });
      await engine.execute(roomCode, 'host', { type: 'RETAIN_PLAYER', payload: { roomCode, playerId: '2001' } });
      const own = (await app.inject({ url, headers })).json();
      expect(own.total).toBe(TOTAL_PLAYERS);
      expect(own.players.find((p: { id: string }) => p.id === '2001')).toMatchObject({ selected: true });
      const other = (await app.inject({ url, headers: { authorization: 'Bearer alice' } })).json();
      expect(other.total).toBe(TOTAL_PLAYERS - 1);
      expect(other.players.map((p: { id: string }) => p.id)).not.toContain('2001');
      await engine.execute(roomCode, 'host', { type: 'CONFIRM_RETENTION', payload: { roomCode } });
      const after = (await app.inject({ url, headers })).json();
      expect(after.players.map((p: { id: string }) => p.id)).not.toContain('2001');
      const gk = (await app.inject({ url: `${url}?group=GK`, headers })).json();
      expect(gk.players.length).toBeGreaterThan(0);
      expect(gk.players.every((p: { positions: string[] }) => p.positions.includes('GK'))).toBe(true);
      for (const [group, position] of [['CDM', 'CDM'], ['CMID', 'CM'], ['CAM', 'CAM']] as const) {
        const found = (await app.inject({ url: `${url}?group=${group}`, headers })).json();
        expect(found.players.every((p: { positions: string[] }) => p.positions.includes(position)), group).toBe(true);
      }
      const search = (await app.inject({ url: `${url}?search=mid%20one`, headers })).json();
      expect(search.players.map((p: { id: string }) => p.id)).toEqual(['4001']);
      expect((await app.inject({ url: `${url}?limit=101`, headers })).statusCode).toBe(400);
      expect((await app.inject({ url: `${url}?group=XX`, headers })).statusCode).toBe(400);
      expect((await manager.loadRoom(roomCode)).retention?.picks).toHaveLength(1);
      const team = (await manager.loadRoom(roomCode)).teams[0]!;
      const detail = await app.inject({ url: `/api/rooms/${roomCode}/teams/${team.id}`, headers });
      expect(detail.statusCode).toBe(200);
    } finally { await app.close(); }
  });
});

describe('multi-client delivery', () => {
  const cleanup: Array<() => Promise<unknown>> = [];
  afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
  const origin = 'http://localhost:5173';
  const waitFor = (socket: WebSocket, type: string, ms = 3000) => new Promise<ServerEvent>((resolveEvent, reject) => {
    const timer = setTimeout(() => { socket.off('message', listener); reject(new Error('Timed out waiting for ' + type)); }, ms);
    function listener(raw: Buffer) {
      const message = JSON.parse(raw.toString()) as ServerEvent;
      if (message.type === type) { clearTimeout(timer); socket.off('message', listener); resolveEvent(message); }
    }
    socket.on('message', listener);
  });
  const quiet = (socket: WebSocket, type: string, ms = 300) => new Promise<boolean>(resolveQuiet => {
    const seen: string[] = [];
    const listener = (raw: Buffer) => { seen.push((JSON.parse(raw.toString()) as ServerEvent).type); };
    socket.on('message', listener);
    setTimeout(() => { socket.off('message', listener); resolveQuiet(!seen.includes(type)); }, ms);
  });
  const send = (socket: WebSocket, type: string, payload: unknown, response = 'COMMAND_ACK') => {
    const requestId = crypto.randomUUID();
    const result = new Promise<ServerEvent>((resolveEvent, reject) => {
      const timer = setTimeout(() => { socket.off('message', listener); reject(new Error('Timed out waiting for ' + response)); }, 3000);
      function listener(raw: Buffer) {
        const message = JSON.parse(raw.toString()) as ServerEvent;
        if (message.type === response && message.requestId === requestId) { clearTimeout(timer); socket.off('message', listener); resolveEvent(message); }
        if (message.type === 'ERROR' && message.requestId === requestId) { clearTimeout(timer); socket.off('message', listener); reject(new Error(JSON.stringify(message.payload))); }
      }
      socket.on('message', listener);
    });
    socket.send(JSON.stringify({ type, payload, requestId }));
    return result;
  };
  it('delivers the same confirmed turn to every client once, and a reconnecting client gets state without a replay', async () => {
    const catalog = await loadCatalog();
    const users = ['host', 'alice', 'bob'];
    const { app, manager } = await buildApp({ authService: new StaticTokenAuthService(new Map(users.map(u => [u + '-token', { userId: u }]))),
      fc26: catalog, logger: false, timersEnabled: false });
    cleanup.push(() => app.close());
    await app.ready();
    const created = await app.inject({ method: 'POST', url: '/api/rooms', headers: { authorization: 'Bearer host-token' }, payload: { auctionName: 'Realtime Retention',
      teamName: 'Host FC', settings: { playerPoolSource: 'FC26', retention: { enabled: true }, minSquadSize: 1, minimumParticipants: 2 } } });
    const roomCode = created.json().roomCode as string;
    for (const user of ['alice', 'bob']) await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/join`, headers: { authorization: `Bearer ${user}-token` }, payload: { teamName: user + ' FC' } });
    const sockets = new Map<string, WebSocket>();
    for (const user of users) {
      const socket = await app.injectWS('/ws?token=' + user + '-token', { headers: { origin } });
      sockets.set(user, socket);
      await send(socket, 'JOIN_ROOM', { roomCode }, 'ROOM_STATE');
    }
    await send(sockets.get('host')!, 'START_RETENTION', { roomCode });
    expect((await send(sockets.get('alice')!, 'RETAIN_PLAYER', { roomCode, playerId: '2001' }, 'ERROR')).payload).toMatchObject({ reason: 'NOT_ACTIVE_TEAM' });
    await send(sockets.get('host')!, 'RETAIN_PLAYER', { roomCode, playerId: '2001' });
    const received = users.map(u => waitFor(sockets.get(u)!, 'RETENTION_TEAM_CONFIRMED'));
    await send(sockets.get('host')!, 'CONFIRM_RETENTION', { roomCode });
    const events = await Promise.all(received);
    const ids = events.map(e => (e.payload as { eventId: string }).eventId);
    expect(new Set(ids).size).toBe(1);
    expect(events[0]!.payload).toMatchObject({ kind: 'RETAINED', teamName: 'Host FC', spentCr: 15, nextTeamName: 'alice FC' });
    // Reconnect: fresh state carries the persisted turn, and the confirmed event is not delivered again.
    sockets.get('bob')!.terminate();
    const reconnect = await app.injectWS('/ws?token=bob-token', { headers: { origin } });
    const silent = quiet(reconnect, 'RETENTION_TEAM_CONFIRMED');
    const state = await send(reconnect, 'REJOIN_ROOM', { roomCode }, 'ROOM_STATE');
    const retention = (state.payload as { retention: { turns: { eventId: string }[]; phase: string; activeTeamName: string; reservedPlayerIds: string[] } }).retention;
    expect(retention.turns.map(t => t.eventId)).toEqual([ids[0]]);
    expect(retention).toMatchObject({ phase: 'TEAM_SELECTING', activeTeamName: 'alice FC', reservedPlayerIds: [] });
    expect(await silent).toBe(true);
    // Remaining turns end with the all-completed broadcast to everyone.
    await send(sockets.get('alice')!, 'SKIP_RETENTION', { roomCode });
    const done = users.filter(u => u !== 'bob').map(u => waitFor(sockets.get(u)!, 'RETENTION_ALL_COMPLETED'));
    done.push(waitFor(reconnect, 'RETENTION_ALL_COMPLETED'));
    await send(reconnect, 'SKIP_RETENTION', { roomCode });
    const completed = await Promise.all(done);
    expect(new Set(completed.map(e => (e.payload as { eventId: string }).eventId)).size).toBe(1);
    expect((await manager.loadRoom(roomCode)).retention?.phase).toBe('ALL_TEAMS_COMPLETED');
  });
});

describe('retention ledger', () => {
  it('mirrors confirmed picks and turns, never drafts, and enforces the database unique rules', async () => {
    const f = await setup();
    await f.start();
    await f.turn('host', ['2001']);
    await f.retain('alice', '4001');
    const ledger = new InMemoryRetentionLedger();
    await ledger.sync(await f.state());
    const roomId = f.room.id;
    expect(ledger.rows(roomId).map(r => r.playerId)).toEqual(['2001']);
    await f.confirm('alice');
    await f.turn('bob', ['5001', '5002']);
    const room = await f.state();
    await ledger.sync(room);
    const rows = ledger.rows(roomId);
    expect(rows.map(r => r.playerId).sort()).toEqual(['2001', '4001', '5001', '5002']);
    expect(rows.every(r => r.status === 'CONFIRMED' && r.priceUnits === 30 && r.acquisitionType === 'RETENTION' && r.confirmedBy.length > 0)).toBe(true);
    expect(rows.find(r => r.playerId === '5001')).toMatchObject({ retentionOrder: 3, turnId: room.retention!.turns![2]!.id });
    expect(ledger.turnRows(roomId).map(t => [t.turnOrder, t.kind, t.retainedCount, t.eventId === t.id])).toEqual([[1, 'RETAINED', 1, true], [2, 'RETAINED', 1, true], [3, 'RETAINED', 2, true]]);
    await f.command('FINALIZE_RETENTIONS');
    const final = await f.state();
    await ledger.sync(final);
    expect(ledger.rows(roomId).every(r => r.status === 'FINALIZED' && r.finalizedAt !== null)).toBe(true);
    const duplicated = structuredClone(final);
    duplicated.retention!.picks.push({ ...duplicated.retention!.picks[0]!, id: 'dup', teamId: duplicated.teams[1]!.id });
    await expect(ledger.sync(duplicated)).rejects.toMatchObject({ code: 'DUPLICATE_RETENTION' });
    const samePlayerTwice = structuredClone(final);
    samePlayerTwice.retention!.picks.push({ ...samePlayerTwice.retention!.picks[0]!, id: 'dup2' });
    await expect(ledger.sync(samePlayerTwice)).rejects.toMatchObject({ code: 'DUPLICATE_RETENTION' });
    const fourth = structuredClone(final);
    fourth.retention!.picks.push(...['9001', '6001', '6002'].map((playerId, i) => ({ ...fourth.retention!.picks[0]!, id: 'x' + i, playerId })));
    await expect(ledger.sync(fourth)).rejects.toMatchObject({ code: 'RETENTION_LIMIT_REACHED' });
    const turnTwice = structuredClone(final);
    turnTwice.retention!.turns!.push({ ...turnTwice.retention!.turns![0]!, id: 'again', order: 4 });
    await expect(ledger.sync(turnTwice)).rejects.toMatchObject({ code: 'DUPLICATE_RETENTION_TURN' });
    await f.command('RESET_RETENTIONS');
    await ledger.sync(await f.state());
    expect(ledger.rows(roomId)).toEqual([]);
    expect(ledger.turnRows(roomId)).toEqual([]);
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
      await engine.execute(roomCode, 'host', { type: 'START_RETENTION', payload: { roomCode } });
      await engine.execute(roomCode, 'host', { type: 'RETAIN_PLAYER', payload: { roomCode, playerId: '2001' } });
      await engine.execute(roomCode, 'host', { type: 'CONFIRM_RETENTION', payload: { roomCode } });
      const room = await manager.loadRoom(roomCode);
      expect(ledger.rows(room.id).map(r => r.playerId)).toEqual(['2001']);
      expect(ledger.turnRows(room.id)).toHaveLength(1);
      expect(room.retention?.phase).toBe('ALL_TEAMS_COMPLETED');
    } finally { await app.close(); }
  });
});

describe('assertRoom retention invariants', () => {
  it('rejects tampered retention state', async () => {
    const f = await setup();
    await f.start();
    await f.turn('host', ['2001']);
    await f.retain('alice', '4001');
    const good = await f.state();
    expect(() => assertRoom(good)).not.toThrow();
    const tamper = (change: (room: Room) => void) => { const room = structuredClone(good); change(room); return () => assertRoom(room); };
    expect(tamper(r => { r.retention!.picks.push({ ...r.retention!.picks[0]!, id: 'x' }); })).toThrow();
    expect(tamper(r => { r.retention!.picks[0]!.priceUnits = 20; })).toThrow();
    expect(tamper(r => { r.retention!.drafts![0]!.teamId = r.teams[2]!.id; })).toThrow();
    expect(tamper(r => { r.retention!.drafts!.push({ ...r.retention!.drafts![0]!, playerId: '2001' }); })).toThrow();
    expect(tamper(r => { r.retention!.activeTeamId = r.teams[2]!.id; })).toThrow();
    expect(tamper(r => { r.retention!.turns![0]!.order = 2; })).toThrow();
    expect(tamper(r => { r.retention!.phase = 'ALL_TEAMS_COMPLETED'; })).toThrow();
    expect(tamper(r => { r.retention!.picks = []; })).toThrow();
    expect(tamper(r => { r.settings.retention.enabled = false; r.settings.playerPoolSource = 'DEFAULT'; })).toThrow();
    expect(tamper(r => { r.purchases.push({ id: 'p', playerId: '2001', teamId: r.teams[0]!.id, priceUnits: 30, bidCount: 0, at: 0, durationMs: 0, acquisitionType: 'RETENTION', isRetained: true }); })).toThrow();
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
  const legacyRoom = async (phase: 'OPEN' | 'FINALIZED') => {
    const f = await setup();
    const room = structuredClone(await f.state()) as Room;
    const alice = room.teams.find(t => t.userId === 'alice')!;
    const player = (await f.catalog.get('2001'))!;
    room.retention = { phase, picks: [{ id: 'legacy-pick', teamId: alice.id, playerId: '2001', priceUnits: 30, at: 5, userId: 'alice' }],
      ...(phase === 'FINALIZED' ? { finalizedAt: 9 } : {}) } as never;
    room.purchases.push({ id: 'legacy-buy', playerId: '2001', teamId: alice.id, priceUnits: 30, bidCount: 0, at: 5, durationMs: 0, acquisitionType: 'RETENTION', isRetained: true });
    alice.spentUnits = 30; alice.playerIds = ['2001'];
    room.players.push({ ...player, status: 'SOLD', round: 0 });
    const repo = new MemoryRoomRepository();
    await repo.create(room);
    return { f, load: () => new RoomManager(repo, new CatalogPlayerRepository(demoPlayers.slice(0, 2)), { now: () => 1_000_000 }, undefined, undefined, f.catalog).loadRoom(room.code) };
  };
  it('converts a legacy OPEN retention back to NOT_STARTED and restores the purse', async () => {
    const { load } = await legacyRoom('OPEN');
    const loaded = await load();
    expect(loaded.retention).toEqual({ phase: 'NOT_STARTED', picks: [], drafts: [], turns: [] });
    expect(loaded.purchases).toHaveLength(0);
    expect(loaded.players).toHaveLength(0);
    expect(loaded.teams.every(t => t.spentUnits === 0 && t.playerIds.length === 0)).toBe(true);
    expect(roomState(loaded, 'alice', 0).retention).toMatchObject({ phase: 'NOT_STARTED', picks: [], canAct: false });
  });
  it('keeps a legacy FINALIZED retention as is', async () => {
    const { load } = await legacyRoom('FINALIZED');
    const loaded = await load();
    expect(loaded.retention?.phase).toBe('FINALIZED');
    expect(loaded.teams.find(t => t.userId === 'alice')).toMatchObject({ spentUnits: 30, playerIds: ['2001'] });
    const state = roomState(loaded, 'alice', 0);
    expect(state.retention).toMatchObject({ phase: 'FINALIZED', totals: { retained: 1, spentCr: 15 }, turns: [] });
    expect(state.retention.picks[0]).toMatchObject({ teamName: 'Alice FC', playerId: '2001', player: expect.objectContaining({ id: '2001' }) });
    expect(state.teams.find(t => t.userId === 'alice')).toMatchObject({ spentCr: 15, remainingBudgetCr: 85, retainedCount: 1 });
  });
});
