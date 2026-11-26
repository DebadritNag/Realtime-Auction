import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { StaticTokenAuthService } from '../src/modules/auth-context/auth.service.js';
import { MemoryFc26Catalog } from '../src/modules/fc26/fc26.catalog.js';
import { resolveFc26Config } from '../src/modules/fc26/fc26.config.js';
import { assertRoom } from '../src/modules/auction/squad.service.js';
import { RoomManager } from '../src/modules/rooms/room.manager.js';
import { MemoryRoomRepository } from '../src/repositories/memory.js';
import { CatalogPlayerRepository, demoPlayers } from '../src/modules/players/player.service.js';
import { roomState } from '../src/modules/rooms/room-state.js';
import { buildArchiveRows } from '../src/modules/manager-mode/completed-auction-archive.js';
import { validateSnapshot } from '../src/modules/restore/restore.validate.js';
import { restoreSnapshotSchema, type RestoreSnapshot } from '../src/modules/restore/restore.schema.js';
import { DEFAULT_TEMPLATE_ID, loadDefaultPoolPlayers, loadRestoreTemplates } from '../src/modules/restore/restore.routes.js';
import { RETENTION_PRICE_UNITS } from '../src/domain/retention.js';
import { toUnits } from '../src/domain/money.js';
import type { Player } from '../src/domain/types.js';
const catalog = new MemoryFc26Catalog(resolveFc26Config({}));
const V3_PATH = resolve(import.meta.dirname, '../data/restore/super-league-auction-2026-v3.json');
const V3_ID = 'super-league-auction-2026-v3';
const OLD_ID = 'super-league-auction-2026';
const NAMES = ['Ritzz FC', 'SIDERALE', 'BGT', 'DDD', 'RedBull FC', 'Dakshineswar FC', 'Fidodido FC', 'APOLLO FC'];
const PURSES = [79.5, 44, 62, 63, 67, 42.5, 53, 13.5];
const SQUADS = [6, 10, 6, 10, 6, 15, 8, 14];
const SLOTS = [14, 10, 14, 10, 14, 5, 12, 6];
const RETAINED = [1, 2, 2, 0, 0, 1, 2, 2];
/** Position strips shown in the user's screenshots: GK / DEF / MID / ATT per team. */
const STRIPS = [[2, 3, 1, 0], [1, 3, 5, 1], [1, 1, 4, 0], [1, 3, 4, 2], [1, 1, 2, 2], [1, 5, 5, 4], [2, 3, 1, 2], [2, 5, 4, 3]];
const USERS = ['host', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'outsider'];
let fc26Players: Player[];
let preset: RestoreSnapshot;
let presetBytes: Buffer;
beforeAll(async () => {
  await catalog.importAll();
  fc26Players = await catalog.list();
  presetBytes = await readFile(V3_PATH);
  preset = restoreSnapshotSchema.parse(JSON.parse(presetBytes.toString('utf8')));
}, 120_000);
const apps: { close(): Promise<unknown> }[] = [];
afterEach(async () => { while (apps.length) await apps.pop()!.close(); });
async function setup(repository?: MemoryRoomRepository) {
  const clock = { value: 1_000_000, now() { return this.value; } };
  const built = await buildApp({ authService: new StaticTokenAuthService(new Map(USERS.map(u => [u, { userId: u, username: u + '-name' }]))),
    fc26: catalog, repository, clock, logger: false, timersEnabled: false });
  apps.push(built.app);
  const as = (user: string) => ({ authorization: `Bearer ${user}` });
  const templates = async () => (await built.app.inject({ url: '/api/restore/templates', headers: as('host') })).json().templates as { id: string; isDefault: boolean; playerCount: number; teamCount: number; snapshot: RestoreSnapshot }[];
  const createRoom = async (snapshot: RestoreSnapshot = preset) => {
    const res = await built.app.inject({ method: 'POST', url: '/api/restore/rooms', headers: as('host'),
      payload: { auctionName: 'Restored v3', snapshot, settings: { autoAdvance: false } } });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    const teams = body.restore.teams as { id: string; name: string; claimed: boolean }[];
    return { ...body, teams, teamId: (name: string) => teams.find(t => t.name === name)!.id as string };
  };
  const claimAll = async (roomCode: string, teams: { id: string; claimed: boolean }[]) => {
    const claimedBy: Record<string, string> = {};
    let next = 1;
    for (const t of teams) if (!t.claimed) {
      const user = `u${next++}`;
      const res = await built.app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/join`, headers: as(user), payload: { restoredTeamId: t.id } });
      expect(res.statusCode, res.body).toBe(200);
      claimedBy[t.id] = user;
    }
    return claimedBy;
  };
  const command = (roomCode: string, type: string, user = 'host', extra: Record<string, unknown> = {}) =>
    built.engine.execute(roomCode, user, { type, payload: { roomCode, ...extra } } as never);
  return { ...built, clock, as, templates, createRoom, claimAll, command, state: (code: string) => built.manager.loadRoom(code) };
}
const strip = (team: RestoreSnapshot['teams'][number]) => {
  const bucket = (pos: string) => pos === 'GK' ? 0 : ['CB', 'LB', 'RB'].includes(pos) ? 1 : ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(pos) ? 2 : 3;
  const out = [0, 0, 0, 0];
  for (const p of team.players) out[bucket(p.position)]!++;
  return out;
};
describe('v3 preset file', () => {
  it('is strict UTF-8 without BOM or replacement characters and keeps accented names', () => {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(presetBytes);
    expect(presetBytes[0]).not.toBe(0xef);
    expect(text).not.toContain('\uFFFD');
    for (const name of ['V. Gyökeres', 'H. Çalhanoğlu', 'M. Ødegaard', 'João Cancelo', 'Iñigo Martínez', 'Rúben Dias', 'Fabián Ruiz', 'P. Hincapié', 'Pau Cubarsí', 'Joan García', 'O. Dembélé', 'J. Koundé']) expect(text).toContain(name);
    expect(text).not.toMatch(/[ÃÂ][\u0080-\u00BF]/);
  });
  it('has the 8 teams with exact names, purses, squads, slots, retained counts and position strips', () => {
    expect(preset.teams.map(t => t.name)).toEqual(NAMES);
    expect(preset.hostTeam).toBe('Ritzz FC');
    expect(preset.teams.map(t => t.remainingPurseCr)).toEqual(PURSES);
    expect(preset.teams.map(t => t.squadSize)).toEqual(SQUADS);
    expect(preset.teams.map(t => 20 - t.squadSize)).toEqual(SLOTS);
    expect(preset.teams.map(t => t.retainedCount)).toEqual(RETAINED);
    expect(preset.teams.map(t => t.players.length)).toEqual(SQUADS);
    expect(preset.teams.map(strip)).toEqual(STRIPS);
    expect(PURSES.reduce((a, b) => a + b, 0)).toBe(424.5);
    const all = preset.teams.flatMap(t => t.players);
    expect(all).toHaveLength(75);
    expect(all.filter(p => p.acquisition === 'RETENTION')).toHaveLength(10);
    expect(all.filter(p => p.acquisition === 'AUCTION')).toHaveLength(65);
    expect(all.filter(p => p.acquisition === 'RETENTION').every(p => p.priceCr === 15)).toBe(true);
    expect(all.every(p => p.priceCr !== undefined)).toBe(true);
    expect(all.filter(p => p.underdog).map(p => p.name)).toEqual(['K. Mitoma', 'A. Semenyo', 'B. Kamara', 'Iñaki Williams', 'M. Rogers', 'I. Toney', 'K. Adeyemi', 'Joan García', 'M. Kudus', 'A. Laporte']);
  });
  it('records the screenshot auction prices and carries no formation or lineup data', () => {
    const price = (team: string, name: string) => preset.teams.find(t => t.name === team)!.players.find(p => p.name === name)!.priceCr;
    expect(price('Ritzz FC', 'G. Donnarumma')).toBe(5);
    expect(price('Ritzz FC', 'D. Dumfries')).toBe(5.5);
    expect(price('RedBull FC', 'L. Messi')).toBe(15);
    expect(price('BGT', 'Rodri')).toBe(12);
    expect(price('Dakshineswar FC', 'I. Toney')).toBe(1);
    expect(price('APOLLO FC', 'F. Dimarco')).toBe(11);
    expect(price('Fidodido FC', 'Nuno Mendes')).toBe(9.5);
    const text = presetBytes.toString('utf8').toLowerCase();
    for (const word of ['formation', 'lineup', 'startingxi', 'tactic', 'buildup', 'height', 'weight', 'age']) expect(text).not.toContain(`"${word}`);
  });
});
describe('v3 preset validation against the FC26 catalog', () => {
  it('matches all 75 players (nothing unmatched, nothing invented) with no blocking issue', async () => {
    const { preview } = validateSnapshot(preset, { fc26Players, defaultPool: await loadDefaultPoolPlayers() });
    expect(preview.canConfirm).toBe(true);
    expect(preview.totals).toMatchObject({ teams: 8, players: 75, retained: 10, auction: 65, matchedFc26: 75, matchedDefaultPool: 0, manual: 0, unresolved: 0 });
    expect(preview.teams.flatMap(t => t.players).filter(p => p.match.kind !== 'MATCHED_FC26').map(p => p.name)).toEqual([]);
    expect(preview.issues.filter(i => i.severity === 'CRITICAL')).toEqual([]);
    const codes = preview.issues.map(i => i.code);
    expect(codes).not.toContain('UNDERDOG_MISMATCH');
    expect(codes).not.toContain('POSITION_MISMATCH');
    expect(codes.filter(c => c === 'TEAM_VERIFY')).toHaveLength(3);
    expect(preview.teams.map(t => t.remainingSlots)).toEqual(SLOTS);
    expect(preview.teams.map(t => t.remainingPurseCr)).toEqual(PURSES);
    expect(preview.teams.flatMap(t => t.players.map(p => p.priceCr))).toHaveLength(75);
    const ids = preview.teams.flatMap(t => t.players.map(p => p.match.playerId));
    expect(new Set(ids).size).toBe(75);
    expect(preview.remainingPool.total).toBe(fc26Players.length - 75);
  });
  it('blocks bad data: duplicate player, wrong counts, oversize squad', async () => {
    const run = (mutate: (s: RestoreSnapshot) => void) => {
      const s = structuredClone(preset); mutate(s);
      return validateSnapshot(s, { fc26Players, defaultPool: [] }).preview.issues.filter(i => i.severity === 'CRITICAL').map(i => i.code);
    };
    expect(run(s => { s.teams[1]!.players.push(structuredClone(s.teams[0]!.players[0]!)); s.teams[1]!.squadSize++; })).toContain('DUPLICATE_PLAYER');
    expect(run(s => { s.teams[0]!.squadSize = 7; })).toContain('SQUAD_COUNT_MISMATCH');
    expect(run(s => { s.teams[0]!.retainedCount = 0; })).toContain('RETAINED_COUNT_MISMATCH');
    expect(run(s => { s.teams[0]!.auctionCount = 4; })).toContain('AUCTION_COUNT_MISMATCH');
    expect(run(s => { const t = s.teams[5]!; t.players.push(...s.teams[0]!.players.map(p => ({ ...p, name: p.name + ' ' }))); t.squadSize = t.players.length; })).toContain('SQUAD_TOO_LARGE');
  });
  it('rejects prices that are not 0.5 Cr steps and ignores a wrong retained price with a warning', () => {
    const bad = structuredClone(preset);
    bad.teams[0]!.players[1]!.priceCr = 5.25;
    expect(restoreSnapshotSchema.safeParse(bad).success).toBe(false);
    const odd = structuredClone(preset);
    odd.teams[0]!.players[0]!.priceCr = 10;
    const { preview } = validateSnapshot(odd, { fc26Players, defaultPool: [] });
    expect(preview.issues.map(i => i.code)).toContain('RETENTION_PRICE_IGNORED');
    expect(preview.teams[0]!.players[0]!.priceCr).toBe(15);
  });
});
describe('templates: default preset and the old template', () => {
  it('serves the v3 preset first and as default; the old 99-player template stays selectable and is not default', async () => {
    expect(DEFAULT_TEMPLATE_ID).toBe(V3_ID);
    const f = await setup();
    const list = await f.templates();
    expect(list.map(t => t.id)).toEqual([V3_ID, OLD_ID]);
    expect(list.map(t => t.isDefault)).toEqual([true, false]);
    expect(list[0]).toMatchObject({ teamCount: 8, playerCount: 75 });
    expect(list[1]).toMatchObject({ teamCount: 8, playerCount: 99 });
    expect(list[0]!.snapshot).toEqual(preset);
    const again = await f.templates();
    expect(again[0]!.snapshot).toEqual(list[0]!.snapshot);
    expect((await loadRestoreTemplates()).map(t => t.id)).toEqual([V3_ID, OLD_ID]);
  });
  it('previews the preset through the route, repeatedly, with identical results (idempotent load)', async () => {
    const f = await setup();
    const [first] = await f.templates();
    const run = async () => (await f.app.inject({ method: 'POST', url: '/api/restore/preview', headers: f.as('host'), payload: { snapshot: first!.snapshot } })).json().preview;
    const a = await run();
    const b = await run();
    expect(b).toEqual(a);
    expect(a.teams.map((t: { name: string }) => t.name)).toEqual(NAMES);
    expect(a.teams.map((t: { remainingPurseCr: number }) => t.remainingPurseCr)).toEqual(PURSES);
    expect(a.teams.map((t: { squadSize: number }) => t.squadSize)).toEqual(SQUADS);
    expect(a.teams.map((t: { remainingSlots: number }) => t.remainingSlots)).toEqual(SLOTS);
    expect(a.teams.map((t: { retainedCount: number }) => t.retainedCount)).toEqual(RETAINED);
    expect(a.totals).toMatchObject({ players: 75, retained: 10, auction: 65 });
  });
});
describe('room created from the v3 preset', () => {
  it('stores 75 SOLD players, exact purses, retained at 15 Cr and auction prices as recorded history only', async () => {
    const f = await setup();
    const created = await f.createRoom();
    expect(created.restore.source).toBe('TEMPLATE');
    const room = await f.state(created.roomCode);
    expect(room.teams.map(t => t.name)).toEqual(NAMES);
    expect(room.teams.map(t => t.startingBudgetUnits)).toEqual(PURSES.map(toUnits));
    expect(room.teams.map(t => t.spentUnits)).toEqual(new Array(8).fill(0));
    expect(room.teams.map(t => t.playerIds.length)).toEqual(SQUADS);
    expect(room.players).toHaveLength(75);
    expect(room.players.every(p => p.status === 'SOLD' && p.restoredFromSnapshot === true)).toBe(true);
    expect(room.purchases.every(p => p.priceUnits === 0)).toBe(true);
    const retained = room.purchases.filter(p => p.isRetained);
    expect(retained).toHaveLength(10);
    expect(retained.every(p => p.recordedPriceUnits === RETENTION_PRICE_UNITS)).toBe(true);
    const auction = room.purchases.filter(p => !p.isRetained);
    expect(auction).toHaveLength(65);
    const expected = preset.teams.flatMap(t => t.players).filter(p => p.acquisition === 'AUCTION').map(p => toUnits(p.priceCr!)).sort((a, b) => a - b);
    expect(auction.map(p => p.recordedPriceUnits).sort((a, b) => a! - b!)).toEqual(expected);
    // Purses stay authoritative: they are not derived from recorded prices.
    expect(room.teams.map(t => t.startingBudgetUnits - t.spentUnits)).toEqual(PURSES.map(toUnits));
    assertRoom(room);
    const state = roomState(room, 'host', 0);
    expect(state.soldPlayers.filter(p => !p.isRetained).every(p => typeof p.recordedPriceCr === 'number' && p.priceCr === null)).toBe(true);
    expect(state.soldPlayers.filter(p => p.isRetained).every(p => p.recordedPriceCr === 15)).toBe(true);
    expect(state.teams.map(t => t.remainingBudgetCr)).toEqual(PURSES);
    expect(state.teams.map(t => t.remainingSlots)).toEqual(SLOTS);
  });
  it('excludes all 75 owned players from the pool and queue; a purchase deducts from the restored purse; the template is unchanged', async () => {
    const f = await setup();
    const hashBefore = createHash('sha256').update(presetBytes).digest('hex');
    const created = await f.createRoom();
    const claimedBy = await f.claimAll(created.roomCode, created.teams);
    await f.command(created.roomCode, 'START_AUCTION');
    let room = await f.state(created.roomCode);
    const owned = new Set(room.teams.flatMap(t => t.playerIds));
    expect(owned.size).toBe(75);
    expect(room.players).toHaveLength(fc26Players.length);
    expect(room.players.filter(p => p.status === 'SOLD')).toHaveLength(75);
    expect(room.playerQueue.some(id => owned.has(id))).toBe(false);
    expect(owned.has(room.active!.playerId)).toBe(false);
    expect(room.status).toBe('RUNNING');
    const base = room.players.find(p => p.id === room.active!.playerId)!.basePriceUnits / 2;
    const bgt = created.teamId('BGT');
    await f.command(created.roomCode, 'PLACE_BID', claimedBy[bgt]!, { amountCr: base });
    f.clock.value = room.active!.endsAt;
    await f.engine.onTimer(created.roomCode, (await f.state(created.roomCode)).active!.activationId);
    room = await f.state(created.roomCode);
    const team = room.teams.find(t => t.id === bgt)!;
    expect(team.playerIds).toHaveLength(7);
    expect(team.spentUnits).toBe(base * 2);
    const state = roomState(room, 'host', 0);
    expect(state.teams.find(t => t.id === bgt)).toMatchObject({ remainingBudgetCr: 62 - base, remainingSlots: 13, playersOwned: 7 });
    expect(state.soldPlayers.filter(p => !p.restoredFromSnapshot)).toHaveLength(1);
    expect(state.soldPlayers.find(p => !p.restoredFromSnapshot)!.priceCr).toBe(base);
    expect(state.soldPlayers.filter(p => p.restoredFromSnapshot)).toHaveLength(75);
    expect(room.purchases.filter(p => p.restoredFromSnapshot && !p.isRetained).map(p => p.recordedPriceUnits).filter(v => v == null)).toEqual([]);
    assertRoom(room);
    // The preset file, the served template and the recorded snapshot hash did not change.
    expect(createHash('sha256').update(await readFile(V3_PATH)).digest('hex')).toBe(hashBefore);
    expect((await f.templates())[0]!.snapshot).toEqual(preset);
    const unchanged = validateSnapshot(preset, { fc26Players, defaultPool: [] }).preview;
    expect(unchanged.teams.map(t => t.remainingPurseCr)).toEqual(PURSES);
    expect(unchanged.teams.map(t => t.squadSize)).toEqual(SQUADS);
  });
  it('survives a server restart with purses, squads and recorded prices intact', async () => {
    const repository = new MemoryRoomRepository();
    const f = await setup(repository);
    const created = await f.createRoom();
    const restarted = new RoomManager(repository, new CatalogPlayerRepository(demoPlayers.slice(0, 2)), f.clock, undefined, undefined, catalog);
    await restarted.recover();
    const after = await restarted.loadRoom(created.roomCode);
    expect(after.teams.map(t => t.name)).toEqual(NAMES);
    expect(after.teams.map(t => t.startingBudgetUnits - t.spentUnits)).toEqual(PURSES.map(toUnits));
    expect(after.teams.map(t => t.playerIds.length)).toEqual(SQUADS);
    expect(after.purchases.filter(p => !p.isRetained).every(p => p.recordedPriceUnits != null && p.recordedPriceUnits > 0)).toBe(true);
    assertRoom(after);
  });
  it('archives the recorded price (not a placeholder) for restored purchases', async () => {
    const f = await setup();
    const created = await f.createRoom();
    await f.claimAll(created.roomCode, created.teams);
    await f.command(created.roomCode, 'START_AUCTION');
    await f.command(created.roomCode, 'END_AUCTION');
    const room = await f.state(created.roomCode);
    expect(room.status).toBe('COMPLETED');
    const rows = buildArchiveRows(room, new Map(room.players.map(p => [p.id, 'db-' + p.id])));
    const byPlayer = new Map(room.purchases.map(p => [p.playerId, p]));
    const restoredRows = rows.filter(r => byPlayer.get(r.player_id.replace('db-', ''))?.restoredFromSnapshot);
    expect(restoredRows).toHaveLength(75);
    for (const row of restoredRows) {
      const purchase = byPlayer.get(row.player_id.replace('db-', ''))!;
      expect(row.final_price_units).toBe(purchase.recordedPriceUnits);
    }
  });
});
