import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuctionEngine } from '../src/modules/auction/auction.engine.js';
import { TimerService } from '../src/modules/auction/timer.service.js';
import { MemoryFc26Catalog } from '../src/modules/fc26/fc26.catalog.js';
import { resolveFc26Config } from '../src/modules/fc26/fc26.config.js';
import { CatalogPlayerRepository, demoPlayers } from '../src/modules/players/player.service.js';
import { ongoingStatus, roomSummary } from '../src/modules/rooms/room-summary.js';
import { RoomManager } from '../src/modules/rooms/room.manager.js';
import { roomState } from '../src/modules/rooms/room-state.js';
import { PostgresLiveRoomRepository } from '../src/repositories/postgres-live.js';
import { FakeLiveSql } from './helpers-pg-double.js';
import { fixture } from './helpers.js';
afterEach(() => vi.useRealTimers());
const FIXTURES = resolve(import.meta.dirname, 'fixtures/fc26');
const catalog = async () => { const c = new MemoryFc26Catalog(resolveFc26Config({ FC26_DATA_DIR: FIXTURES })); await c.importAll(); return c; };
const durable = () => new PostgresLiveRoomRepository(new FakeLiveSql().fn);
type Fixture = Awaited<ReturnType<typeof fixture>>;
/** Simulates a server restart: new manager + engine + timers over the same durable repository and clock. */
async function restart(f: Fixture, repository: PostgresLiveRoomRepository, fc26?: MemoryFc26Catalog) {
  const manager = new RoomManager(repository, new CatalogPlayerRepository(demoPlayers.slice(0, 2)), f.clock, undefined, undefined, fc26);
  const recovered = await manager.recover();
  const engine = new AuctionEngine(manager);
  const timers = new TimerService(f.clock, (code, id) => engine.onTimer(code, id), () => undefined);
  for (const room of recovered) timers.schedule(room);
  return { manager, engine, timers, recovered, state: () => manager.loadRoom(f.room.code),
    command: (type: string, userId = 'host', extra: Record<string, unknown> = {}, requestId?: string) =>
      engine.execute(f.room.code, userId, { type, requestId, payload: { roomCode: f.room.code, ...extra } } as never) };
}
const retentionFixture = async (repository: PostgresLiveRoomRepository) => {
  const fc26 = await catalog();
  const f = await fixture({ playerPoolSource: 'FC26', retention: { enabled: true }, startingBudgetCr: 100, minSquadSize: 1, maxSquadSize: 5 } as never, repository, 2, fc26);
  return { f, fc26 };
};

describe('server restart over the durable repository', () => {
  it('restores retention in progress: active team, confirmed turns locked, next team continues', async () => {
    const repository = durable();
    const { f, fc26 } = await retentionFixture(repository);
    await f.command('START_RETENTION');
    await f.command('RETAIN_PLAYER', 'host', { playerId: '2001' });
    await f.command('CONFIRM_RETENTION', 'host');
    const before = await f.state();
    const r = await restart(f, repository, fc26);
    const after = await r.state();
    expect(after.sequence).toBe(before.sequence);
    expect(ongoingStatus(after)).toBe('RETENTION_IN_PROGRESS');
    const view = roomState(after, 'alice', f.clock.now()).retention;
    expect(view).toMatchObject({ phase: 'TEAM_SELECTING' });
    expect(roomSummary(after, 'alice', f.clock.now()).retention).toMatchObject({ activeTeamName: 'Alice FC', completed: 1, total: 3 });
    expect(JSON.stringify(view?.picks)).toContain('2001');
    expect(after.retention?.turns).toHaveLength(1);
    // The team that already confirmed cannot select again; the next team can continue.
    await expect(r.command('RETAIN_PLAYER', 'host', { playerId: '2002' })).rejects.toThrow();
    await r.command('SKIP_RETENTION', 'alice');
    expect(roomSummary(await r.state(), 'bob', f.clock.now()).retention).toMatchObject({ activeTeamName: 'Bob FC', completed: 2 });
    expect(JSON.stringify(roomState(await r.state(), 'bob', f.clock.now()).retention?.picks)).toContain('2001');
  });

  it('restores finalized retention as READY_TO_START with picks and purse deductions', async () => {
    const repository = durable();
    const { f, fc26 } = await retentionFixture(repository);
    await f.command('START_RETENTION');
    await f.command('RETAIN_PLAYER', 'host', { playerId: '2001' });
    await f.command('CONFIRM_RETENTION', 'host');
    await f.command('SKIP_RETENTION', 'alice'); await f.command('SKIP_RETENTION', 'bob');
    await f.command('FINALIZE_RETENTIONS');
    const r = await restart(f, repository, fc26);
    const after = await r.state();
    expect(ongoingStatus(after)).toBe('READY_TO_START');
    expect(after.status).toBe('LOBBY');
    expect(after.teams.find(t => t.userId === 'host')).toMatchObject({ playerIds: ['2001'], spentUnits: 30 });
    expect(after.purchases.filter(p => p.acquisitionType === 'RETENTION')).toHaveLength(1);
    await r.command('START_AUCTION');
    expect((await r.state()).status).toBe('RUNNING');
  });

  it('restores a live lot: bid, bidder, purses, squads, history, activation and a reused requestId stays a duplicate', async () => {
    const repository = durable();
    const f = await fixture({}, repository);
    await f.command('START_AUCTION');
    await f.command('PLACE_BID', 'alice', { amountCr: 3 }, 'bid-1');
    await f.command('PLACE_BID', 'bob', { amountCr: 4 }, 'bid-2');
    const before = await f.state();
    const r = await restart(f, repository);
    const after = await r.state();
    expect(after.active).toEqual(before.active);
    expect(after.active?.highestBidderTeamId).toBe(before.teams.find(t => t.userId === 'bob')?.id);
    expect(after.bids).toHaveLength(2);
    expect(after.teams).toEqual(before.teams);
    expect(after.playerHistory).toEqual(before.playerHistory);
    expect(after.active?.activationId).toBe(before.active?.activationId);
    const duplicate = await r.command('PLACE_BID', 'alice', { amountCr: 3 }, 'bid-1');
    expect(duplicate.duplicate).toBe(true);
    expect((await r.state()).bids).toHaveLength(2);
    expect((await r.state()).sequence).toBe(before.sequence);
  });

  it('keeps a paused room paused with the same remainingTimeMs, schedules no timer, and only the host can resume', async () => {
    vi.useFakeTimers();
    const repository = durable();
    const f = await fixture({}, repository);
    await f.command('START_AUCTION');
    f.clock.value += 4000;
    await f.command('PAUSE_AUCTION');
    const remaining = (await f.state()).active!.remainingTimeMs;
    expect(remaining).toBe(6000);
    f.clock.value += 3_600_000;
    const r = await restart(f, repository);
    expect(vi.getTimerCount()).toBe(0);
    const paused = await r.state();
    expect(paused.status).toBe('PAUSED');
    expect(paused.active?.remainingTimeMs).toBe(remaining);
    expect(ongoingStatus(paused)).toBe('PAUSED');
    await expect(r.command('PLACE_BID', 'alice', { amountCr: 2 })).rejects.toMatchObject({ code: 'AUCTION_PAUSED' });
    await expect(r.command('RESUME_AUCTION', 'alice')).rejects.toThrow();
    expect((await r.state()).status).toBe('PAUSED');
    await r.command('RESUME_AUCTION', 'host');
    const resumed = await r.state();
    expect(resumed.status).toBe('RUNNING');
    expect(resumed.active?.endsAt).toBe(f.clock.value + remaining!);
    r.timers.close();
  });

  it('resolves an overdue lot exactly once and rejects bids at or after endsAt', async () => {
    const repository = durable();
    const f = await fixture({}, repository);
    await f.command('START_AUCTION');
    await f.command('PLACE_BID', 'alice', { amountCr: 3 });
    const active = (await f.state()).active!;
    f.clock.value = active.endsAt + 10_000;
    const r = await restart(f, repository);
    r.timers.close();
    await expect(r.command('PLACE_BID', 'bob', { amountCr: 5 })).rejects.toMatchObject({ code: 'TIMER_EXPIRED' });
    f.clock.value = active.endsAt;
    await expect(r.command('PLACE_BID', 'bob', { amountCr: 5 })).rejects.toMatchObject({ code: 'TIMER_EXPIRED' });
    await r.engine.onTimer(f.room.code, active.activationId);
    const once = await r.state();
    await r.engine.onTimer(f.room.code, active.activationId);
    const twice = await r.state();
    expect(once.purchases).toHaveLength(1);
    expect(twice.purchases).toHaveLength(1);
    expect(twice.sequence).toBe(once.sequence);
    expect(twice.teams.find(t => t.userId === 'alice')?.spentUnits).toBe(6);
  });

  it('activates one next player when nextPlayerAt is overdue after a restart', async () => {
    const repository = durable();
    const f = await fixture({ autoAdvance: true, transitionDelaySeconds: 1 }, repository);
    await f.command('START_AUCTION');
    await f.expire();
    const planned = await f.state();
    expect(planned.active).toBeNull();
    expect(planned.nextPlayerAt).not.toBeNull();
    f.clock.value = planned.nextPlayerAt! + 5000;
    const r = await restart(f, repository);
    r.timers.close();
    await r.engine.onTimer(f.room.code, null);
    const first = await r.state();
    expect(first.active).not.toBeNull();
    await r.engine.onTimer(f.room.code, null);
    expect((await r.state()).sequence).toBe(first.sequence);
  });

  it('restores identical state across two successive restarts', async () => {
    const repository = durable();
    const f = await fixture({}, repository);
    await f.command('START_AUCTION');
    await f.command('PLACE_BID', 'alice', { amountCr: 3 });
    const original = await f.state();
    const first = await restart(f, repository);
    first.timers.close();
    const second = await restart(f, repository);
    second.timers.close();
    expect(await first.state()).toEqual(original);
    expect(await second.state()).toEqual(original);
  });

  it('lists only unfinished rooms after a restart and rejects commands on completed and closed rooms', async () => {
    const repository = durable();
    const done = await fixture({}, repository);
    await done.command('START_AUCTION');
    await done.command('END_AUCTION');
    const closed = await fixture({}, repository);
    await closed.command('END_AUCTION');
    const live = await fixture({}, repository);
    await live.command('START_AUCTION');
    const ongoing = await repository.listOngoingForUser('alice');
    expect(ongoing.map(x => x.code)).toEqual([live.room.code]);
    const r = await restart(done, repository);
    r.timers.close();
    expect((await r.manager.loadRoom(done.room.code)).status).toBe('COMPLETED');
    expect((await r.manager.loadRoom(closed.room.code)).status).toBe('CLOSED');
    for (const f of [done, closed]) {
      await expect(r.engine.execute(f.room.code, 'alice', { type: 'PLACE_BID', payload: { roomCode: f.room.code, amountCr: 2 } } as never)).rejects.toThrow();
      await expect(r.engine.execute(f.room.code, 'host', { type: 'RETAIN_PLAYER', payload: { roomCode: f.room.code, playerId: 'demo-1' } } as never)).rejects.toThrow();
      await expect(r.engine.execute(f.room.code, 'host', { type: 'START_AUCTION', payload: { roomCode: f.room.code } } as never)).rejects.toThrow();
    }
  });
});
