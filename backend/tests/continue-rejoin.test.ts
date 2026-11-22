import { resolve } from 'node:path';
import { MemoryFc26Catalog } from '../src/modules/fc26/fc26.catalog.js';
import { resolveFc26Config } from '../src/modules/fc26/fc26.config.js';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { StaticTokenAuthService } from '../src/modules/auth-context/auth.service.js';
import { CatalogPlayerRepository, demoPlayers } from '../src/modules/players/player.service.js';
import { MemoryRoomRepository } from '../src/repositories/memory.js';
import { RoomManager } from '../src/modules/rooms/room.manager.js';
import { roomState } from '../src/modules/rooms/room-state.js';
import { ongoingStatus, roomSummary } from '../src/modules/rooms/room-summary.js';
import { fixture } from './helpers.js';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
const users = ['host', 'a', 'b', 'outsider'];
const auth = new StaticTokenAuthService(new Map(users.map(id => [id + '-token', { userId: id }])));

async function app(clock = { value: 100_000, now() { return this.value; } }) {
  const built = await buildApp({ authService: auth, logger: false, clock, timersEnabled: false,
    playerRepository: new CatalogPlayerRepository(demoPlayers.slice(0, 2)) });
  cleanup.push(() => built.app.close());
  await built.app.ready();
  const rest = (user: string, method: 'GET' | 'POST', url: string, payload?: object) => built.app.inject({
    method, url, headers: { authorization: 'Bearer ' + user + '-token' }, ...(payload ? { payload } : {}) });
  const create = async (user = 'host', teamName = 'Host FC') => (await rest(user, 'POST', '/api/rooms', { auctionName: 'Cup',
    teamName, settings: { numberOfTeams: 3, minimumParticipants: 3, minSquadSize: 1, maxSquadSize: 3, playerTimerSeconds: 10, autoAdvance: false } })).json<{ roomCode: string }>().roomCode;
  return { ...built, clock, rest, create };
}

describe('ongoing status mapping', () => {
  it('maps every unfinished state and resume path', async () => {
    const solo = await fixture({ minimumParticipants: 2 });
    await solo.rooms.leave(solo.room.code, 'alice'); await solo.rooms.leave(solo.room.code, 'bob');
    expect(ongoingStatus(await solo.state())).toBe('NOT_STARTED');

    const waiting = await fixture({ minimumParticipants: 4 });
    const waitingRoom = await waiting.state();
    expect(ongoingStatus(waitingRoom)).toBe('WAITING_FOR_TEAMS');
    expect(roomSummary(waitingRoom, 'host', 0).resumePath).toBe(`/room/${waiting.room.code}`);

    const ready = await fixture();
    expect(ongoingStatus(await ready.state())).toBe('READY_TO_START');

    const catalog = new MemoryFc26Catalog(resolveFc26Config({ FC26_DATA_DIR: resolve(import.meta.dirname, 'fixtures/fc26') }));
    await catalog.importAll();
    const retention = await fixture({ playerPoolSource: 'FC26', retention: { enabled: true }, startingBudgetCr: 100 } as never, undefined, 2, catalog);
    expect(ongoingStatus(await retention.state())).toBe('NOT_STARTED');
    await retention.command('START_RETENTION');
    expect(roomSummary(await retention.state(), 'host', 0)).toMatchObject({ ongoingStatus: 'RETENTION_IN_PROGRESS',
      resumePath: `/room/${retention.room.code}/retention`, retention: { phase: 'TEAM_SELECTING', activeTeamName: 'Host FC', completed: 0, total: 3 } });
    await retention.command('SKIP_RETENTION', 'host');
    expect(roomSummary(await retention.state(), 'host', 0).retention).toMatchObject({ activeTeamName: 'Alice FC', completed: 1 });
    await retention.command('SKIP_RETENTION', 'alice'); await retention.command('SKIP_RETENTION', 'bob');
    expect(ongoingStatus(await retention.state())).toBe('RETENTION_IN_PROGRESS');
    await retention.command('FINALIZE_RETENTIONS');
    expect(roomSummary(await retention.state(), 'host', 0).ongoingStatus).toBe('READY_TO_START');
    await ready.command('START_AUCTION');
    const live = roomSummary(await ready.state(), 'alice', ready.clock.now());
    expect(live).toMatchObject({ ongoingStatus: 'LIVE_AUCTION', resumePath: `/auction/${ready.room.code}`, canContinue: true });
    await ready.command('PAUSE_AUCTION');
    expect(roomSummary(await ready.state(), 'alice', ready.clock.now())).toMatchObject({ ongoingStatus: 'PAUSED', rawStatus: 'PAUSED' });
    await ready.command('END_AUCTION');
    expect(roomSummary(await ready.state(), 'alice', 0)).toMatchObject({ ongoingStatus: 'COMPLETED', canContinue: false, resumePath: `/results/${ready.room.code}` });
  });
  it('reports a cancelled lobby as CANCELLED', async () => {
    const f = await fixture();
    await f.command('END_AUCTION');
    expect(roomSummary(await f.state(), 'host', 0)).toMatchObject({ ongoingStatus: 'CANCELLED', rawStatus: 'CLOSED', canContinue: false });
  });
});

describe('summary fields', () => {
  it('describes the live lot without snapshot arrays', async () => {
    const f = await fixture();
    await f.command('START_AUCTION');
    await f.command('PLACE_BID', 'alice', { amountCr: 1 });
    const summary = roomSummary(await f.state(), 'alice', f.clock.now()) as Record<string, unknown>;
    expect(summary).toMatchObject({ auctionName: 'Test Auction', roomCode: f.room.code, teamCount: 3, playersSold: 0, playersRetained: 0,
      role: { isHost: false, teamName: 'Alice FC' }, currentPlayer: { currentBidCr: 1, highestBidderTeamName: 'Alice FC' } });
    expect(summary.playersRemaining).toBe(2);
    expect((summary.currentPlayer as { endsAt: number }).endsAt).toBeGreaterThan(0);
    expect(summary.category).toBeTruthy();
    for (const key of ['players', 'bids', 'receipts', 'teams', 'purchases']) expect(summary).not.toHaveProperty(key);
    expect(roomSummary(await f.state(), 'host', 0).role.isHost).toBe(true);
  });
  it('counts only auction sales as sold and keeps remaining null until the pool exists', async () => {
    const f = await fixture();
    expect(roomSummary(await f.state(), 'host', 0).playersRemaining).toBeNull();
    await f.command('START_AUCTION');
    await f.command('PLACE_BID', 'alice', { amountCr: 1 });
    await f.expire();
    const summary = roomSummary(await f.state(), 'host', f.clock.now());
    expect(summary.playersSold).toBe(1);
    expect(summary.playersRemaining).toBe(1);
  });
  it('advances and persists lastActivityAt on mutation', async () => {
    const repository = new MemoryRoomRepository();
    const f = await fixture({}, repository);
    const created = (await f.state()).lastActivityAt!;
    f.clock.value += 5000;
    await f.command('START_AUCTION');
    const after = (await f.state()).lastActivityAt!;
    expect(after).toBeGreaterThan(created);
    expect((await repository.findByCode(f.room.code))!.lastActivityAt).toBe(after);
    // Old snapshots without the field fall back to createdAt.
    const legacy = structuredClone(await f.state()); delete legacy.lastActivityAt;
    expect(roomSummary(legacy, 'host', 0).lastActivityAt).toBe(legacy.createdAt);
  });
});

describe('HTTP endpoints', () => {
  it('lists only the caller\'s unfinished rooms, newest first, and hides completed and cancelled ones', async () => {
    const t = await app();
    const first = await t.create();
    t.clock.value += 1000;
    const second = await t.create();
    t.clock.value += 1000;
    await t.rest('a', 'POST', `/api/rooms/${first}/join`, { teamName: 'A FC' });
    const other = await t.create('b', 'B FC');
    const list = (await t.rest('host', 'GET', '/api/me/rooms')).json<{ rooms: { roomCode: string; ongoingStatus: string }[] }>();
    expect(list.rooms.map(r => r.roomCode)).toEqual([first, second]);
    expect(list.rooms.map(r => r.roomCode)).not.toContain(other);
    expect(list.rooms[0]).toMatchObject({ ongoingStatus: 'WAITING_FOR_TEAMS', teamCount: 2 });
    expect((await t.rest('a', 'GET', '/api/me/rooms')).json<{ rooms: unknown[] }>().rooms).toHaveLength(1);
    expect((await t.rest('outsider', 'GET', '/api/me/rooms')).json<{ rooms: unknown[] }>().rooms).toHaveLength(0);
    // CLOSED (cancelled lobby) disappears from the list but rejoin says so.
    await t.engine.execute(second, 'host', { type: 'END_AUCTION', payload: { roomCode: second } } as never);
    expect((await t.rest('host', 'GET', '/api/me/rooms')).json<{ rooms: { roomCode: string }[] }>().rooms.map(r => r.roomCode)).toEqual([first]);
    const closed = await t.rest('host', 'POST', `/api/rooms/${second}/rejoin`, {});
    expect(closed.statusCode).toBe(409);
    expect(closed.json()).toMatchObject({ error: { code: 'ROOM_CLOSED' } });
  });
  it('returns COMPLETED rooms from summary/rejoin as view-only, never from the ongoing list', async () => {
    const t = await app();
    const code = await t.create();
    await t.rest('a', 'POST', `/api/rooms/${code}/join`, { teamName: 'A FC' });
    await t.rest('b', 'POST', `/api/rooms/${code}/join`, { teamName: 'B FC' });
    await t.engine.execute(code, 'host', { type: 'START_AUCTION', payload: { roomCode: code } } as never);
    expect((await t.rest('a', 'GET', '/api/me/rooms')).json<{ rooms: { ongoingStatus: string }[] }>().rooms[0]).toMatchObject({ ongoingStatus: 'LIVE_AUCTION' });
    await t.engine.execute(code, 'host', { type: 'END_AUCTION', payload: { roomCode: code } } as never);
    expect((await t.rest('a', 'GET', '/api/me/rooms')).json<{ rooms: unknown[] }>().rooms).toHaveLength(0);
    const rejoin = await t.rest('a', 'POST', `/api/rooms/${code}/rejoin`, {});
    expect(rejoin.statusCode).toBe(200);
    expect(rejoin.json()).toMatchObject({ ongoingStatus: 'COMPLETED', canContinue: false, resumePath: `/results/${code}` });
    expect((await t.rest('a', 'GET', `/api/rooms/${code}/summary`)).statusCode).toBe(200);
  });
  it('denies non-members and never mutates on summary or rejoin', async () => {
    const t = await app();
    const code = await t.create();
    const before = await t.manager.loadRoom(code);
    for (const [method, url, body] of [['GET', `/api/rooms/${code}/summary`], ['POST', `/api/rooms/${code}/rejoin`, {}]] as const) {
      const response = await t.rest('outsider', method, url, body);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { code: 'NOT_ROOM_MEMBER' } });
    }
    expect((await t.rest('outsider', 'POST', '/api/rooms/ZZZZZZ/rejoin', {})).statusCode).toBe(404);
    const after = await t.manager.loadRoom(code);
    expect(after.sequence).toBe(before.sequence);
    expect(after.teams).toHaveLength(1);
  });
  it('returns host details with presence and no snapshot arrays; lastSeenAt is host-only', async () => {
    const t = await app();
    const code = await t.create();
    await t.rest('a', 'POST', `/api/rooms/${code}/join`, { teamName: 'A FC' });
    const hostView = (await t.rest('host', 'GET', `/api/rooms/${code}/summary`)).json<Record<string, unknown> & { teams: Record<string, unknown>[] }>();
    expect(hostView.teams).toHaveLength(2);
    expect(hostView.teams[0]).toMatchObject({ name: 'Host FC', isHost: true, playersOwned: 0, retainedCount: 0, connected: false, lastSeenAt: null });
    for (const key of ['players', 'bids', 'receipts', 'purchases']) expect(hostView).not.toHaveProperty(key);
    const memberView = (await t.rest('a', 'GET', `/api/rooms/${code}/summary`)).json<{ teams: Record<string, unknown>[] }>();
    expect(memberView.teams[0]).not.toHaveProperty('lastSeenAt');
  });
  it('keeps membership and sequence unchanged across five parallel rejoins and continues', async () => {
    const t = await app();
    const code = await t.create();
    await t.rest('a', 'POST', `/api/rooms/${code}/join`, { teamName: 'A FC' });
    const before = await t.manager.loadRoom(code);
    const results = await Promise.all([...Array(5)].map((_, i) => t.rest(i % 2 ? 'a' : 'host', 'POST', `/api/rooms/${code}/rejoin`, {})));
    expect(results.map(r => r.statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(new Set(results.map(r => r.json<{ roomId: string }>().roomId))).toEqual(new Set([before.id]));
    const after = await t.manager.loadRoom(code);
    expect(after.teams.map(x => x.id)).toEqual(before.teams.map(x => x.id));
    expect(after.sequence).toBe(before.sequence);
    expect((await t.rest('host', 'GET', '/api/me/rooms')).json<{ rooms: unknown[] }>().rooms).toHaveLength(1);
  });
  it('rejects body fields such as teamId or teamName on rejoin', async () => {
    const t = await app();
    const code = await t.create();
    for (const body of [{ teamId: 'x' }, { teamName: 'Other FC' }]) expect((await t.rest('host', 'POST', `/api/rooms/${code}/rejoin`, body)).statusCode).toBe(400);
    expect((await t.manager.loadRoom(code)).teams).toHaveLength(1);
  });
});

describe('ROOM_STATE restoration', () => {
  it('restores activity, recentBids and lastActivityAt after the manager is re-created over the same repository', async () => {
    const repository = new MemoryRoomRepository();
    const f = await fixture({}, repository);
    await f.command('START_AUCTION');
    await f.command('PLACE_BID', 'alice', { amountCr: 1 }, 'r1');
    await f.command('PLACE_BID', 'bob', { amountCr: 1.5 }, 'r2');
    const live = roomState(await f.state(), 'alice', f.clock.now());
    expect(live.recentBids.map(b => b.amountCr)).toEqual([1.5, 1]);
    expect(live.activity.filter(a => a.kind === 'BID')).toHaveLength(2);
    await f.expire();
    const before = roomState(await f.state(), 'alice', f.clock.now());
    expect(before.activity[0]).toMatchObject({ kind: 'SOLD', teamName: 'Bob FC', amountCr: 1.5 });

    const restarted = new RoomManager(repository, new CatalogPlayerRepository(demoPlayers.slice(0, 2)), f.clock);
    await restarted.recover();
    const after = roomState(await restarted.loadRoom(f.room.code), 'alice', f.clock.now());
    expect(after.activity).toEqual(before.activity);
    expect(after.recentBids).toEqual(before.recentBids);
    expect(after.lastActivityAt).toBe(before.lastActivityAt);
    expect(after.ongoingStatus).toBe('LIVE_AUCTION');
    expect(after.resumePath).toBe(`/auction/${f.room.code}`);
    expect(new Set(after.activity.map(a => a.id)).size).toBe(after.activity.length);
  });
  it('caps the feed at 60 and recent bids at 20, newest first, and falls back to the stored manager username', async () => {
    const f = await fixture();
    await f.command('START_AUCTION');
    await f.manager.mutate(f.room.code, (draft, events) => {
      draft.teams[1]!.managerUsername = 'alice_manager';
      const lot = draft.active!.playerId;
      for (let i = 0; i < 80; i++) draft.bids.push({ id: `bid-${i}`, roomId: draft.id, playerId: lot, teamId: draft.teams[1]!.id, amountUnits: 2 + i, at: 1000 + i, round: 1 });
      events.push({ type: 'ROOM_UPDATED' });
    });
    const room = await f.state();
    const state = roomState(room, 'host', 0);
    expect(state.activity).toHaveLength(60);
    expect(state.activity[0]!.id).toBe('bid-79');
    expect(state.recentBids).toHaveLength(20);
    expect(state.teams[1]!.managerUsername).toBe('alice_manager');
    expect(roomState(room, 'host', 0, [], { [room.teams[1]!.userId]: 'live_name' }).teams[1]!.managerUsername).toBe('live_name');
  });
  it('never sends teamPresence unless the viewer is the host and data is supplied', async () => {
    const f = await fixture();
    const room = await f.state();
    const presence = [{ teamId: room.teams[1]!.id, connected: false, lastSeenAt: 5, managerUsername: '' }];
    expect(roomState(room, 'host', 0, [], {}, presence).teamPresence).toEqual(presence);
    expect(roomState(room, 'alice', 0, [], {}, presence)).not.toHaveProperty('teamPresence');
    expect(roomState(room, 'host', 0)).not.toHaveProperty('teamPresence');
  });
});
