import { describe, it, expect } from 'vitest';
import { fixture } from './helpers.js';
import { roomState } from '../src/modules/rooms/room-state.js';
import { MemoryRoomRepository } from '../src/repositories/memory.js';
import type { Room } from '../src/domain/types.js';

async function setup() {
  const f = await fixture({ numberOfTeams: 4, transitionDelaySeconds: 1 });
  await f.rooms.join(f.room.code, 'carol', { teamName: 'Carol FC' });
  await f.command('START_AUCTION');
  const active = (await f.state()).active!;
  const payload = { playerId: active.playerId, activationId: active.activationId };
  return { ...f, active, payload, vote: (user: string, requestId?: string) => f.command('VOTE_SKIP_PLAYER', user, payload, requestId) };
}

describe('unanimous skip votes', () => {
  it('requires all three non-host members, persists reason and advances through normal random selection', async () => {
    const f = await setup(); const initial = await f.state();
    const events: { type: string; payload: unknown }[] = [];
    f.manager.subscribe((_r, e) => events.push(...e));
    await f.vote('alice');
    expect(roomState(await f.state(), 'alice', f.clock.now()).skipVote).toEqual({ votes: 1, required: 3, hasCurrentUserVoted: true });
    await f.vote('bob');
    expect((await f.state()).active?.endsAt).toBe(f.active.endsAt);
    await f.vote('carol');
    const resolved = await f.state();
    expect(resolved.active).toBeNull();
    expect(resolved.players.find(p => p.id === f.active.playerId)).toMatchObject({ status: 'UNSOLD', unsoldReason: 'UNANIMOUS_SKIP' });
    expect(resolved.playerHistory?.at(-1)).toMatchObject({ type: 'PLAYER_UNSOLD', reason: 'UNANIMOUS_SKIP' });
    expect(resolved.teams).toEqual(initial.teams);
    expect(events).toContainEqual(expect.objectContaining({ type: 'SKIP_VOTE_UPDATED', payload: expect.objectContaining({ votes: 3, required: 3 }) }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'PLAYER_UNSOLD', payload: { playerId: f.active.playerId, reason: 'UNANIMOUS_SKIP' } }));
    await expect(f.command('PLACE_BID', 'alice', { playerId: f.active.playerId, amountCr: 1 })).rejects.toThrow();
    f.clock.value = resolved.nextPlayerAt!;
    await f.engine.onTimer(f.room.code, null);
    expect((await f.state()).active?.playerId).not.toBe(f.active.playerId);
    expect((await f.state()).active?.skipVoterUserIds).toEqual([]);
    await f.command('RECALL_PLAYERS', 'host', { playerIds: [f.active.playerId] });
    expect((await f.state()).players.find(p => p.id === f.active.playerId)?.status).toBe('WAITING');
  });
  it('allows cancellation, deduplicates requests and counts each member once', async () => {
    const f = await setup(); await f.vote('alice', 'once');
    expect(await f.vote('alice', 'once')).toMatchObject({ duplicate: true });
    await expect(f.vote('alice')).rejects.toMatchObject({ code: 'ALREADY_VOTED' });
    await f.command('REMOVE_SKIP_VOTE', 'alice', f.payload);
    expect((await f.state()).active?.skipVoterUserIds).toEqual([]);
    await expect(f.command('REMOVE_SKIP_VOTE', 'alice', f.payload)).rejects.toMatchObject({ code: 'NO_SKIP_VOTE' });
    await f.vote('alice');expect((await f.state()).active?.skipVoterUserIds).toEqual(['alice']);
  });
  it('preserves votes on pause/resume and rejects host, outsiders, paused and expired votes', async () => {
    const f = await setup();
    await expect(f.vote('host')).rejects.toMatchObject({ code: 'HOST_CANNOT_VOTE' });
    await expect(f.vote('stranger')).rejects.toMatchObject({ code: 'NOT_ROOM_MEMBER' });
    await f.vote('alice'); await f.command('PAUSE_AUCTION');
    await expect(f.vote('bob')).rejects.toMatchObject({ code: 'AUCTION_PAUSED' });
    await f.command('RESUME_AUCTION');
    expect((await f.state()).active?.skipVoterUserIds).toEqual(['alice']);
    f.clock.value = (await f.state()).active!.endsAt;
    await expect(f.vote('bob')).rejects.toMatchObject({ code: 'TIMER_EXPIRED' });
    await f.expire();expect((await f.state()).active).toBeNull();
  });
  it('clears votes only for accepted bids and preserves accepted purchases', async () => {
    const f = await setup(); await f.vote('alice'); await f.vote('bob');
    const events: {type:string;payload:unknown}[]=[];f.manager.subscribe((_r,e)=>events.push(...e));
    await expect(f.command('PLACE_BID', 'host', { amountCr: 0 })).rejects.toThrow();
    expect((await f.state()).active?.skipVoterUserIds).toHaveLength(2);
    await f.command('PLACE_BID', 'host', { amountCr: 1 });
    expect((await f.state()).active?.skipVoterUserIds).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({type:'SKIP_VOTE_UPDATED',payload:expect.objectContaining({votes:0,reason:'BID_ACCEPTED'})}));
    await expect(f.vote('carol')).rejects.toMatchObject({ code: 'BIDS_EXIST' });
    await f.expire();expect((await f.state()).purchases).toHaveLength(1);
  });
  it('serializes the final vote against a bid without discarding accepted money', async () => {
    const f = await setup(); await f.vote('alice'); await f.vote('bob');
    const results = await Promise.allSettled([f.vote('carol'), f.command('PLACE_BID','host',{playerId:f.active.playerId,amountCr:1})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const state = await f.state();
    if(state.active) {expect(state.active.highestBidderTeamId).not.toBeNull();expect(state.active.skipVoterUserIds).toEqual([]);}
    else expect(state.players.find(p=>p.id===f.active.playerId)?.status).toBe('UNSOLD');
  });
  it('rejects stale activation votes when the same player returns through recall', async () => {
    const f = await setup();await f.command('MARK_UNSOLD');await f.command('NEXT_PLAYER');await f.command('MARK_UNSOLD');
    await f.command('RECALL_PLAYERS','host',{playerIds:[f.active.playerId]});await f.command('NEXT_PLAYER');
    expect((await f.state()).active?.playerId).toBe(f.active.playerId);
    await expect(f.vote('alice')).rejects.toMatchObject({code:'STALE_STATE'});
  });
  it('counts a sole non-host once and never gives the host a vote', async () => {
    const f=await fixture();
    const bob=(await f.state()).teams.find(t=>t.userId==='bob')!;
    await f.command('KICK_MEMBER','host',{targetTeamId:bob.id});await f.command('START_AUCTION');
    const a=(await f.state()).active!;
    await f.command('VOTE_SKIP_PLAYER','alice',{playerId:a.playerId,activationId:a.activationId});
    expect((await f.state()).active).toBeNull();
    const g=await fixture({minimumParticipants:1});await g.rooms.leave(g.room.code,'alice');await g.rooms.leave(g.room.code,'bob');await g.command('START_AUCTION');
    expect(roomState(await g.state(),'host',g.clock.now()).skipVote.required).toBe(0);
  });
  it('does not allow membership removal or disconnect presence to shrink live threshold', async () => {
    const f=await setup();await f.vote('alice');await f.vote('bob');
    await expect(f.rooms.leave(f.room.code,'carol')).rejects.toMatchObject({code:'INVALID_STATE'});
    await expect(f.command('KICK_MEMBER','host',{targetTeamId:(await f.state()).teams.find(t=>t.userId==='carol')!.id})).rejects.toMatchObject({code:'INVALID_STATE'});
    expect(roomState(await f.state(),'alice',f.clock.now(),['alice']).skipVote.required).toBe(3);
  });
  it('persists votes for hydration and rolls back failed unanimous resolution', async () => {
    class Failing extends MemoryRoomRepository { fail=false; override async commit(r:Room,v:number){if(this.fail)throw Error('offline');await super.commit(r,v);} }
    const repo=new Failing();const f=await fixture({},repo);await f.command('START_AUCTION');const a=(await f.state()).active!;
    const payload={playerId:a.playerId,activationId:a.activationId};await f.command('VOTE_SKIP_PLAYER','alice',payload);
    f.manager.removeRuntime(f.room.code);expect((await f.state()).active?.skipVoterUserIds).toEqual(['alice']);
    repo.fail=true;await expect(f.command('VOTE_SKIP_PLAYER','bob',payload)).rejects.toMatchObject({code:'PERSISTENCE_UNAVAILABLE'});
    expect((await f.state()).active?.skipVoterUserIds).toEqual(['alice']);expect((await f.state()).players.find(p=>p.id===a.playerId)?.status).toBe('ACTIVE');
  });
});
