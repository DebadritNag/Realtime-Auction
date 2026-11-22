import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryFc26Catalog } from '../src/modules/fc26/fc26.catalog.js';
import { defaultFc26Dir, resolveFc26Config } from '../src/modules/fc26/fc26.config.js';
import { assignPot, broadPosition, matchesPositionGroup } from '../src/modules/fc26/fc26.positions.js';
import { publicPlayer } from '../src/modules/teams/team.service.js';
import { fixture } from './helpers.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures/fc26');
const catalog = (env: Parameters<typeof resolveFc26Config>[0] = {}, read?: (path: string) => Promise<string>) =>
  new MemoryFc26Catalog(resolveFc26Config({ FC26_DATA_DIR: FIXTURES, ...env }), read);
const byId = async (c: MemoryFc26Catalog, id: string) => (await c.get(id))!;

describe('FC26 importer', () => {
  it('uses short_name as the display name and keeps long_name as fullName, falling back when short_name is empty', async () => {
    const csv = 'player_id,short_name,long_name,player_positions,overall\n9001,K. Short,Kylian Long Name,CM,80\n9002,,Only Long,CM,81\n';
    const c = catalog({}, async p => (p.endsWith('FC26_Mid.csv') ? csv : Promise.reject(Object.assign(new Error('x'), { code: 'ENOENT' }))));
    await c.importAll();
    expect(await byId(c, '9001')).toMatchObject({ name: 'K. Short', fullName: 'Kylian Long Name' });
    expect(await byId(c, '9002')).toMatchObject({ name: 'Only Long', fullName: 'Only Long' });
    expect((await c.search({ query: 'kylian long' })).players.map(p => p.id)).toEqual(['9001']);
    expect((await c.search({ query: 'k. short' })).players.map(p => p.id)).toEqual(['9001']);
  });
  it('re-import refreshes a stale long display name from the CSV short_name', async () => {
    let csv = 'player_id,short_name,long_name,player_positions,overall\n9001,Kylian Long Name,Kylian Long Name,CM,80\n';
    const c = catalog({}, async p => (p.endsWith('FC26_Mid.csv') ? csv : Promise.reject(Object.assign(new Error('x'), { code: 'ENOENT' }))));
    await c.importAll();
    csv = 'player_id,short_name,long_name,player_positions,overall\n9001,K. Short,Kylian Long Name,CM,80\n';
    expect((await c.importAll()).imported).toBe(0);
    expect(await byId(c, '9001')).toMatchObject({ name: 'K. Short', fullName: 'Kylian Long Name' });
  });
  it.runIf(existsSync(resolve(defaultFc26Dir(), 'FC26_Mid.csv')))('shows the real CSV short_name for known players through the public DTO', async () => {
    const c = new MemoryFc26Catalog(resolveFc26Config({}));
    await c.importAll();
    const dto = (id: string) => byId(c, id).then(publicPlayer);
    expect(await dto('277643')).toMatchObject({ name: 'Lamine Yamal', fullName: expect.stringContaining('Lamine Yamal Nasraoui Ebana') });
    expect(await dto('231747')).toMatchObject({ name: 'K. Mbappé', fullName: 'Kylian Mbappé Lottin' });
    expect(await dto('255253')).toMatchObject({ name: 'Vitinha', fullName: 'Vítor Machado Ferreira' });
    expect(await dto('231866')).toMatchObject({ name: 'Rodri', fullName: 'Rodrigo Hernández Cascante' });
    expect(await dto('232580')).toMatchObject({ name: 'Gabriel', fullName: 'Gabriel dos Santos Magalhães' });
    expect((await c.search({ query: 'nasraoui' })).players.map(p => p.name)).toEqual(['Lamine Yamal']);
  });
  it('imports all six files and reports counts', async () => {
    const c = catalog();
    const report = await c.importAll();
    expect(report.filesRead).toBe(6);
    expect(report.missingFiles).toEqual([]);
    expect(report.rowsRead).toBe(18);
    expect(report.imported).toBe(14);
    expect(report.skippedDuplicates).toBe(3);
    expect(report.underdogImported).toBe(4);
    expect(report.invalidRows).toEqual([{ file: 'FC26_ATT.csv', row: 5, reason: expect.any(String) }]);
    expect(report.perFile.GK).toMatchObject({ rows: 2, imported: 2, status: 'READ' });
    expect(report.perFile.UNDERDOG).toMatchObject({ rows: 4, imported: 4 });
    expect((await c.stats()).total).toBe(14);
  });

  it('skips every row on a second import', async () => {
    const c = catalog();
    await c.importAll();
    const again = await c.importAll();
    expect(again.imported).toBe(0);
    expect(again.skippedDuplicates).toBe(17);
    expect((await c.stats()).total).toBe(14);
  });

  it('stores draft_pool and player_tag for Underdogs only, and the Underdog row wins duplicates', async () => {
    const c = catalog();
    await c.importAll();
    const underdog = await byId(c, '6001');
    expect(underdog).toMatchObject({ draftPool: 'UNDERDOG', playerTag: 'UNDERDOG', sourceCategory: 'UNDERDOG' });
    const regular = await byId(c, '2001');
    expect(regular.draftPool).toBe('REGULAR');
    expect(regular.playerTag).toBeUndefined();
    expect(await byId(c, '9001')).toMatchObject({ draftPool: 'UNDERDOG', playerTag: 'UNDERDOG', ovr: 82, sourceCategories: ['CB', 'UNDERDOG'] });
    expect(publicPlayer(underdog)).toMatchObject({ playerTag: 'UNDERDOG', basePriceCr: 1 });
  });

  it('assigns pots, keeping Underdogs in the same position-based pots', async () => {
    const c = catalog();
    await c.importAll();
    const pots = Object.fromEntries((await c.list()).map(p => [p.id, p.potId]));
    expect(pots).toMatchObject({ '1001': 'GK', '2001': 'CB', '2002': 'CB', '3001': 'FB', '4001': 'MID', '4002': 'MID', '4003': 'MID', '5001': 'ATT', '5002': 'ATT',
      '6001': 'GK', '6002': 'FB', '6003': 'MID', '9001': 'CB' });
    expect(Object.keys((await c.stats()).byPot).sort()).toEqual(['ATT', 'CB', 'FB', 'GK', 'MID']);
  });

  it('keeps primary and secondary positions and the original fields', async () => {
    const c = catalog();
    await c.importAll();
    const player = await byId(c, '4002');
    expect(player).toMatchObject({ id: '4002', name: 'M. Two', fullName: 'Mid Two', position: 'MID', subPosition: 'CAM', secondaryPositions: 'ST',
      positions: ['CAM', 'ST'], ovr: 90, potential: 92, nationality: 'Argentina', club: 'Delta FC', photoUrl: 'https://cdn.example.com/4002.png' });
    expect(player.stats).toMatchObject({ pace: 70, physical: 70 });
    expect((await byId(c, '1001')).stats).toEqual({});
    const found = await c.search({ group: 'ST' });
    expect(found.players.map(p => p.id)).toContain('4002');
  });

  it('maps positions to pots and groups', () => {
    expect(assignPot('LB', ['FB'])).toEqual({ pot: 'FB', sourceCategory: 'FB' });
    expect(assignPot('CB', ['FB', 'CB'])).toEqual({ pot: 'CB', sourceCategory: 'CB' });
    expect(assignPot('LW', ['MID', 'ATT'])).toEqual({ pot: 'ATT', sourceCategory: 'ATT' });
    expect(assignPot('ST', ['MID', 'FB'])).toEqual({ pot: 'FB', sourceCategory: 'FB' });
    expect(assignPot('CM', ['ATT', 'UNDERDOG'])).toEqual({ pot: 'MID', sourceCategory: 'UNDERDOG' });
    expect(['GK', 'CB', 'RWB', 'CDM', 'LM', 'CF', 'RF'].map(broadPosition)).toEqual(['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD']);
    expect(matchesPositionGroup(['CAM', 'ST'], 'ST')).toBe(true);
    expect(matchesPositionGroup(['CAM', 'ST'], 'GK')).toBe(false);
    expect(matchesPositionGroup(['LB'], 'FB')).toBe(true);
  });

  it('prices players 1/3/5 Cr, including a 90+ Underdog at 1 Cr, and honours a threshold override', async () => {
    const c = catalog();
    await c.importAll();
    expect(await byId(c, '6003')).toMatchObject({ ovr: 91, basePriceUnits: 2 });
    expect((await byId(c, '5001')).basePriceUnits).toBe(10);
    expect((await byId(c, '4002')).basePriceUnits).toBe(10);
    expect((await byId(c, '2001')).basePriceUnits).toBe(6);
    const strict = catalog({ FC26_TOP_RATING_THRESHOLD: 92 });
    await strict.importAll();
    expect((await byId(strict, '5001')).basePriceUnits).toBe(6);
  });

  it('searches by name, club, nationality, id and position, combined with filters', async () => {
    const c = catalog();
    await c.importAll();
    const ids = async (q: Parameters<typeof c.search>[0]) => (await c.search(q)).players.map(p => p.id);
    expect(await ids({ query: 'keeper' })).toEqual(['1001', '1002']);
    expect(await ids({ query: 'delta' })).toEqual(['4002', '4003']);
    expect(await ids({ query: 'argentina' })).toEqual(['4002']);
    expect(await ids({ query: '5002' })).toEqual(['5002']);
    expect(await ids({ query: 'alpha gk' })).toEqual(['1001']);
    expect(await ids({ query: 'alpha', group: 'ST' })).toEqual(['5001']);
    expect(await ids({ group: 'GK', excludeIds: ['1001'] })).toEqual(['1002', '6001']);
    expect((await c.search({ limit: 3 })).players.map(p => p.ovr)).toEqual([91, 91, 90]);
  });

  it('reports missing files without throwing', async () => {
    const c = new MemoryFc26Catalog(resolveFc26Config({ FC26_DATA_DIR: resolve(FIXTURES, 'does-not-exist') }));
    const report = await c.importAll();
    expect(report.filesRead).toBe(0);
    expect(report.missingFiles).toHaveLength(6);
    expect(report.imported).toBe(0);
    expect(report.perFile.GK.status).toBe('MISSING');
  });

  it('reports malformed files and invalid rows while importing the rest', async () => {
    const real = (path: string) => import('node:fs/promises').then(fs => fs.readFile(path, 'utf8'));
    const c = catalog({}, async path => path.endsWith('FC26_GK.csv') ? 'foo,bar\n1,2\n' : path.endsWith('FC26_Mid.csv') ? '' : real(path));
    const report = await c.importAll();
    expect(report.perFile.GK).toMatchObject({ status: 'INVALID', message: expect.stringContaining('player_id') });
    expect(report.perFile.MID.status).toBe('INVALID');
    expect(report.filesRead).toBe(4);
    expect(report.imported).toBeGreaterThan(0);
    expect(report.invalidRows).toHaveLength(1);
  });

  it('does not accept client paths: configuration comes from the environment only', () => {
    const config = resolveFc26Config({ FC26_DATA_DIR: FIXTURES, FC26_CSV_GK: 'custom-gk.csv', FC26_CSV_ATT: resolve(FIXTURES, 'FC26_ATT.csv') });
    expect(config.files.find(f => f.source === 'GK')!.path).toBe(resolve(FIXTURES, 'custom-gk.csv'));
    expect(config.files.find(f => f.source === 'ATT')!.path).toBe(resolve(FIXTURES, 'FC26_ATT.csv'));
  });

  it('accepts both FC26_Underdog.csv and FC26_Underdogs.csv', () => {
    const singular = resolveFc26Config({ FC26_DATA_DIR: '/data' }, p => p.endsWith('FC26_Underdog.csv'));
    expect(singular.files.find(f => f.source === 'UNDERDOG')!.name).toBe('FC26_Underdog.csv');
    const plural = resolveFc26Config({ FC26_DATA_DIR: '/data' }, p => p.endsWith('FC26_Underdogs.csv'));
    expect(plural.files.find(f => f.source === 'UNDERDOG')!.name).toBe('FC26_Underdogs.csv');
  });
});

describe('FC26 real CSV files', () => {
  const present = existsSync(resolve(defaultFc26Dir(), 'FC26_GK.csv')) && existsSync(resolve(defaultFc26Dir(), 'FC26_Underdogs.csv'));
  it.skipIf(!present)('imports 207 unique players from 251 rows, then none on re-import', async () => {
    const c = new MemoryFc26Catalog(resolveFc26Config({}));
    const report = await c.importAll();
    expect(report).toMatchObject({ filesRead: 6, rowsRead: 251, imported: 207, skippedDuplicates: 44, underdogImported: 31, missingFiles: [] });
    expect(report.invalidRows).toEqual([]);
    const players = await c.list();
    expect(players.filter(p => p.draftPool === 'UNDERDOG' && p.playerTag === 'UNDERDOG' && p.basePriceUnits === 2)).toHaveLength(31);
    const openda = players.find(p => p.id === '243580');
    expect(openda).toMatchObject({ name: 'L. Openda', draftPool: 'UNDERDOG', playerTag: 'UNDERDOG', basePriceUnits: 2, potId: 'ATT' });
    expect(players.filter(p => p.draftPool === 'REGULAR').every(p => p.basePriceUnits === (p.ovr >= 90 ? 10 : 6))).toBe(true);
    expect(players.every(p => ['GK', 'CB', 'FB', 'MID', 'ATT'].includes(p.potId))).toBe(true);
    expect((await c.importAll()).imported).toBe(0);
  });
});

describe('FC26 auction pool', () => {
  it('starts an FC26 room with Underdogs in the regular pots and server-side prices', async () => {
    const c = catalog();
    await c.importAll();
    const t = await fixture({ playerPoolSource: 'FC26', minimumBasePriceCr: 5 }, undefined, 2, c);
    expect((await t.state()).settings.minimumBasePriceCr).toBe(1);
    await t.command('START_AUCTION');
    const room = await t.state();
    expect(room.players).toHaveLength(14);
    const pots = new Set(room.players.map(p => p.potId));
    expect([...pots].sort()).toEqual(['ATT', 'CB', 'FB', 'GK', 'MID']);
    const price = (id: string) => publicPlayer(room.players.find(p => p.id === id)!).basePriceCr;
    expect([price('6003'), price('5001'), price('2001'), price('6001')]).toEqual([1, 5, 3, 1]);
    expect(room.players.find(p => p.id === '6002')).toMatchObject({ potId: 'FB', playerTag: 'UNDERDOG' });
    expect(room.players.find(p => p.id === '2001')!.playerTag).toBeUndefined();
  });

  it('rejects the FC26 source when no catalog is loaded', async () => {
    await expect(fixture({ playerPoolSource: 'FC26' })).rejects.toMatchObject({ code: 'FC26_CATALOG_EMPTY' });
    const empty = catalog();
    await expect(fixture({ playerPoolSource: 'FC26' }, undefined, 2, empty)).rejects.toMatchObject({ code: 'FC26_CATALOG_EMPTY' });
  });

  it('leaves default rooms unchanged', async () => {
    const t = await fixture({}, undefined, 2);
    expect((await t.state()).settings).toMatchObject({ playerPoolSource: 'DEFAULT', retention: { enabled: false } });
    await t.command('START_AUCTION');
    expect((await t.state()).players.every(p => p.draftPool === undefined)).toBe(true);
  });
});
