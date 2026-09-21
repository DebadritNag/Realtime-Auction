import { afterEach, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { buildApp } from '../src/app.js';
import { StaticTokenAuthService } from '../src/modules/auth-context/auth.service.js';
import { CatalogPlayerRepository, demoPlayers } from '../src/modules/players/player.service.js';
import type { ServerEvent } from '../src/domain/types.js';
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
const origin = 'http://localhost:5173';
const auth = new StaticTokenAuthService(new Map(['host', 'a', 'b', 'c', 'd', 'outsider'].map(id => [id + '-token', { userId: id }])));
function event(socket: WebSocket, type: string, requestId?: string): Promise<ServerEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off('message', listener); reject(new Error('Timed out waiting for ' + type)); }, 3000);
    function listener(raw: Buffer) {
      const message = JSON.parse(raw.toString()) as ServerEvent;
      if (message.type === type && (!requestId || message.requestId === requestId)) {
        clearTimeout(timeout); socket.off('message', listener); resolve(message);
      }
    }
    socket.on('message', listener);
  });
}
async function send(socket: WebSocket, type: string, payload: unknown, response = 'COMMAND_ACK', requestId: string = crypto.randomUUID()) {
  const result = event(socket, response, requestId);
  socket.send(JSON.stringify({ type, payload, requestId }));
  return result;
}
it('runs host + four users through realtime auction, late bid, sale, next player, reconnect and results', async () => {
  const clock = { value: 100_000, now() { return this.value; } };
  const { app, manager, engine } = await buildApp({ authService: auth, logger: false, clock, timersEnabled: false,
    playerRepository: new CatalogPlayerRepository(demoPlayers.slice(0, 2)) });
  cleanup.push(() => app.close());
  await app.ready();
  const rest = (user: string, method: 'GET' | 'POST', url: string, payload?: object) => app.inject({
    method, url, headers: { authorization: 'Bearer ' + user + '-token' }, ...(payload ? { payload } : {}),
  });
  const create = await rest('host', 'POST', '/api/rooms', { auctionName: 'Integration Cup', teamName: 'Host FC',
    settings: { numberOfTeams: 5, minSquadSize: 1, maxSquadSize: 3, playerTimerSeconds: 10, autoAdvance: true, transitionDelaySeconds: 1 } });
  expect(create.statusCode).toBe(201);
  const code = create.json<{ roomCode: string }>().roomCode;
  for (const user of ['a', 'b', 'c', 'd']) expect((await rest(user, 'POST', '/api/rooms/' + code + '/join', { teamName: user + ' FC' })).statusCode).toBe(200);
  const sockets = new Map<string, WebSocket>();
  for (const user of ['host', 'a', 'b', 'c', 'd']) {
    const socket = await app.injectWS('/ws?token=' + user + '-token', { headers: { origin } });
    sockets.set(user, socket);
    const joined = await send(socket, 'JOIN_ROOM', { roomCode: code }, 'ROOM_STATE');
    expect((joined.payload as { teams: unknown[] }).teams).toHaveLength(5);
  }
  const host = sockets.get('host')!, a = sockets.get('a')!, b = sockets.get('b')!;
  await send(host, 'START_AUCTION', { roomCode: code });
  const firstId = (await manager.loadRoom(code)).active!.playerId;
  const nextId = (await manager.loadRoom(code)).players.find(p => p.id !== firstId)!.id;
  expect(['demo-1', 'demo-2']).toContain(firstId);
  await send(a, 'PLACE_BID', { roomCode: code, amountCr: 1 });
  await send(b, 'PLACE_BID', { roomCode: code, amountCr: 1.5 });
  const active = (await manager.loadRoom(code)).active!;
  clock.value = active.endsAt - 2000;
  const extension = event(a, 'TIMER_EXTENDED');
  await send(a, 'PLACE_BID', { roomCode: code, amountCr: 2 });
  expect((await extension).payload).toMatchObject({ endsAt: clock.value + 5000 });
  clock.value += 5000;
  const soldEvent = event(a, 'PLAYER_SOLD');
  await engine.onTimer(code, active.activationId);
  expect((await soldEvent).payload).toMatchObject({ priceCr: 2, teamPlayerCount: 1, remainingBudgetCr: 98 });
  clock.value += 1000;
  const next = event(a, 'PLAYER_STARTED');
  await engine.onTimer(code, null);
  expect((await next).payload).toMatchObject({ player: { id: nextId } });
  b.terminate();
  const reconnected = await app.injectWS('/ws?token=b-token', { headers: { origin } });
  const snapshot = await send(reconnected, 'REJOIN_ROOM', { roomCode: code }, 'ROOM_STATE');
  expect(snapshot.payload).toMatchObject({ activePlayerId: nextId, currentUserTeam: { userId: 'b' }, teams: expect.any(Array) });
  const second = (await manager.loadRoom(code)).active!;
  clock.value = second.endsAt;
  await engine.onTimer(code, second.activationId);
  await send(host, 'END_AUCTION', { roomCode: code });
  const results = await rest('a', 'GET', '/api/rooms/' + code + '/results');
  expect(results.json()).toMatchObject({ status: 'COMPLETED', playersSold: 1, unsoldCount: 1, totalSpendCr: 2, provisional: false });
});
it('protects REST and WS boundaries, host commands, unknown fields and retries', async () => {
  const { app, manager } = await buildApp({ authService: auth, logger: false, timersEnabled: false });
  cleanup.push(() => app.close());
  await app.ready();
  expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200);
  expect((await app.inject({ url: '/api/rooms/ABC234' })).statusCode).toBe(401);
  expect((await app.inject({ url: '/api/rooms/ABC234', headers: { authorization: 'Bearer host-token', origin: 'https://evil.example' } })).statusCode).toBe(403);
  await expect(app.injectWS('/ws?token=bad', { headers: { origin } })).rejects.toThrow();
  await expect(app.injectWS('/ws?token=host-token', { headers: { origin: 'https://evil.example' } })).rejects.toThrow();
  const creation = await app.inject({ method: 'POST', url: '/api/rooms', headers: { authorization: 'Bearer host-token' },
    payload: { auctionName: 'Security Cup', teamName: 'Host FC', settings: { minimumParticipants: 1 } } });
  const code = creation.json<{ roomCode: string }>().roomCode;
  const socket = await app.injectWS('/ws?token=host-token', { headers: { origin } });
  await send(socket, 'JOIN_ROOM', { roomCode: code }, 'ROOM_STATE');
  const malformed = event(socket, 'ERROR');
  socket.send('{bad json');
  expect((await malformed).payload).toMatchObject({ reason: 'INVALID_MESSAGE' });
  const spoofed = event(socket, 'ERROR');
  socket.send(JSON.stringify({ type: 'PLACE_BID', payload: { roomCode: code, amountCr: 1, userId: 'a' } }));
  expect((await spoofed).payload).toMatchObject({ reason: 'INVALID_MESSAGE' });
  await send(socket, 'START_AUCTION', { roomCode: code });
  const openingAsk = (await manager.loadRoom(code)).active!.currentBidUnits / 2;
  await send(socket, 'PLACE_BID', { roomCode: code, amountCr: openingAsk }, 'COMMAND_ACK', 'retry-id');
  const retry = await send(socket, 'PLACE_BID', { roomCode: code, amountCr: openingAsk }, 'COMMAND_ACK', 'retry-id');
  expect(retry.payload).toMatchObject({ duplicate: true });
  expect((await manager.loadRoom(code)).bids).toHaveLength(1);
  const rejected = await send(socket, 'PLACE_BID', { roomCode: code, amountCr: 1.5 }, 'BID_REJECTED');
  expect(rejected.payload).toMatchObject({ reason: 'ALREADY_HIGHEST_BIDDER' });
  const outsider = await app.inject({ url: '/api/rooms/' + code + '/state', headers: { authorization: 'Bearer outsider-token' } });
  expect(outsider.statusCode).toBe(403);
});

it('broadcasts selected recall and authoritative snapshots to host, peer and reconnecting clients', async () => {
  const { app, manager } = await buildApp({ authService: auth, logger: false, timersEnabled: false,
    playerRepository: new CatalogPlayerRepository(demoPlayers.slice(0, 2)) });
  cleanup.push(() => app.close()); await app.ready();
  const room = await manager.create({ userId: 'host' }, { auctionName: 'Recall Cup', teamName: 'Host FC',
    settings: { minimumParticipants: 1, autoAdvance: false } });
  await app.inject({ method: 'POST', url: '/api/rooms/' + room.code + '/join', headers: { authorization: 'Bearer a-token' }, payload: { teamName: 'Peer FC' } });
  const host = await app.injectWS('/ws?token=host-token', { headers: { origin } });
  const peer = await app.injectWS('/ws?token=a-token', { headers: { origin } });
  await send(host, 'JOIN_ROOM', { roomCode: room.code }, 'ROOM_STATE');
  await send(peer, 'JOIN_ROOM', { roomCode: room.code }, 'ROOM_STATE');
  await send(host, 'START_AUCTION', { roomCode: room.code });
  const id = (await manager.loadRoom(room.code)).active!.playerId;
  await send(host, 'MARK_UNSOLD', { roomCode: room.code });
  await send(host, 'NEXT_PLAYER', { roomCode: room.code });
  const before = await manager.loadRoom(room.code);
  const payload = { roomCode: room.code, playerIds: [id] };
  expect((await send(peer, 'RECALL_PLAYERS', payload, 'ERROR')).payload).toMatchObject({ reason: 'HOST_REQUIRED' });
  const updates = [event(host, 'PLAYER_RECALLED'), event(peer, 'PLAYER_RECALLED')];
  const snapshots = [event(host, 'ROOM_STATE'), event(peer, 'ROOM_STATE')];
  await send(host, 'RECALL_PLAYERS', payload, 'COMMAND_ACK', 'recall-once');
  for (const update of await Promise.all(updates)) expect(update.payload).toMatchObject({ playerId: id, status: 'WAITING' });
  for (const snapshot of await Promise.all(snapshots)) expect(snapshot.payload).toMatchObject({
    unsoldPlayers: [], activePlayerId: before.active!.playerId, endsAt: before.active!.endsAt,
    players: expect.arrayContaining([expect.objectContaining({ id, status: 'WAITING' })]),
  });
  expect((await send(host, 'RECALL_PLAYERS', payload, 'COMMAND_ACK', 'recall-once')).payload).toMatchObject({ duplicate: true });
  peer.terminate();
  const reconnect = await app.injectWS('/ws?token=a-token', { headers: { origin } });
  expect((await send(reconnect, 'REJOIN_ROOM', { roomCode: room.code }, 'ROOM_STATE')).payload).toMatchObject({
    unsoldPlayers: [], players: expect.arrayContaining([expect.objectContaining({ id, status: 'WAITING' })]),
  });
});
