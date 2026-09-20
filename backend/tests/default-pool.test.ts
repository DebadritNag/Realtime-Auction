import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  CatalogPlayerRepository,
  parseCsv,
  csvRowToPlayer,
} from '../src/modules/players/player.service.js';
import { toCr } from '../src/domain/money.js';

const defaultPoolDir = fileURLToPath(new URL('../data/default-pool', import.meta.url));

describe('Bundled player catalog and legacy category pools', () => {
  it('has all required CSV files with exact player quotas', async () => {
    const files = [
      { name: 'gk.csv', expectedCount: 24, expectedGroup: 'GK' },
      { name: 'def.csv', expectedCount: 84, expectedGroup: 'DEF' },
      { name: 'mid.csv', expectedCount: 84, expectedGroup: 'MID' },
      { name: 'att.csv', expectedCount: 96, expectedGroup: 'ATT' },
    ];

    const allPids = new Set<string>();

    for (const f of files) {
      const content = await readFile(join(defaultPoolDir, f.name), 'utf8');
      const rows = parseCsv(content);
      expect(rows).toHaveLength(f.expectedCount);

      // Verify every player belongs to the category and has a unique ID
      for (const row of rows) {
        expect(row.auction_group).toBe(f.expectedGroup);
        const pid = row.player_id ?? '';
        expect(allPids.has(pid)).toBe(false);
        allPids.add(pid);
      }
    }

    // The combined catalog was expanded; category files remain a smaller fallback.
    const combinedContent = await readFile(join(defaultPoolDir, 'default-player-pool.csv'), 'utf8');
    const combinedRows = parseCsv(combinedContent);
    expect(combinedRows).toHaveLength(760);
    expect(new Set(combinedRows.map(r => r.player_id)).size).toBe(combinedRows.length);
  });

  it('preserves descending OVR and ascending name sorting in every file', async () => {
    const filenames = ['gk.csv', 'def.csv', 'mid.csv', 'att.csv'];

    for (const fn of filenames) {
      const content = await readFile(join(defaultPoolDir, fn), 'utf8');
      const rows = parseCsv(content);

      for (let i = 0; i < rows.length - 1; i++) {
        const currOvr = parseInt(rows[i]!.overall ?? '', 10);
        const nextOvr = parseInt(rows[i + 1]!.overall ?? '', 10);
        const currName = rows[i]!.name ?? '';
        const nextName = rows[i + 1]!.name ?? '';

        if (currOvr === nextOvr) {
          expect(currName <= nextName).toBe(true);
        } else {
          expect(currOvr).toBeGreaterThan(nextOvr);
        }
      }
    }
  });

  it('preserves prices and tiers from the expanded CSV rather than substituting old defaults', async () => {
    const rows = parseCsv(await readFile(join(defaultPoolDir, 'default-player-pool.csv'), 'utf8'));
    for (const row of rows) {
      const player = csvRowToPlayer(row);
      expect(toCr(player.basePriceUnits)).toBe(Number(row.base_price_cr));
      expect(player.ratingTier).toBe(row.rating_tier);
      expect(player.ovr).toBe(Number(row.overall));
      expect(player.basePriceUnits).toBeGreaterThan(0);
      expect(Number.isInteger(player.basePriceUnits)).toBe(true);
    }
  });

  it('maintains positional balance across defense, midfield, and attack', async () => {
    // Defense: CB: 50, LB: 14, RB: 14, LWB: 3, RWB: 3
    const defRows = parseCsv(await readFile(join(defaultPoolDir, 'def.csv'), 'utf8'));
    const defPositions = defRows.map(r => r.position ?? '');
    const cbCount = defPositions.filter(p => p === 'CB').length;
    const fullBackCount = defPositions.filter(p => ['LB', 'RB', 'LWB', 'RWB'].includes(p)).length;
    expect(cbCount).toBe(50);
    expect(fullBackCount).toBe(34);

    // Midfield: CM: 30, CDM: 24, CAM: 14, RM: 8, LM: 8
    const midRows = parseCsv(await readFile(join(defaultPoolDir, 'mid.csv'), 'utf8'));
    const midPositions = midRows.map(r => r.position);
    expect(midPositions.filter(p => p === 'CDM').length).toBe(24);
    expect(midPositions.filter(p => p === 'CM').length).toBe(30);
    expect(midPositions.filter(p => p === 'CAM').length).toBe(14);
    expect(midPositions.filter(p => p === 'LM').length).toBe(8);
    expect(midPositions.filter(p => p === 'RM').length).toBe(8);

    // Attack: ST: 48, CF: 8, LW: 20, RW: 20
    const attRows = parseCsv(await readFile(join(defaultPoolDir, 'att.csv'), 'utf8'));
    const attPositions = attRows.map(r => r.position);
    expect(attPositions.filter(p => p === 'ST').length).toBe(48);
    expect(attPositions.filter(p => p === 'CF').length).toBe(8);
    expect(attPositions.filter(p => p === 'LW').length).toBe(20);
    expect(attPositions.filter(p => p === 'RW').length).toBe(20);
  });

  it('loads into CatalogPlayerRepository and maps to domain Player models', async () => {
    const repo = await CatalogPlayerRepository.fromDefaultPool(defaultPoolDir);
    const pool = await repo.listPlayerPool({});
    expect(pool).toHaveLength(760);

    const mbappe = await repo.getPlayer('231747');
    expect(mbappe).not.toBeNull();
    expect(mbappe?.name).toBe('K. Mbappé');
    expect(mbappe?.ovr).toBe(91);
    expect(mbappe?.position).toBe('FWD');
    expect(mbappe?.potId).toBe('ATT');
    expect(toCr(mbappe!.basePriceUnits)).toBe(15);
    expect(mbappe?.stats.pac).toBe(97);
    expect(mbappe?.stats.sho).toBe(90);

    const courtois = await repo.getPlayer('192119');
    expect(courtois).not.toBeNull();
    expect(courtois?.name).toBe('T. Courtois');
    expect(courtois?.ovr).toBe(90);
    expect(courtois?.position).toBe('GK');
    expect(courtois?.potId).toBe('GK');
    expect(toCr(courtois!.basePriceUnits)).toBe(15);
  });

  it('scales player pool intelligently based on team count with ~20% buffer', async () => {
    const repo = await CatalogPlayerRepository.fromDefaultPool(defaultPoolDir);

    // 6 Teams:
    // GK  = ceil(6 * 2 * 1.2) = 15
    // DEF = ceil(6 * 7 * 1.2) = 51
    // MID = ceil(6 * 7 * 1.2) = 51
    // ATT = ceil(6 * 8 * 1.2) = 58
    // Total = 175
    const pool6 = await repo.listPlayerPool({}, 6);
    expect(pool6).toHaveLength(175);

    const gk6 = pool6.filter(p => p.potId === 'GK');
    const def6 = pool6.filter(p => p.potId === 'DEF');
    const mid6 = pool6.filter(p => p.potId === 'MID');
    const att6 = pool6.filter(p => p.potId === 'ATT');

    expect(gk6).toHaveLength(15);
    expect(def6).toHaveLength(51);
    expect(mid6).toHaveLength(51);
    expect(att6).toHaveLength(58);

    // 10 Teams: returns the complete expanded catalog
    const pool10 = await repo.listPlayerPool({}, 10);
    expect(pool10).toHaveLength(760);
  });
});
