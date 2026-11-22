import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { buildApp } from '../src/app.js';
import type { AuthContext, ServerEvent } from '../src/domain/types.js';
import { StaticTokenAuthService } from '../src/modules/auth-context/auth.service.js';
import { CatalogPlayerRepository, demoPlayers } from '../src/modules/players/player.service.js';
import { MemoryRoomRepository } from '../src/repositories/memory.js';
import { MemoryPresenceStore, PostgresPresenceStore, PresenceTracker } from '../src/realtime/presence.js';
import { FakeLiveSql } from './helpers-pg-double.js';
const origin = 'http://localhost:5173';
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
const tokens = (extra: Record<string, AuthContext> = {}) => new StaticTokenAuthService(new Map<string, AuthContext>([
  ...['host', 'a', 'b', 'outsider'].map(id => [id + '-token', { userId: id }] as [string, AuthContext]), ...Object.entries(extra)]));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
interface Client { socket: WebSocket; messages: ServerEvent[]; closed: Promise<number> }
const track = (socket: WebSocket): Client => {
  const messages: ServerEvent[] = [];
  socket.on('message', raw => messages.push(JSON.parse(raw.toString()) as ServerEvent));
  const closed = new Promise<number>(resolve => socket.on('close', code => resolve(code)));
  return { socket, messages, closed };
};
async function waitFor(client: Client, pred: (e: ServerEvent) => boolean, from = 0, ms = 3000): Promise<ServerEvent> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const found = client.messages.slice(from).find(pred);
    if (found) return found;
    await sleep(10);
  }
  throw new Error('Timed out. Saw: ' + client.messages.slice(from).map(m => m.type).join(','));
}
async function setup(options: { repository?: MemoryRoomRepository; presenceStore?: MemoryPresenceStore | PostgresPresenceStore; auth?: StaticTokenAuthService; logStream?: { write(m: string): void }; create?: boolean; code?: string } = {}) {
  const clock = { value: 100_000, now() { return this.value; } };
  const built = await buildApp({ authService: options.auth ?? tokens(), logger: !!options.logStream, logStream: options.logStream, clock, timersEnabled: false,
    repository: options.repository, presenceStore: options.presenceStore, playerRepository: new CatalogPlayerRepository(demoPlayers.slice(0, 2)) });
  cleanup.push(() => built.app.close());
  await built.app.ready();
  const rest = (user: string, method: 'GET' | 'POST', url: string, payload?: object) => built.app.inject({
    method, url, headers: { authorization: 'Bearer ' + user + '-token' }, ...(payload ? { payload } : {}) });
  let code = options.code ?? '';
  if (options.create !== false && !code) {
    const created = await rest('host', 'POST', '/api/rooms', { auctionName: 'Presence Cup', teamName: 'Host FC',
      settings: { numberOfTeams: 3, minimumParticipants: 2, minSquadSize: 1, maxSquadSize: 3, playerTimerSeconds: 10, startingBudgetCr: 20 } });
    code = created.json<{ roomCode: string }>().roomCode;
    for (const user of ['a', 'b']) await rest(user, 'POST', '/api/rooms/' + code + '/join', { teamName: user.toUpperCase() + ' FC' });
  }
  const connect = async (user: string, via: 'query' | 'protocol' = 'query') => track(await built.app.injectWS(
    via === 'query' ? '/ws?token=' + user + '-token' : '/ws',
    { headers: via === 'query' ? { origin } : { origin, 'sec-websocket-protocol': 'auction.v1, bearer.' + user + '-token' } }));
  const rejoin = async (client: Client) => {
    const from = client.messages.length, requestId = crypto.randomUUID();
    client.socket.send(JSON.stringify({ type: 'REJOIN_ROOM', requestId, payload: { roomCode: code } }));
    return waitFor(client, e => e.type === 'ROOM_STATE' && e.requestId === requestId, from);
  };
  const command = async (client: Client, type: string, payload: object = {}, response = 'COMMAND_ACK') => {
    const from = client.messages.length, requestId = crypto.randomUUID();
    client.socket.send(JSON.stringify({ type, requestId, payload: { roomCode: code, ...payload } }));
    return waitFor(client, e => e.requestId === requestId && (e.type === response || e.type === 'ERROR' || e.type === 'BID_REJECTED'), from);
  };
  return { ...built, rest, code, connect, rejoin, command, clock, room: () => built.manager.loadRoom(code) };
}
const stateOf = (e: ServerEvent) => e.payload as Record<string, any>;

describe('websocket authentication', () => {
  it('connects with the bearer subprotocol, still accepts the deprecated query token, and never logs the token', async () => {
    const lines: string[] = [];
    const t = await setup({ logStream: { write: m => { lines.push(m); } } });
    const viaProtocol = await t.connect('host', 'protocol');
    expect((await t.rejoin(viaProtocol)).payload).toMatchObject({ roomCode: t.code });
    const viaQuery = await t.connect('a', 'query');
    await t.rejoin(viaQuery);
    await t.rest('host', 'GET', '/api/rooms/' + t.code + '/state');
    await t.app.inject({ url: '/api/rooms/' + t.code, headers: { authorization: 'Bearer wrong-token' } });
    await sleep(50);
    expect(lines.length).toBeGreaterThan(0);
    for (const token of ['host-token', 'a-token', 'wrong-token']) expect(lines.join('')).not.toContain(token);
  });
  it('rejects invalid tokens, a bearer without the auction.v1 marker, and an expired session with a clear error', async () => {
    const t = await setup({ auth: tokens({ 'short-token': { userId: 'a', expiresAt: Date.now() + 250 } }) });
    await expect(t.app.injectWS('/ws?token=nope', { headers: { origin } })).rejects.toThrow();
    await expect(t.app.injectWS('/ws', { headers: { origin, 'sec-websocket-protocol': 'auction.v1, bearer.nope' } })).rejects.toThrow();
    await expect(t.app.injectWS('/ws', { headers: { origin, 'sec-websocket-protocol': 'bearer.host-token' } })).rejects.toThrow();
    const client = track(await t.app.injectWS('/ws?token=short-token', { headers: { origin } }));
    await sleep(350);
    client.socket.send(JSON.stringify({ type: 'PING' }));
    expect(await waitFor(client, e => e.type === 'ERROR')).toMatchObject({ payload: { reason: 'UNAUTHENTICATED', message: 'Your session expired. Sign in again.' } });
    expect(await client.closed).toBe(4001);
  });
});

describe('reconnection', () => {
  it('keeps teams, team ids, sequence, timer and bids unchanged across refresh, parallel rejoins and a RUNNING reconnect', async () => {
    const t = await setup();
    const host = await t.connect('host'); await t.rejoin(host);
    await t.command(host, 'START_AUCTION');
    const a = await t.connect('a'); await t.rejoin(a);
    await t.command(a, 'PLACE_BID', { amountCr: 3 });
    const before = await t.room();
    const ids = before.teams.map(x => x.id);
    a.socket.terminate();
    const again = await t.connect('a');
    const parallel = [again, await t.connect('a'), await t.connect('a')];
    const states = await Promise.all(parallel.map(c => t.rejoin(c)));
    for (const s of states) {
      expect(s.sequence).toBe(before.sequence);
      expect(stateOf(s)).toMatchObject({ status: 'RUNNING', currentUserTeam: { userId: 'a' } });
      expect(stateOf(s).teams.map((x: any) => x.id)).toEqual(ids);
    }
    const after = await t.room();
    expect(after.teams.map(x => x.id)).toEqual(ids);
    expect(after.sequence).toBe(before.sequence);
    expect(after.status).toBe('RUNNING');
    expect(after.active?.endsAt).toBe(before.active?.endsAt);
    expect(after.bids).toHaveLength(1);
  });
  it('keeps a paused auction paused and a confirmed bid after the socket drops', async () => {
    const t = await setup();
    const host = await t.connect('host'); await t.rejoin(host);
    await t.command(host, 'START_AUCTION');
    const b = await t.connect('b'); await t.rejoin(b);
    expect(await t.command(b, 'PLACE_BID', { amountCr: 3 })).toMatchObject({ type: 'COMMAND_ACK' });
    await t.command(host, 'PAUSE_AUCTION');
    const remaining = (await t.room()).active?.remainingTimeMs;
    b.socket.terminate(); await sleep(30);
    const back = await t.connect('b');
    const snapshot = stateOf(await t.rejoin(back));
    expect(snapshot.status).toBe('PAUSED');
    expect((await t.room()).active?.remainingTimeMs).toBe(remaining);
    expect((await t.room()).bids).toHaveLength(1);
    expect((await t.room()).status).toBe('PAUSED');
  });
  it('does not store a rejected bid and rejects a client-supplied teamId', async () => {
    const t = await setup();
    const host = await t.connect('host'); await t.rejoin(host);
    await t.command(host, 'START_AUCTION');
    const a = await t.connect('a'); await t.rejoin(a);
    const mark = a.messages.length;
    a.socket.send(JSON.stringify({ type: 'PLACE_BID', requestId: 'forged-1', payload: { roomCode: t.code, amountCr: 3, teamId: (await t.room()).teams[0]!.id } }));
    expect((await waitFor(a, e => e.type === 'ERROR' || e.type === 'BID_REJECTED', mark)).payload).toMatchObject({ reason: 'INVALID_MESSAGE' });
    expect((await t.room()).bids).toHaveLength(0);
  });
  it('blocks outsiders from the room and from takeover of an existing team', async () => {
    const t = await setup();
    const outsider = await t.connect('outsider');
    const from = outsider.messages.length, requestId = crypto.randomUUID();
    outsider.socket.send(JSON.stringify({ type: 'REJOIN_ROOM', requestId, payload: { roomCode: t.code } }));
    expect((await waitFor(outsider, e => e.requestId === requestId, from)).payload).toMatchObject({ reason: 'NOT_ROOM_MEMBER' });
    const host = await t.connect('host'); await t.rejoin(host);
    const mark = outsider.messages.length;
    await t.command(host, 'START_AUCTION');
    await sleep(100);
    expect(outsider.messages.slice(mark).filter(e => e.type !== 'PRESENCE_UPDATED')).toHaveLength(0);
    const before = (await t.room()).teams.map(x => [x.id, x.userId, x.name]);
    expect((await t.rest('outsider', 'POST', '/api/rooms/' + t.code + '/join', { teamName: 'Host FC' })).statusCode).toBeGreaterThanOrEqual(400);
    const conflict = await t.rest('a', 'POST', '/api/rooms/' + t.code + '/join', { teamName: 'Host FC' });
    expect(conflict.statusCode).toBeGreaterThanOrEqual(400);
    expect((await t.room()).teams.map(x => [x.id, x.userId, x.name])).toEqual(before);
  });
  it('gives a completed room a view-only state and rejects commands', async () => {
    const t = await setup();
    const host = await t.connect('host'); await t.rejoin(host);
    await t.command(host, 'START_AUCTION');
    await t.command(host, 'END_AUCTION');
    const a = await t.connect('a');
    expect(stateOf(await t.rejoin(a))).toMatchObject({ status: 'COMPLETED', resumePath: '/results/' + t.code });
    expect((await t.command(a, 'PLACE_BID', { amountCr: 3 })).type).toBe('BID_REJECTED');
    expect((await t.room()).bids).toHaveLength(0);
  });
});

describe('presence', () => {
  it('sends teamPresence to the host only, keeps disconnected teams, and persists last seen across a restart', async () => {
    const sql = new FakeLiveSql();
    const store = new PostgresPresenceStore(sql.fn);
    const repository = new MemoryRoomRepository();
    const t = await setup({ repository, presenceStore: store });
    const host = await t.connect('host'); const hostState = await t.rejoin(host);
    const b = await t.connect('b'); const bState = await t.rejoin(b);
    expect(stateOf(hostState).teamPresence).toBeDefined();
    expect(stateOf(bState).teamPresence).toBeUndefined();
    const hostMark = host.messages.length;
    t.clock.value = 250_000;
    b.socket.terminate();
    const update = await waitFor(host, e => e.type === 'PRESENCE_UPDATED' && stateOf(e).teamPresence?.some((x: any) => x.userId === 'b' && !x.connected), hostMark);
    const entry = stateOf(update).teamPresence.find((x: any) => x.userId === 'b');
    expect(entry).toMatchObject({ connected: false, lastSeenAt: 250_000, managerUsername: '' });
    expect(stateOf(update).teamPresence).toHaveLength(3);
    const a = await t.connect('a'); await t.rejoin(a);
    expect(a.messages.filter(e => e.type === 'PRESENCE_UPDATED').every(e => stateOf(e).teamPresence === undefined)).toBe(true);
    expect(a.messages.filter(e => e.type === 'ROOM_STATE').every(e => stateOf(e).teamPresence === undefined)).toBe(true);
    const room = await t.room();
    expect(room.teams.find(x => x.userId === 'b')).toMatchObject({ spentUnits: 0 });
    expect(room.teams).toHaveLength(3);
    for (let i = 0; i < 100 && !sql.presence.has(t.code + '|b'); i++) await sleep(10);
    expect(sql.presence.get(t.code + '|b')).toBe(250_000);
    // Restart: a new app over the same repository and the same persisted presence store.
    await t.app.close(); cleanup.pop();
    const second = await setup({ repository, presenceStore: new PostgresPresenceStore(sql.fn), code: t.code });
    const host2 = await second.connect('host'); const state2 = await second.rejoin(host2);
    expect(stateOf(state2).teamPresence.find((x: any) => x.userId === 'b')).toMatchObject({ connected: false, lastSeenAt: 250_000 });
    const summary = await second.rest('host', 'GET', '/api/rooms/' + t.code + '/summary');
    expect(summary.json().teams.find((x: any) => x.name === 'B FC')).toMatchObject({ connected: false, lastSeenAt: 250_000 });
    const memberView = await second.rest('b', 'GET', '/api/rooms/' + t.code + '/summary');
    expect(memberView.json().teams.every((x: any) => !('lastSeenAt' in x))).toBe(true);
  });
  it('counts a user once with several sockets and does not double count a repeated REJOIN_ROOM', async () => {
    const t = await setup();
    const host = await t.connect('host'); await t.rejoin(host);
    const one = await t.connect('b'); await t.rejoin(one); await t.rejoin(one);
    const two = await t.connect('b'); await t.rejoin(two);
    one.socket.terminate(); await sleep(50);
    expect(t.hub.connectedUsers(t.code).filter(u => u === 'b')).toHaveLength(1);
    expect((await t.hub.presenceFor(t.code))['b']?.connected).toBe(true);
    two.socket.terminate(); await sleep(50);
    expect((await t.hub.presenceFor(t.code))['b']?.connected).toBe(false);
  });
  it('closes the oldest socket with 4003 when a user opens a ninth connection', async () => {
    const t = await setup();
    const clients: Client[] = [];
    for (let i = 0; i < 9; i++) clients.push(await t.connect('a'));
    expect(await clients[0]!.closed).toBe(4003);
    expect(clients[0]!.messages.find(e => e.type === 'ERROR')).toMatchObject({ payload: { reason: 'CONNECTION_SUPERSEDED' } });
    await sleep(30);
    expect(clients[8]!.socket.readyState).toBe(1);
  });
});

describe('PresenceTracker', () => {
  it('reloads persisted last seen into a fresh tracker', async () => {
    const store = new MemoryPresenceStore();
    let now = 10;
    const first = new PresenceTracker(store, () => now);
    first.connect('ABC234', 'u1'); now = 20; first.disconnect('ABC234', 'u1');
    await new Promise(r => setTimeout(r, 5));
    const second = new PresenceTracker(store, () => 99);
    await second.ensureLoaded('ABC234');
    expect(second.snapshot('ABC234')).toEqual({ u1: { connected: false, lastSeenAt: 20 } });
  });
  it('swallows storage failures', async () => {
    const failing = new PostgresPresenceStore((() => Promise.reject(new Error('boom'))) as never);
    await expect(failing.touch('ABC234', 'u1', 1)).resolves.toBeUndefined();
    await expect(failing.load('ABC234')).resolves.toEqual({});
  });
});
