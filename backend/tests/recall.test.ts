import { describe, it, expect } from 'vitest';
import { fixture } from './helpers.js';
import { MemoryRoomRepository } from '../src/repositories/memory.js';
import type { Room } from '../src/domain/types.js';

describe('selected player recall', () => {
  async function prepared() {
    const f = await fixture();
    await f.command('START_AUCTION');
    const id = (await f.state()).active!.playerId;
    await f.command('MARK_UNSOLD');
    await f.command('NEXT_PLAYER');
    return { ...f, id };
  }
  it.each(['RUNNING', 'PAUSED'])('recalls while %s without changing current lot, budget or price', async status => {
    const f = await prepared();
    if (status === 'PAUSED') await f.command('PAUSE_AUCTION');
    const before = await f.state();
    const events: string[] = [];
    f.manager.subscribe((_room, emitted) => events.push(...emitted.map(e => e.type)));
    await f.command('RECALL_PLAYERS', 'host', { playerIds: [f.id] });
    const after = await f.state();
    expect(after.active).toEqual(before.active);
    expect(after.teams).toEqual(before.teams);
    expect(after.players.find(p => p.id === f.id)).toEqual({ ...before.players.find(p => p.id === f.id), status: 'WAITING' });
    expect(after.playerQueue).toEqual([]);
    expect(after.sequence).toBe(before.sequence + 1);
    expect(after.playerHistory?.map(e => e.type)).toEqual(['PLAYER_UNSOLD', 'PLAYER_RECALLED']);
    expect(events).toEqual(['PLAYER_RECALLED']);
    if (status === 'PAUSED') await f.command('RESUME_AUCTION');
    await f.command('MARK_UNSOLD');
    await f.command('NEXT_PLAYER');
    expect((await f.state()).active?.playerId).toBe(f.id);
    expect((await f.state()).players.find(p => p.id === f.id)?.round).toBe(2);
  });
  it('handles retries and concurrent recalls exactly once', async () => {
    const f = await prepared();
    const payload = { playerIds: [f.id] };
    const first = await f.command('RECALL_PLAYERS', 'host', payload, 'recall-1');
    expect(await f.command('RECALL_PLAYERS', 'host', payload, 'recall-1')).toEqual({ ...first, duplicate: true });
    await expect(f.command('RECALL_PLAYERS', 'host', payload)).rejects.toMatchObject({ code: 'PLAYER_NOT_RECALLABLE' });
    expect((await f.state()).playerHistory?.filter(e => e.type === 'PLAYER_RECALLED')).toHaveLength(1);
    const g = await prepared();
    const outcomes = await Promise.allSettled([g.command('RECALL_PLAYERS', 'host', { playerIds: [g.id] }), g.command('RECALL_PLAYERS', 'host', { playerIds: [g.id] })]);
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('validates host, state, batch membership, duplicates and existing recall queues atomically', async () => {
    const f = await prepared();
    const before = await f.state();
    await expect(f.command('RECALL_PLAYERS', 'alice', { playerIds: [f.id] })).rejects.toMatchObject({ code: 'HOST_REQUIRED' });
    await expect(f.command('RECALL_PLAYERS', 'host', { playerIds: [f.id, 'missing'] })).rejects.toMatchObject({ code: 'PLAYER_NOT_FOUND' });
    await expect(f.command('RECALL_PLAYERS', 'host', { playerIds: [f.id, f.id] })).rejects.toMatchObject({ code: 'DUPLICATE_PLAYER_IDS' });
    await expect(f.command('RECALL_PLAYERS', 'host', { playerIds: [f.id, before.active!.playerId] })).rejects.toMatchObject({ code: 'PLAYER_NOT_RECALLABLE' });
    await expect(f.command('RECALL_PLAYERS', 'host', { playerIds: [] })).rejects.toThrow();
    expect(await f.state()).toEqual(before);
    await f.command('MARK_UNSOLD');
    await f.command('START_RECALL');
    const queued = (await f.state()).playerQueue[0]!;
    await expect(f.command('RECALL_PLAYERS', 'host', { playerIds: [queued] })).rejects.toMatchObject({ code: 'PLAYER_NOT_RECALLABLE' });
    await f.command('END_AUCTION');
    await expect(f.command('RECALL_PLAYERS', 'host', { playerIds: [f.id] })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const g = await fixture();
    await expect(g.command('RECALL_PLAYERS', 'host', { playerIds: ['demo-1'] })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await g.command('END_AUCTION');
    await expect(g.command('RECALL_PLAYERS', 'host', { playerIds: ['demo-1'] })).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
  it('recalls a batch and schedules auto-advance only when idle', async () => {
    const f = await fixture({ autoAdvance: true });
    await f.command('START_AUCTION'); await f.command('MARK_UNSOLD');
    await f.command('NEXT_PLAYER'); await f.command('MARK_UNSOLD');
    const before = await f.state();
    await f.command('RECALL_PLAYERS', 'host', { playerIds: before.players.map(p => p.id) });
    const after = await f.state();
    expect(after.players.every(p => p.status === 'WAITING')).toBe(true);
    expect(after.nextPlayerAt).not.toBeNull();
    expect(after.active).toBeNull();
    f.clock.value = after.nextPlayerAt!;
    await f.engine.onTimer(f.room.code, null);
    expect((await f.state()).active).not.toBeNull();
  });
  it('rolls back recall when critical persistence fails and preserves unsold history', async () => {
    class Failing extends MemoryRoomRepository {
      fail = false;
      override async commit(room: Room, version: number) { if (this.fail) throw new Error('offline'); await super.commit(room, version); }
    }
    const repo = new Failing(); const f = await fixture({}, repo);
    await f.command('START_AUCTION'); await f.command('MARK_UNSOLD');
    const id = (await f.state()).players.find(p => p.status === 'UNSOLD')!.id;
    const events: string[] = [];
    f.manager.subscribe((_r, e) => events.push(...e.map(v => v.type)));
    repo.fail = true;
    await expect(f.command('RECALL_PLAYERS', 'host', { playerIds: [id] })).rejects.toMatchObject({ code: 'PERSISTENCE_UNAVAILABLE' });
    expect((await f.state()).players.find(p => p.id === id)?.status).toBe('UNSOLD');
    expect(events).not.toContain('PLAYER_RECALLED');
    expect((await f.state()).playerHistory?.map(e => e.type)).toEqual(['PLAYER_UNSOLD']);
  });
});
