import { describe, it, expect } from 'vitest';
import { getMinimumNextBid, getBidIncrement, toCr, toUnits } from '../src/domain/money.js';
import { getMaximumPermittedBid, getRequiredReserve } from '../src/modules/auction/budget.service.js';
import { calculateResults } from '../src/modules/results/result.service.js';
import { DeterministicRecommendationService } from '../src/modules/recommendations/recommendation.service.js';
import { MemoryRoomRepository } from '../src/repositories/memory.js';
import type { Room } from '../src/domain/types.js';
import { fixture } from './helpers.js';

describe('money rules', () => {
  it.each([[4, 4.5], [9, 9.5], [9.5, 10], [10, 11], [11, 12], [19, 20], [20, 22], [22, 24], [38, 40]])('%s -> %s Cr', (input, expected) => {
    expect(toCr(getMinimumNextBid(toUnits(input)))).toBe(expected);
  });
  it('has exact increment tiers', () => expect([getBidIncrement(19), getBidIncrement(20), getBidIncrement(39), getBidIncrement(40)]).toEqual([1, 2, 2, 4]));
  it.each([NaN, Infinity, -1, 1.1, 0.25])('rejects invalid money %s', value => expect(() => toUnits(value)).toThrow());
});
describe('authoritative auction', () => {
  it('starts with an ask, accepts base price and prevents self-raising', async () => {
    const f = await fixture();
    await f.command('START_AUCTION');
    expect((await f.state()).active?.highestBidderTeamId).toBeNull();
    await f.command('PLACE_BID', 'alice', { amountCr: 1 });
    const room = await f.state();
    expect(room.active?.currentBidUnits).toBe(2);
    expect(room.teams.find(t => t.userId === 'alice')?.spentUnits).toBe(0);
    await expect(f.command('PLACE_BID', 'alice', { amountCr: 1.5 })).rejects.toMatchObject({ code: 'ALREADY_HIGHEST_BIDDER' });
  });
  it('enforces participant count, host permission and room state', async () => {
    const f = await fixture({ minimumParticipants: 4 });
    await expect(f.command('START_AUCTION', 'alice')).rejects.toMatchObject({ code: 'HOST_REQUIRED' });
    await expect(f.command('START_AUCTION')).rejects.toMatchObject({ code: 'NOT_ENOUGH_PARTICIPANTS' });
    await expect(f.command('PLACE_BID', 'alice', { amountCr: 1 })).rejects.toMatchObject({ code: 'AUCTION_NOT_RUNNING' });
    await expect(f.command('START_AUCTION', 'stranger')).rejects.toMatchObject({ code: 'NOT_ROOM_MEMBER' });
  });
  it('enforces insufficient budget and prospective squad reserve', async () => {
    const f = await fixture({ minSquadSize: 3 });
    await f.command('START_AUCTION');
    await expect(f.command('PLACE_BID', 'alice', { amountCr: 20.5 })).rejects.toMatchObject({ code: 'INSUFFICIENT_BUDGET' });
    await expect(f.command('PLACE_BID', 'alice', { amountCr: 19 })).rejects.toMatchObject({ code: 'SQUAD_RESERVE_REQUIRED' });
    await f.command('PLACE_BID', 'alice', { amountCr: 18 });
    const room = await f.state();
    const team = room.teams.find(t => t.userId === 'alice')!;
    expect(toCr(getRequiredReserve(team, room.settings))).toBe(3);
    expect(toCr(getMaximumPermittedBid(team, room.settings))).toBe(18);
  });
  it('reserves only one future slot when owning 16 of a required 18', async () => {
    const f = await fixture({ minSquadSize: 18, maxSquadSize: 18 });
    const room = await f.state();
    const team = { ...room.teams[0]!, startingBudgetUnits: 36, spentUnits: 0, playerIds: Array.from({ length: 16 }, (_, i) => String(i)) };
    expect(toCr(getRequiredReserve(team, room.settings))).toBe(2);
    expect(toCr(getMaximumPermittedBid(team, room.settings))).toBe(17);
  });
  it('serializes simultaneous bids and rejects stale equal bids', async () => {
    const f = await fixture();
    await f.command('START_AUCTION');
    const bids = await Promise.allSettled([f.command('PLACE_BID', 'alice', { amountCr: 1 }), f.command('PLACE_BID', 'bob', { amountCr: 1 })]);
    expect(bids.filter(b => b.status === 'fulfilled')).toHaveLength(1);
    expect((await f.state()).bids).toHaveLength(1);
  });
  it('rejects a bid at the exact deadline even before timer callback', async () => {
    const f = await fixture();
    await f.command('START_AUCTION');
    f.clock.value = (await f.state()).active!.endsAt;
    await expect(f.command('PLACE_BID', 'alice', { amountCr: 1 })).rejects.toMatchObject({ code: 'TIMER_EXPIRED' });
  });
  it('extends late bids and ignores stale timer callbacks', async () => {
    const f = await fixture();
    await f.command('START_AUCTION');
    const original = (await f.state()).active!;
    f.clock.value = original.endsAt - 2200;
    await f.command('PLACE_BID', 'alice', { amountCr: 1 });
    expect((await f.state()).active?.endsAt).toBe(f.clock.value + 5000);
    f.clock.value = original.endsAt;
    await f.engine.onTimer(f.room.code, original.activationId);
    expect((await f.state()).active).not.toBeNull();
    await f.expire();
    await f.command('NEXT_PLAYER');
    const sequence = (await f.state()).sequence;
    await f.engine.onTimer(f.room.code, original.activationId);
    expect((await f.state()).sequence).toBe(sequence);
  });
  it('pauses and resumes remaining duration without accepting paused bids', async () => {
    const f = await fixture();
    await f.command('START_AUCTION');
    f.clock.value += 3000;
    await f.command('PAUSE_AUCTION');
    expect((await f.state()).active?.remainingTimeMs).toBe(7000);
    await expect(f.command('PLACE_BID', 'alice', { amountCr: 1 })).rejects.toMatchObject({ code: 'AUCTION_PAUSED' });
    f.clock.value += 100_000;
    await f.command('RESUME_AUCTION');
    expect((await f.state()).active?.endsAt).toBe(f.clock.value + 7000);
  });
  it('late pause resolves an expired player rather than reviving it', async () => {
    const f = await fixture();
    await f.command('START_AUCTION');
    const expiredId = (await f.state()).active!.playerId;
    f.clock.value += 11000;
    await f.command('PAUSE_AUCTION');
    expect((await f.state()).active).toBeNull();
    expect((await f.state()).players.find(p => p.id === expiredId)?.status).toBe('UNSOLD');
  });
  it('commits sold player, squad, purse and results exactly once', async () => {
    const f = await fixture();
    await f.command('START_AUCTION');
    await f.command('PLACE_BID', 'alice', { amountCr: 4 });
    const soldId = (await f.state()).active!.playerId;
    const activation = (await f.state()).active!.activationId;
    await f.expire();
    await f.engine.onTimer(f.room.code, activation);
    const room = await f.state();
    expect(room.purchases).toHaveLength(1);
    expect(room.teams.find(t => t.userId === 'alice')).toMatchObject({ spentUnits: 8, playerIds: [soldId] });
    expect(calculateResults(room)).toMatchObject({ playersSold: 1, totalSpendCr: 4, averageSaleCr: 4 });
  });
  it('resolves unsold, recalls original price, then honors a bid on host end', async () => {
    const f = await fixture({}, undefined, 1);
    await f.command('START_AUCTION');
    await f.expire();
    expect((await f.state()).players[0]?.status).toBe('UNSOLD');
    await f.command('START_RECALL');
    expect((await f.state()).active?.currentBidUnits).toBe(2);
    await f.command('PLACE_BID', 'bob', { amountCr: 2 });
    await expect(f.command('MARK_UNSOLD')).rejects.toMatchObject({ code: 'BIDS_EXIST' });
    await f.command('END_AUCTION');
    expect((await f.state()).status).toBe('COMPLETED');
    expect((await f.state()).purchases).toHaveLength(1);
  });
  it('increments sequence only on commits and deduplicates retries across connections', async () => {
    const f = await fixture();
    await f.command('START_AUCTION');
    const initial = (await f.state()).sequence;
    await f.command('PLACE_BID', 'alice', { amountCr: 1 }, 'same-command');
    const retry = await f.command('PLACE_BID', 'alice', { amountCr: 1 }, 'same-command');
    expect(retry).toEqual({ sequence: initial + 1, duplicate: true });
    expect((await f.state()).sequence).toBe(initial + 1);
    await expect(f.command('PLACE_BID', 'alice', { amountCr: 2 }, 'same-command')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(f.command('PLACE_BID', 'bob', { amountCr: 1.5, expectedSequence: initial })).rejects.toMatchObject({ code: 'STALE_STATE' });
  });
  it('rejects custom increments when disabled and full squads', async () => {
    const f = await fixture({ allowCustomBids: false, maxSquadSize: 1 });
    await f.command('START_AUCTION');
    await expect(f.command('PLACE_BID', 'alice', { amountCr: 2 })).rejects.toMatchObject({ code: 'INVALID_INCREMENT' });
    await f.command('PLACE_BID', 'alice', { amountCr: 1 });
    await f.expire();
    await f.command('NEXT_PLAYER');
    await expect(f.command('PLACE_BID', 'alice', { amountCr: 1 })).rejects.toMatchObject({ code: 'SQUAD_FULL' });
  });
  it('bounds recommendations by reserve and never bids', async () => {
    const f = await fixture({ minSquadSize: 3 });
    await f.command('START_AUCTION');
    const room = await f.state();
    const result = await new DeterministicRecommendationService().recommend(room, room.teams[0]!);
    expect(result.suggestedCeilingCr).toBeLessThanOrEqual(18);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect((await f.state()).bids).toHaveLength(0);
  });
  it('failure rolls back a sale and does not broadcast PLAYER_SOLD, then retries safely', async () => {
    class FailingRepository extends MemoryRoomRepository {
      fail = false;
      override async commit(room: Room, version: number) { if (this.fail) throw new Error('offline'); await super.commit(room, version); }
    }
    const repository = new FailingRepository();
    const f = await fixture({}, repository);
    const events: string[] = [];
    f.manager.subscribe((_room, emitted) => events.push(...emitted.map(e => e.type)));
    await f.command('START_AUCTION');
    await f.command('PLACE_BID', 'alice', { amountCr: 1 });
    repository.fail = true;
    await expect(f.expire()).rejects.toMatchObject({ code: 'PERSISTENCE_UNAVAILABLE' });
    expect(events).not.toContain('PLAYER_SOLD');
    expect((await f.state()).purchases).toHaveLength(0);
    repository.fail = false;
    await f.expire();
    expect((await f.state()).purchases).toHaveLength(1);
  });
  it('reconciles an uncertain successful commit without duplicating a purchase', async () => {
    class AmbiguousRepository extends MemoryRoomRepository {
      failAfter = false;
      override async commit(room: Room, version: number) { await super.commit(room, version); if (this.failAfter) throw new Error('lost acknowledgment'); }
    }
    const repository = new AmbiguousRepository();
    const f = await fixture({}, repository);
    await f.command('START_AUCTION');
    await f.command('PLACE_BID', 'alice', { amountCr: 1 });
    const activation = (await f.state()).active!.activationId;
    repository.failAfter = true;
    await expect(f.expire()).rejects.toMatchObject({ code: 'PERSISTENCE_UNAVAILABLE' });
    repository.failAfter = false;
    await f.engine.onTimer(f.room.code, activation);
    expect((await f.state()).purchases).toHaveLength(1);
  });
});
