import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignJWT } from 'jose';
import { JwtAuthService } from '../src/modules/auth-context/auth.service.js';
import { readEnvironment } from '../src/config/env.js';
import { FileRoomRepository } from '../src/repositories/file.js';
import { RoomManager } from '../src/modules/rooms/room.manager.js';
import { AuctionEngine } from '../src/modules/auction/auction.engine.js';
import { CatalogPlayerRepository, demoPlayers } from '../src/modules/players/player.service.js';
import { TimerService } from '../src/modules/auction/timer.service.js';
import { UserThrottle } from '../src/utils/throttle.js';
import { fixture } from './helpers.js';
afterEach(() => vi.useRealTimers());
it('recovers a persisted active auction and settles an overdue bid once after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'auction-test-'));
  try {
    const f = await fixture({}, new FileRoomRepository(directory));
    await f.command('START_AUCTION');
    await f.command('PLACE_BID', 'alice', { amountCr: 3 }, 'persistent-receipt');
    const manager = new RoomManager(new FileRoomRepository(directory), new CatalogPlayerRepository(demoPlayers), f.clock);
    await manager.recover();
    const engine = new AuctionEngine(manager);
    const restored = await manager.loadRoom(f.room.code);
    expect(restored.active?.currentBidUnits).toBe(6);
    const duplicate = await engine.execute(f.room.code, 'alice', {
      type: 'PLACE_BID', requestId: 'persistent-receipt', payload: { roomCode: f.room.code, amountCr: 3 },
    });
    expect(duplicate.duplicate).toBe(true);
    f.clock.value = restored.active!.endsAt + 10_000;
    await engine.onTimer(f.room.code, restored.active!.activationId);
    expect((await manager.loadRoom(f.room.code)).purchases).toHaveLength(1);
    const third = new RoomManager(new FileRoomRepository(directory), new CatalogPlayerRepository(demoPlayers), f.clock);
    await third.recover();
    expect((await third.loadRoom(f.room.code)).teams.find(t => t.userId === 'alice')?.spentUnits).toBe(6);
  } finally {
    // mkdtemp creates this exact test-owned directory under the OS temp root.
    await rm(directory, { recursive: true, force: true });
  }
});
it('fires real scheduled callbacks and auto advances using timestamps', async () => {
  vi.useFakeTimers();
  const f = await fixture({ autoAdvance: true, transitionDelaySeconds: 1 });
  const errors: unknown[] = [];
  const timers = new TimerService(f.clock, (code, id) => f.engine.onTimer(code, id), error => errors.push(error));
  const unsubscribe = f.manager.subscribe(room => timers.schedule(room));
  try {
    await f.command('START_AUCTION');
    const firstId = (await f.state()).active!.playerId;
    const nextId = (await f.state()).players.find(p => p.id !== firstId)!.id;
    f.clock.value += 10_000;
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await f.state()).players.find(p => p.id === firstId)?.status).toBe('UNSOLD');
    f.clock.value += 1000;
    await vi.advanceTimersByTimeAsync(1000);
    expect((await f.state()).active?.playerId).toBe(nextId);
    expect(errors).toHaveLength(0);
  } finally { timers.close(); unsubscribe(); }
});
it('JWT verification checks signature, issuer, audience, subject and expiration', async () => {
  const secret = 'a-secure-test-secret-at-least-32-characters';
  const service = new JwtAuthService({ secret, issuer: 'https://identity.example', audience: 'auction' });
  const sign = (audience: string, expires: string | number) => new SignJWT({ username: 'Alice' }).setProtectedHeader({ alg: 'HS256' })
    .setSubject('alice').setIssuer('https://identity.example').setAudience(audience).setExpirationTime(expires).sign(new TextEncoder().encode(secret));
  expect(await service.verifyAccessToken(await sign('auction', '1h'))).toMatchObject({ userId: 'alice', username: 'Alice' });
  await expect(service.verifyAccessToken(await sign('other', '1h'))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  await expect(service.verifyAccessToken(await sign('auction', 1))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  await expect(service.verifyAccessToken('forged')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});
it('rejects production development auth and invalid origins', () => {
  expect(() => readEnvironment({ NODE_ENV: 'production', AUTH_MODE: 'development' })).toThrow();
  expect(() => readEnvironment({ FRONTEND_ORIGIN: 'https://example.com/path' })).toThrow();
});
it('throttles spam per user and resets the short window', () => {
  const limiter = new UserThrottle();
  for (let i = 0; i < 30; i++) expect(limiter.allow('alice', 1000, 30)).toBe(true);
  expect(limiter.allow('alice', 1000, 30)).toBe(false);
  expect(limiter.allow('bob', 1000, 30)).toBe(true);
  expect(limiter.allow('alice', 2000, 30)).toBe(true);
});
it('enforces lobby capacity, unique memberships, settings and host kick permissions', async () => {
  const f = await fixture({ numberOfTeams: 3 });
  await expect(f.rooms.join(f.room.code, 'extra', { teamName: 'Extra FC' })).rejects.toMatchObject({ code: 'ROOM_FULL' });
  await expect(f.rooms.join(f.room.code, 'alice', { teamName: 'New name' })).rejects.toMatchObject({ code: 'MEMBERSHIP_CONFLICT' });
  await expect(f.rooms.updateSettings(f.room.code, 'alice', { startingBudgetCr: 100 })).rejects.toMatchObject({ code: 'HOST_REQUIRED' });
  await f.rooms.updateSettings(f.room.code, 'host', { startingBudgetCr: 25 });
  expect((await f.state()).teams.every(t => t.startingBudgetUnits === 50)).toBe(true);
  const bob = (await f.state()).teams.find(t => t.userId === 'bob')!;
  await f.command('KICK_MEMBER', 'host', { targetTeamId: bob.id });
  await expect(f.command('START_AUCTION', 'bob')).rejects.toMatchObject({ code: 'NOT_ROOM_MEMBER' });
  await f.command('START_AUCTION');
  await expect(f.rooms.updateSettings(f.room.code, 'host', { startingBudgetCr: 50 })).rejects.toMatchObject({ code: 'INVALID_STATE' });
  await expect(f.rooms.leave(f.room.code, 'alice')).rejects.toMatchObject({ code: 'INVALID_STATE' });
});
