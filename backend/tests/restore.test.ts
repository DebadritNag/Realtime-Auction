import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { StaticTokenAuthService } from '../src/modules/auth-context/auth.service.js';
import { MemoryFc26Catalog } from '../src/modules/fc26/fc26.catalog.js';
import { resolveFc26Config } from '../src/modules/fc26/fc26.config.js';
import { assertRoom } from '../src/modules/auction/squad.service.js';
import { RoomManager, ValidatingHydrator } from '../src/modules/rooms/room.manager.js';
import { MemoryRoomRepository } from '../src/repositories/memory.js';
import { FileRoomRepository } from '../src/repositories/file.js';
import { CatalogPlayerRepository, demoPlayers } from '../src/modules/players/player.service.js';
import { roomState } from '../src/modules/rooms/room-state.js';
import { RealtimeHub } from '../src/realtime/hub.js';
import { archiveFinalPriceUnits, buildArchiveRows } from '../src/modules/manager-mode/completed-auction-archive.js';
import { buildMatchIndex, manualPlayerId, matchPlayer, normalizeName } from '../src/modules/restore/restore.matcher.js';
import { validateSnapshot } from '../src/modules/restore/restore.validate.js';
import { restoreSnapshotSchema, type RestoreSnapshot } from '../src/modules/restore/restore.schema.js';
import { loadDefaultPoolPlayers } from '../src/modules/restore/restore.routes.js';
import { RETENTION_PRICE_UNITS } from '../src/domain/retention.js';
import { toUnits } from '../src/domain/money.js';
import type { Player, Room } from '../src/domain/types.js';
const catalog = new MemoryFc26Catalog(resolveFc26Config({}));
const TEMPLATE_PATH = resolve(import.meta.dirname, '../data/restore/super-league-auction-2026.json');
const TEAMS = ['Ritzz FC', 'FidoDido FC', 'DDD', 'SIDERALE', 'APOLLO FC', 'RedBull FC', 'Dakshineswar FC', 'BGT'];
const PURSES = [59, 50.5, 0, 29, 13.5, 48, 38, 20];
const SQUADS = [10, 9, 17, 10, 14, 11, 12, 16];
const RETAINED = [0, 1, 0, 3, 2, 1, 3, 1];
const SLOTS = [10, 11, 3, 10, 6, 9, 8, 4];
const USERS = ['host', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'outsider'];
const code = (error: unknown) => (error as { code?: string }).code;
const rejects = async (promise: Promise<unknown>, expected: string) => {
  const error = await promise.then(() => null, e => e);
  expect(code(error), String(error)).toBe(expected);
};
let template: RestoreSnapshot;
let fc26Players: Player[];
beforeAll(async () => {
  await catalog.importAll();
  fc26Players = await catalog.list();
  template = restoreSnapshotSchema.parse(JSON.parse(await readFile(TEMPLATE_PATH, 'utf8')));
}, 120_000);
const apps: { close(): Promise<unknown> }[] = [];
afterEach(async () => { while (apps.length) await apps.pop()!.close(); });
async function setup(repository?: MemoryRoomRepository | FileRoomRepository) {
  const clock = { value: 1_000_000, now() { return this.value; } };
  const built = await buildApp({ authService: new StaticTokenAuthService(new Map(USERS.map(u => [u, { userId: u, username: u + '-name' }]))),
    fc26: catalog, repository, clock, logger: false, timersEnabled: false });
  apps.push(built.app);
  const as = (user: string) => ({ authorization: `Bearer ${user}` });
  const create = (snapshot: RestoreSnapshot = template, extra: Record<string, unknown> = {}, user = 'host') => built.app.inject({ method: 'POST', url: '/api/restore/rooms',
    headers: as(user), payload: { auctionName: 'Restored League', snapshot, ...extra } });
  const join = (roomCode: string, user: string, restoredTeamId?: string) => built.app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/join`, headers: as(user),
    payload: restoredTeamId ? { restoredTeamId } : { teamName: 'Whatever FC' } });
  const command = (roomCode: string, type: string, user = 'host', extra: Record<string, unknown> = {}) =>
    built.engine.execute(roomCode, user, { type, payload: { roomCode, ...extra } } as never);
  const createRoom = async (snapshot?: RestoreSnapshot, extra?: Record<string, unknown>) => {
    const res = await create(snapshot, extra);
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    const teams = body.restore.teams as { id: string; name: string; claimed: boolean }[];
    return { ...body, teamId: (name: string) => teams.find(t => t.name === name)!.id as string, teams };
  };
  /** Every unclaimed team gets its own user, in team order. */
  const claimAll = async (roomCode: string, teams: { id: string; claimed: boolean }[]) => {
    const claimedBy: Record<string, string> = {};
    let next = 1;
    for (const t of teams) if (!t.claimed) { const user = `u${next++}`; const res = await join(roomCode, user, t.id); expect(res.statusCode, res.body).toBe(200); claimedBy[t.id] = user; }
    return claimedBy;
  };
  const state = (roomCode: string) => built.manager.loadRoom(roomCode);
  return { ...built, clock, as, create, join, command, createRoom, claimAll, state };
}
/** Two-team custom snapshot made of manual players: a nearly full team (19) and a small one. */
function customSnapshot(): RestoreSnapshot {
  const manualTeam = (name: string, count: number, purse: number) => ({ name, squadSize: count, remainingPurseCr: purse, retainedCount: 0,
    players: Array.from({ length: count }, (_, i) => ({ name: `Restored ${name[0]} Player ${i + 1}`, position: 'CM', acquisition: 'AUCTION' as const, manual: {} })) });
  return { version: 1, name: 'Custom', hostTeam: 'Full FC', teams: [manualTeam('Full FC', 19, 80), manualTeam('Small FC', 1, 80)] };
}
describe('matcher', () => {
  const mk = (id: string, name: string, extra: Partial<Player> = {}): Player => ({ id, name, position: 'MID', ovr: 80, stats: {}, basePriceUnits: 6, potId: 'MID', positions: ['CM'], subPosition: 'CM', ...extra });
  it('normalizes accents, special letters and punctuation', () => {
    expect(normalizeName('Ødegaard')).toBe('odegaard');
    expect(normalizeName('H. Çalhanoğlu')).toBe(normalizeName('h calhanoglu'));
    expect(normalizeName('Sørloth')).toBe('sorloth');
    expect(normalizeName('Weiß')).toBe('weiss');
    expect(normalizeName('Alexander-Arnold')).toBe('alexander arnold');
  });
  it('matches accent-insensitively on short_name, then long_name', () => {
    const index = buildMatchIndex([mk('1', 'M. Ødegaard'), mk('2', 'K. Mbappé', { fullName: 'Kylian Mbappé Lottin', positions: ['ST'], subPosition: 'ST' })]);
    expect(matchPlayer(index, { name: 'M. Odegaard', position: 'CM', acquisition: 'AUCTION' })).toMatchObject({ kind: 'MATCHED_FC26', player: { id: '1' } });
    expect(matchPlayer(index, { name: 'Kylian Mbappe Lottin', position: 'ST', acquisition: 'AUCTION' })).toMatchObject({ kind: 'MATCHED_FC26', player: { id: '2' } });
  });
  it('narrows several hits by position and reports an ambiguity otherwise', () => {
    const index = buildMatchIndex([mk('1', 'Rodri', { positions: ['CDM'], subPosition: 'CDM' }), mk('2', 'Rodri', { positions: ['ST'], subPosition: 'ST' })]);
    expect(matchPlayer(index, { name: 'Rodri', position: 'ST', acquisition: 'AUCTION' })).toMatchObject({ kind: 'MATCHED_FC26', player: { id: '2' } });
    const result = matchPlayer(index, { name: 'Rodri', position: 'LB', acquisition: 'AUCTION' });
    expect(result.kind).toBe('AMBIGUOUS');
    expect(result.candidates?.map(c => c.playerId).sort()).toEqual(['1', '2']);
    expect(matchPlayer(index, { name: 'Rodri', position: 'LB', acquisition: 'AUCTION', playerId: '1' })).toMatchObject({ kind: 'RESOLVED', player: { id: '1' } });
  });
  it('falls back to the default pool and then to suggestions', () => {
    const index = buildMatchIndex([mk('1', 'A. Known')], [mk('9', 'L. Messi', { positions: ['RW'], subPosition: 'RW' })]);
    expect(matchPlayer(index, { name: 'L. Messi', position: 'RW', acquisition: 'RETENTION' })).toMatchObject({ kind: 'MATCHED_DEFAULT_POOL', source: 'DEFAULT_POOL', player: { id: '9' } });
    const missing = matchPlayer(index, { name: 'B. Known', position: 'CM', acquisition: 'AUCTION' });
    expect(missing.kind).toBe('UNMATCHED');
    expect(missing.suggestions?.[0]?.playerId).toBe('1');
  });
  it('gives manual players a stable id and a bad host-supplied id stays unresolved', () => {
    const entry = { name: 'Nobody Special', position: 'CM', acquisition: 'AUCTION' as const, manual: { ovr: 70 } };
    const index = buildMatchIndex([]);
    const first = matchPlayer(index, entry);
    expect(first).toMatchObject({ kind: 'MANUAL', source: 'MANUAL', player: { id: manualPlayerId('Nobody Special', 'CM'), ovr: 70 } });
    expect(matchPlayer(index, { ...entry }).player!.id).toBe(first.player!.id);
    expect(manualPlayerId('nobody special', 'cm')).toBe(first.player!.id);
    expect(matchPlayer(index, { name: 'X Y', position: 'CM', acquisition: 'AUCTION', playerId: 'nope' }).kind).toBe('UNMATCHED');
  });
});
describe('template', () => {
  it('is strict UTF-8 without replacement characters and keeps accented names', async () => {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(TEMPLATE_PATH));
    expect(text).not.toContain('\uFFFD');
    for (const name of ['J. Koundé', 'H. Çalhanoğlu', 'M. Ødegaard', 'A. Sørloth', 'Iñigo Martínez', 'Éder Militão']) expect(text).toContain(name);
  });
  it('lists 8 teams and 99 players (11 retained, 88 auction) with exact purses and counts', () => {
    expect(template.teams.map(t => t.name)).toEqual(TEAMS);
    expect(template.teams.map(t => t.remainingPurseCr)).toEqual(PURSES);
    expect(template.teams.map(t => t.squadSize)).toEqual(SQUADS);
    expect(template.teams.map(t => t.retainedCount)).toEqual(RETAINED);
    const all = template.teams.flatMap(t => t.players);
    expect(all).toHaveLength(99);
    expect(all.filter(p => p.acquisition === 'RETENTION')).toHaveLength(11);
    expect(all.filter(p => p.underdog)).toHaveLength(16);
  });
  it('validates against the FC26 catalog: 99/99 matched, no critical issues, all underdogs recognised', async () => {
    const { preview } = validateSnapshot(template, { fc26Players, defaultPool: await loadDefaultPoolPlayers() });
    expect(preview.canConfirm).toBe(true);
    expect(preview.issues.filter(i => i.severity === 'CRITICAL')).toEqual([]);
    expect(preview.totals).toMatchObject({ teams: 8, players: 99, retained: 11, auction: 88, matchedFc26: 99, matchedDefaultPool: 0, manual: 0, unresolved: 0 });
    expect(preview.teams.map(t => t.remainingSlots)).toEqual(SLOTS);
    expect(preview.issues.map(i => i.code).filter(c => c === 'UNDERDOG_MISMATCH')).toEqual([]);
    expect(preview.remainingPool.total).toBe((await catalog.stats()).total - 99);
    const owned = preview.teams.flatMap(t => t.players.map(p => p.match.playerId!));
    expect(new Set(owned).size).toBe(99);
    const flagged = preview.issues.filter(i => i.severity === 'WARNING').map(i => i.code);
    expect(flagged).toContain('TEAM_VERIFY');
    expect(flagged).toContain('VERIFY_ENTRY');
  });
});
describe('validation', () => {
  const validate = async (mutate: (s: RestoreSnapshot) => void) => {
    const snapshot = structuredClone(template);
    mutate(snapshot);
    return validateSnapshot(snapshot, { fc26Players, defaultPool: [] }).preview;
  };
  const codes = (preview: Awaited<ReturnType<typeof validate>>) => preview.issues.filter(i => i.severity === 'CRITICAL').map(i => i.code);
  it('blocks duplicates, count mismatches, unresolved players and oversized squads', async () => {
    const duplicate = await validate(s => { s.teams[1]!.players.push(structuredClone(s.teams[0]!.players[0]!)); s.teams[1]!.squadSize++; s.teams[1]!.retainedCount; });
    expect(duplicate.canConfirm).toBe(false);
    expect(codes(duplicate)).toContain('DUPLICATE_PLAYER');
    expect(codes(await validate(s => { s.teams[0]!.squadSize = 11; }))).toContain('SQUAD_COUNT_MISMATCH');
    expect(codes(await validate(s => { s.teams[1]!.retainedCount = 2; }))).toContain('RETAINED_COUNT_MISMATCH');
    expect(codes(await validate(s => { s.teams[0]!.auctionCount = 3; }))).toContain('AUCTION_COUNT_MISMATCH');
    const unresolved = await validate(s => { s.teams[0]!.players[0]!.name = 'Zzyzx Qwerty'; });
    expect(unresolved.canConfirm).toBe(false);
    expect(codes(unresolved)).toContain('PLAYER_UNMATCHED');
    expect(codes(await validate(s => { s.teams[1]!.name = 'ritzz fc'; }))).toContain('DUPLICATE_TEAM_NAME');
    const oversized = await validate(s => {
      const team = s.teams[2]!;
      team.players.push(...s.teams[0]!.players.slice(0, 4).map(p => ({ ...p, name: p.name + ' ' })));
      team.squadSize = team.players.length;
    });
    expect(codes(oversized)).toContain('SQUAD_TOO_LARGE');
    const unknownPosition = await validate(s => { s.teams[0]!.players[0]!.position = 'XX'; });
    expect(codes(unknownPosition)).toContain('INVALID_POSITION');
  });
  it('lets the host resolve an unmatched player with a manual record and flags it as a warning', async () => {
    const preview = await validate(s => { Object.assign(s.teams[0]!.players[0]!, { name: 'Zzyzx Qwerty', manual: { ovr: 70 } }); });
    expect(preview.canConfirm).toBe(true);
    expect(preview.totals.manual).toBe(1);
    expect(preview.issues.map(i => i.code)).toContain('MANUAL_PLAYER');
  });
  it('rejects a malformed purse at the schema', () => {
    const bad = structuredClone(template);
    bad.teams[0]!.remainingPurseCr = 10.25;
    expect(restoreSnapshotSchema.safeParse(bad).success).toBe(false);
    bad.teams[0]!.remainingPurseCr = -1;
    expect(restoreSnapshotSchema.safeParse(bad).success).toBe(false);
  });
});
describe('restore routes', () => {
  it('serves the template and previews it', async () => {
    const f = await setup();
    const templates = await f.app.inject({ url: '/api/restore/templates', headers: f.as('host') });
    expect(templates.statusCode).toBe(200);
    const [served] = templates.json().templates;
    expect(served).toMatchObject({ id: 'super-league-auction-2026', teamCount: 8, playerCount: 99, hostTeam: 'Ritzz FC' });
    const payload = { snapshot: served.snapshot };
    const res = await f.app.inject({ method: 'POST', url: '/api/restore/preview', headers: f.as('host'), payload });
    expect(res.statusCode, res.body).toBe(200);
    const { preview } = res.json();
    expect(preview.canConfirm).toBe(true);
    expect(preview.teams.map((t: { name: string }) => t.name)).toEqual(TEAMS);
    expect(preview.teams.map((t: { remainingPurseCr: number }) => t.remainingPurseCr)).toEqual(PURSES);
    expect(preview.teams.map((t: { squadSize: number }) => t.squadSize)).toEqual(SQUADS);
    expect(preview.teams.map((t: { retainedCount: number }) => t.retainedCount)).toEqual(RETAINED);
    expect(preview.teams.map((t: { remainingSlots: number }) => t.remainingSlots)).toEqual(SLOTS);
    expect(preview.totals).toMatchObject({ players: 99, matchedFc26: 99 });
    expect((await f.app.inject({ url: '/api/restore/templates' })).statusCode).toBe(401);
  });
  it('searches the catalog for host resolution before a room exists', async () => {
    const f = await setup();
    const res = await f.app.inject({ url: '/api/restore/players?search=messi&limit=5', headers: f.as('host') });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().players.some((p: { name: string }) => p.name === 'L. Messi')).toBe(true);
    expect((await f.app.inject({ url: '/api/restore/players', headers: f.as('host') })).statusCode).toBe(400);
  });
  it('creates a LOBBY room with a new code, restored players SOLD and exact purses', async () => {
    const f = await setup();
    const created = await f.createRoom();
    expect(created.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(created.restore.source).toBe('TEMPLATE');
    expect(created.restore.teams.map((t: { claimed: boolean }) => t.claimed)).toEqual([true, false, false, false, false, false, false, false]);
    const room = await f.state(created.roomCode);
    expect(room.status).toBe('LOBBY');
    expect(room.hostUserId).toBe('host');
    expect(room.teams.map(t => t.name)).toEqual(TEAMS);
    expect(room.teams.map(t => t.startingBudgetUnits)).toEqual(PURSES.map(toUnits));
    expect(room.teams.map(t => t.spentUnits)).toEqual(new Array(8).fill(0));
    expect(room.teams.map(t => t.playerIds.length)).toEqual(SQUADS);
    expect(room.teams.reduce((n, t) => n + t.playerIds.length, 0)).toBe(99);
    expect(room.players).toHaveLength(99);
    expect(room.players.every(p => p.status === 'SOLD' && p.restoredFromSnapshot === true)).toBe(true);
    expect(room.teams[0]!.userId).toBe('host');
    expect(room.teams.slice(1).every(t => t.userId === 'unclaimed:' + t.id)).toBe(true);
    const retained = room.purchases.filter(p => p.acquisitionType === 'RETENTION');
    expect(retained).toHaveLength(11);
    expect(retained.every(p => p.isRetained && p.recordedPriceUnits === RETENTION_PRICE_UNITS && p.priceUnits === 0 && p.restoredFromSnapshot)).toBe(true);
    const auction = room.purchases.filter(p => p.acquisitionType === 'AUCTION');
    expect(auction).toHaveLength(88);
    expect(auction.every(p => !p.isRetained && p.recordedPriceUnits === null && p.priceUnits === 0)).toBe(true);
    expect(room.teams.map(t => room.purchases.filter(p => p.teamId === t.id && p.isRetained).length)).toEqual(RETAINED);
    expect(room.restore).toMatchObject({ version: 1, source: 'TEMPLATE', snapshotName: 'Super League Football Auction 2026' });
    assertRoom(room);
    // A second restore gets a different room id and code.
    const second = await f.createRoom();
    expect(second.roomCode).not.toBe(created.roomCode);
    expect(second.roomId).not.toBe(created.roomId);
  });
  it('rejects invalid snapshots with RESTORE_VALIDATION_FAILED and creates nothing', async () => {
    const f = await setup();
    const bad = structuredClone(template);
    bad.teams[1]!.players.push(structuredClone(bad.teams[0]!.players[0]!));
    bad.teams[1]!.squadSize++;
    const res = await f.create(bad);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('RESTORE_VALIDATION_FAILED');
    expect(res.json().error.issues.some((i: { code: string }) => i.code === 'DUPLICATE_PLAYER')).toBe(true);
    expect(await f.manager.repository.listRecoverable()).toHaveLength(0);
    const unknownHost = await f.create(template, { hostTeamName: 'Nobody FC' });
    expect(unknownHost.statusCode).toBe(422);
    expect(unknownHost.json().error.code).toBe('HOST_TEAM_NOT_FOUND');
    const forbidden = await f.create(template, { settings: { startingBudgetCr: 5 } });
    expect(forbidden.statusCode).toBe(400);
  });
  it('shows prospective joiners the teams to claim, without budgets', async () => {
    const f = await setup();
    const created = await f.createRoom();
    const res = await f.app.inject({ url: `/api/rooms/${created.roomCode}`, headers: f.as('u1') });
    const body = res.json();
    expect(body.restore.teams.map((t: { name: string }) => t.name)).toEqual(TEAMS);
    expect(JSON.stringify(body)).not.toMatch(/purse|spentCr|playerIds|remainingBudget/i);
    expect(JSON.stringify(body)).not.toContain('unclaimed:');
  });
});
describe('claims', () => {
  it('binds a manager to the chosen team without changing its name or squad', async () => {
    const f = await setup();
    const created = await f.createRoom();
    const ddd = created.teamId('DDD');
    const res = await f.join(created.roomCode, 'u1', ddd);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().team).toMatchObject({ id: ddd, name: 'DDD', playersOwned: 17, remainingSlots: 3, claimed: true, restoredRetainedCount: 0, restoredAuctionCount: 17 });
    // Idempotent for the same team; the submitted name is ignored.
    expect((await f.join(created.roomCode, 'u1', ddd)).statusCode).toBe(200);
    // One user, one team.
    const other = await f.join(created.roomCode, 'u1', created.teamId('BGT'));
    expect(other.statusCode).toBe(409);
    expect(other.json().error.code).toBe('ALREADY_CLAIMED_ANOTHER_TEAM');
    // One team, one user.
    const taken = await f.join(created.roomCode, 'u2', ddd);
    expect(taken.json().error.code).toBe('TEAM_ALREADY_CLAIMED');
    expect((await f.join(created.roomCode, 'u2', created.teamId('Ritzz FC'))).json().error.code).toBe('TEAM_ALREADY_CLAIMED');
    // The restored team needs an explicit choice and unknown ids are rejected.
    const none = await f.app.inject({ method: 'POST', url: `/api/rooms/${created.roomCode}/join`, headers: f.as('u3'), payload: { teamName: 'Mine FC' } });
    expect(none.json().error.code).toBe('RESTORED_TEAM_REQUIRED');
    expect((await f.join(created.roomCode, 'u3', '00000000-0000-4000-8000-000000000000')).json().error.code).toBe('TEAM_NOT_FOUND');
    const room = await f.state(created.roomCode);
    expect(room.teams.find(t => t.id === ddd)).toMatchObject({ userId: 'u1', name: 'DDD', managerUsername: 'u1-name' });
    expect(room.teams).toHaveLength(8);
    assertRoom(room);
  });
  it('masks unclaimed teams in the state and lists claim status per team', async () => {
    const f = await setup();
    const created = await f.createRoom();
    await f.join(created.roomCode, 'u1', created.teamId('BGT'));
    const state = roomState(await f.state(created.roomCode), 'host', 0);
    const bgt = state.teams.find(t => t.name === 'BGT')!;
    const fido = state.teams.find(t => t.name === 'FidoDido FC')!;
    expect(bgt).toMatchObject({ claimed: true, userId: 'u1', remainingSlots: 4, restoredRetainedCount: 1, restoredAuctionCount: 15, remainingBudgetCr: 20 });
    expect(fido).toMatchObject({ claimed: false, userId: '', remainingSlots: 11, remainingBudgetCr: 50.5 });
    expect(state.restore).toMatchObject({ enabled: true, unclaimedCount: 6 });
    expect(state.restore!.teams.map(t => t.remainingSlots)).toEqual(SLOTS);
    expect(state.soldPlayers).toHaveLength(99);
    expect(state.soldPlayers.every(p => p.priceCr === null && p.restoredFromSnapshot === true)).toBe(true);
    expect(state.soldPlayers.filter(p => p.isRetained).every(p => p.recordedPriceCr === 15)).toBe(true);
    expect(state.activity).toEqual([]);
    expect(JSON.stringify(state)).not.toContain('unclaimed:');
  });
  it('never leaks the unclaimed sentinel through host team presence', async () => {
    const f = await setup();
    const created = await f.createRoom();
    const room = await f.state(created.roomCode);
    const hub = Object.assign(Object.create(RealtimeHub.prototype), { tracker: { snapshot: () => ({}) }, usernames: () => ({}) });
    const presence = (hub as unknown as { teamPresence(r: Room): unknown[] }).teamPresence(room);
    expect(presence).toHaveLength(8);
    expect(JSON.stringify(presence)).not.toContain('unclaimed:');
    expect(JSON.stringify(roomState(room, 'host', 0, [], {}, presence as never))).not.toContain('unclaimed:');
  });
  it('lets the host release a claim, leave frees the claim, and non-hosts cannot release', async () => {
    const f = await setup();
    const created = await f.createRoom();
    const sider = created.teamId('SIDERALE');
    await f.join(created.roomCode, 'u1', sider);
    const release = (user: string, teamId: string) => f.app.inject({ method: 'POST', url: `/api/rooms/${created.roomCode}/restore/release`, headers: f.as(user), payload: { teamId } });
    expect((await release('u1', sider)).statusCode).toBe(403);
    expect((await release('host', created.teamId('Ritzz FC'))).json().error.code).toBe('HOST_CANNOT_LEAVE');
    expect((await release('host', created.teamId('BGT'))).json().error.code).toBe('TEAM_NOT_CLAIMED');
    const freed = await release('host', sider);
    expect(freed.statusCode, freed.body).toBe(200);
    expect(freed.json().teams.find((t: { id: string }) => t.id === sider).claimed).toBe(false);
    expect((await f.join(created.roomCode, 'u2', sider)).statusCode).toBe(200);
    const left = await f.app.inject({ method: 'POST', url: `/api/rooms/${created.roomCode}/leave`, headers: f.as('u2'), payload: {} });
    expect(left.statusCode).toBe(204);
    const room = await f.state(created.roomCode);
    const team = room.teams.find(t => t.id === sider)!;
    expect(team.userId).toBe('unclaimed:' + sider);
    expect(team.playerIds).toHaveLength(10);
    assertRoom(room);
    // Kicking a manager also only frees the claim.
    await f.join(created.roomCode, 'u3', sider);
    await f.command(created.roomCode, 'KICK_MEMBER', 'host', { targetTeamId: sider });
    expect((await f.state(created.roomCode)).teams.find(t => t.id === sider)!.userId).toBe('unclaimed:' + sider);
  });
  it('refuses to start while a team is unclaimed', async () => {
    const f = await setup();
    const created = await f.createRoom();
    await rejects(f.command(created.roomCode, 'START_AUCTION'), 'RESTORE_TEAMS_UNCLAIMED');
    expect((await f.state(created.roomCode)).status).toBe('LOBBY');
  });
  it('locks purses, squad size, capacity and the pool source but allows timer settings', async () => {
    const f = await setup();
    const created = await f.createRoom();
    const patch = (payload: Record<string, unknown>) => f.app.inject({ method: 'PATCH', url: `/api/rooms/${created.roomCode}/settings`, headers: f.as('host'), payload });
    for (const bad of [{ startingBudgetCr: 100 }, { maxSquadSize: 18 }, { numberOfTeams: 10 }, { playerPoolSource: 'DEFAULT' }, { retention: { enabled: true } }]) {
      const res = await patch(bad);
      expect(res.statusCode, JSON.stringify(bad)).toBe(409);
      expect(res.json().error.code).toBe('RESTORE_SETTINGS_LOCKED');
    }
    expect((await patch({ playerTimerSeconds: 15 })).statusCode).toBe(200);
    await rejects(f.command(created.roomCode, 'UPDATE_SETTINGS', 'host', { settings: { startingBudgetCr: 100 } }), 'RESTORE_SETTINGS_LOCKED');
    await f.command(created.roomCode, 'UPDATE_SETTINGS', 'host', { settings: { playerTimerSeconds: 25 } });
    const room = await f.state(created.roomCode);
    expect(room.settings.playerTimerSeconds).toBe(25);
    expect(room.teams.map(t => t.startingBudgetUnits)).toEqual(PURSES.map(toUnits));
  });
});
describe('remaining pool', () => {
  it('lists the eligible pool for members only and excludes every restored player', async () => {
    const f = await setup();
    const created = await f.createRoom();
    const url = `/api/rooms/${created.roomCode}/restore/pool`;
    expect((await f.app.inject({ url, headers: f.as('outsider') })).statusCode).toBe(403);
    const res = await f.app.inject({ url: url + '?limit=100', headers: f.as('host') });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    const total = (await catalog.stats()).total;
    expect(body.poolTotal).toBe(total - 99);
    expect(body.total).toBe(total - 99);
    expect(body.ownedCount).toBe(99);
    const room = await f.state(created.roomCode);
    const owned = new Set(room.teams.flatMap(t => t.playerIds));
    expect(body.players.some((p: { id: string }) => owned.has(p.id))).toBe(false);
    expect(Object.values(body.byPot as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(total - 99);
    const search = await f.app.inject({ url: url + '?search=messi', headers: f.as('host') });
    expect(search.json().players.some((p: { name: string }) => p.name === 'L. Messi')).toBe(false);
  });
});
describe('auction after restore', () => {
  it('excludes restored players from the pool, blocks DDD (0 Cr), deducts from the restored purse and enforces the squad cap', async () => {
    const f = await setup();
    const created = await f.createRoom(undefined, { settings: { autoAdvance: false } });
    const claimedBy = await f.claimAll(created.roomCode, created.teams);
    await f.command(created.roomCode, 'START_AUCTION');
    let room = await f.state(created.roomCode);
    expect(room.status).toBe('RUNNING');
    const total = (await catalog.stats()).total;
    expect(room.players).toHaveLength(total);
    const owned = new Set(room.teams.flatMap(t => t.playerIds));
    expect(owned.size).toBe(99);
    expect(room.players.filter(p => p.status === 'SOLD')).toHaveLength(99);
    expect(room.players.filter(p => owned.has(p.id)).every(p => p.status === 'SOLD')).toBe(true);
    expect(room.players.find(p => p.id === room.active!.playerId)!.restoredFromSnapshot).toBeUndefined();
    assertRoom(room);
    const ddd = created.teamId('DDD');
    const bid = (teamName: string, amountCr: number) => f.command(created.roomCode, 'PLACE_BID', claimedBy[created.teamId(teamName)] ?? 'host', { amountCr });
    await rejects(bid('DDD', room.players.find(p => p.id === room.active!.playerId)!.basePriceUnits / 2), 'INSUFFICIENT_BUDGET');
    expect(ddd).toBeTruthy();
    // BGT (20 Cr, 16 players) wins the active player at its base price.
    const base = room.players.find(p => p.id === room.active!.playerId)!.basePriceUnits / 2;
    await bid('BGT', base);
    f.clock.value = (await f.state(created.roomCode)).active!.endsAt;
    await f.engine.onTimer(created.roomCode, (await f.state(created.roomCode)).active!.activationId);
    room = await f.state(created.roomCode);
    const bgt = room.teams.find(t => t.name === 'BGT')!;
    expect(bgt.playerIds).toHaveLength(17);
    expect(bgt.spentUnits).toBe(base * 2);
    expect((bgt.startingBudgetUnits - bgt.spentUnits) / 2).toBe(20 - base);
    expect(roomState(room, 'host', 0).teams.find(t => t.name === 'BGT')).toMatchObject({ remainingBudgetCr: 20 - base, remainingSlots: 3, playersOwned: 17 });
    assertRoom(room);
    expect(room.active).toBeNull();
  });
  it('lets a team with 19 players buy exactly once, then reports SQUAD_FULL', async () => {
    const f = await setup();
    const created = await f.createRoom(customSnapshot(), { settings: { autoAdvance: false } });
    await f.claimAll(created.roomCode, created.teams);
    await f.command(created.roomCode, 'START_AUCTION');
    const active = async () => { const r = await f.state(created.roomCode); return r.players.find(p => p.id === r.active!.playerId)!; };
    const first = await active();
    await f.command(created.roomCode, 'PLACE_BID', 'host', { amountCr: first.basePriceUnits / 2 });
    f.clock.value = (await f.state(created.roomCode)).active!.endsAt;
    await f.engine.onTimer(created.roomCode, (await f.state(created.roomCode)).active!.activationId);
    let room = await f.state(created.roomCode);
    const full = room.teams.find(t => t.name === 'Full FC')!;
    expect(full.playerIds).toHaveLength(20);
    expect(full.startingBudgetUnits).toBe(toUnits(80));
    expect(full.spentUnits).toBe(first.basePriceUnits);
    await f.command(created.roomCode, 'NEXT_PLAYER');
    const second = await active();
    await rejects(f.command(created.roomCode, 'PLACE_BID', 'host', { amountCr: second.basePriceUnits / 2 }), 'SQUAD_FULL');
    // The other team can still bid.
    await f.command(created.roomCode, 'PLACE_BID', 'u1', { amountCr: second.basePriceUnits / 2 });
    room = await f.state(created.roomCode);
    expect(roomState(room, 'host', 0).teams.find(t => t.name === 'Full FC')).toMatchObject({ remainingSlots: 0, maximumPermittedBidCr: 0 });
    // The host can complete the auction and the archive rows work with restored purchases.
    await f.command(created.roomCode, 'END_AUCTION');
    room = await f.state(created.roomCode);
    expect(room.status).toBe('COMPLETED');
    assertRoom(room);
    const mapping = new Map(room.players.map(p => [p.id, 'db-' + p.id]));
    const rows = buildArchiveRows(room, mapping);
    expect(rows).toHaveLength(room.players.length);
    const restoredRows = rows.filter(r => room.players.find(p => 'db-' + p.id === r.player_id)!.restoredFromSnapshot);
    expect(restoredRows).toHaveLength(20);
    expect(restoredRows.every(r => r.final_price_units! > 0 && r.status === 'SOLD')).toBe(true);
  });
});
describe('archive helper', () => {
  it('keeps ordinary prices and uses a positive placeholder for restored purchases', () => {
    const room = { players: [{ id: 'p1', basePriceUnits: 6 }] } as unknown as Room;
    const base = { id: 'x', playerId: 'p1', teamId: 't', bidCount: 0, at: 0, durationMs: 0 };
    expect(archiveFinalPriceUnits(room, { ...base, priceUnits: 14 })).toBe(14);
    expect(archiveFinalPriceUnits(room, { ...base, priceUnits: 0, restoredFromSnapshot: true, recordedPriceUnits: RETENTION_PRICE_UNITS })).toBe(30);
    expect(archiveFinalPriceUnits(room, { ...base, priceUnits: 0, restoredFromSnapshot: true, recordedPriceUnits: null })).toBe(6);
  });
});
describe('persistence', () => {
  it('survives a server restart: a new manager recovers the same state and invariants hold', async () => {
    const repository = new MemoryRoomRepository();
    const f = await setup(repository);
    const created = await f.createRoom();
    await f.join(created.roomCode, 'u1', created.teamId('DDD'));
    const before = await f.state(created.roomCode);
    const restarted = new RoomManager(repository, new CatalogPlayerRepository(demoPlayers.slice(0, 2)), f.clock, undefined, undefined, catalog);
    const recovered = await restarted.recover();
    expect(recovered.map(r => r.code)).toEqual([created.roomCode]);
    const after = await restarted.loadRoom(created.roomCode);
    expect(after).toEqual(before);
    assertRoom(after);
    expect(after.restore!.teams.map(t => t.purseUnits)).toEqual(PURSES.map(toUnits));
    expect(roomState(after, 'u1', 0).restore!.unclaimedCount).toBe(6);
  });
  it('round-trips through the file repository and hydrates again', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'restore-'));
    try {
      const f = await setup(new FileRoomRepository(dir));
      const created = await f.createRoom();
      await f.join(created.roomCode, 'u1', created.teamId('BGT'));
      const stored = await new FileRoomRepository(dir).findByCode(created.roomCode);
      expect(stored).not.toBeNull();
      const hydrated = new ValidatingHydrator().hydrate(stored!);
      expect(hydrated.teams.find(t => t.name === 'BGT')!.userId).toBe('u1');
      expect(hydrated.players.filter(p => p.restoredFromSnapshot)).toHaveLength(99);
      expect(hydrated.restore!.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('rejects a corrupted restored room at hydration', async () => {
    const f = await setup();
    const created = await f.createRoom();
    const room = structuredClone(await f.state(created.roomCode));
    room.teams[0]!.startingBudgetUnits += 2;
    expect(() => new ValidatingHydrator().hydrate(room)).toThrow();
  });
});
