import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Player } from '../../domain/types.js';
import type { PlayerRepository } from '../../repositories/interfaces.js';
import type { RoomSettings } from '../../schemas/settings.js';
import { toUnits } from '../../domain/money.js';

export const playerSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  position: z.enum(['GK', 'DEF', 'MID', 'FWD', 'ATT']),
  ovr: z.number().int().min(1).max(99),
  stats: z.record(z.number().finite().min(0).max(100)),
  basePriceUnits: z.number().int().min(1).max(2_000_000),
  potId: z.string().min(1).max(100),
  club: z.string().optional(),
  nationality: z.string().optional(),
  age: z.number().int().optional(),
  preferredFoot: z.string().optional(),
  photoUrl: z.string().optional(),
  subPosition: z.string().optional(),
  secondaryPositions: z.string().optional(),
  league: z.string().optional(),
  ratingTier: z.string().optional(),
});

/** Parse RFC-4180 CSV text into record objects. */
export function parseCsv(content: string): Record<string, string>[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        // Skip CR, line ending handled on LF
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) return [];
  const headers = rows[0]!.map(h => h.trim());
  return rows.slice(1).map(row => {
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = row[idx] ?? '';
    });
    return record;
  });
}

/** Convert a parsed CSV row into domain Player. */
export function csvRowToPlayer(row: Record<string, string>): Player {
  const auctionGroup = (row.auction_group || row.position || 'MID').toUpperCase();
  const position: Player['position'] =
    auctionGroup === 'ATT' ? 'FWD' :
    auctionGroup === 'GK' || auctionGroup === 'DEF' || auctionGroup === 'MID' ? auctionGroup : 'FWD';

  const ovr = parseInt(row.overall ?? '', 10) || 75;
  const basePriceCr = parseFloat(row.base_price_cr ?? '') || (ovr >= 90 ? 5 : ovr >= 87 ? 4 : ovr >= 84 ? 3 : ovr >= 81 ? 2 : 1);
  const basePriceUnits = toUnits(basePriceCr);

  const stats: Record<string, number> = {};
  const statMappings: [string, string][] = [
    ['pac', 'pace'],
    ['sho', 'shooting'],
    ['pas', 'passing'],
    ['dri', 'dribbling'],
    ['def', 'defending'],
    ['phy', 'physical'],
  ];

  for (const [shortKey, longKey] of statMappings) {
    const val = row[longKey] || row[shortKey];
    if (val !== undefined && val !== '' && !isNaN(Number(val))) {
      const num = Number(val);
      stats[shortKey] = num;
      stats[longKey] = num;
    }
  }

  return {
    id: row.player_id ?? '',
    name: row.name ?? '',
    position,
    ovr,
    stats,
    basePriceUnits,
    potId: row.auction_group || position,
    club: row.club || undefined,
    nationality: row.nationality || undefined,
    age: row.age ? parseInt(row.age, 10) : undefined,
    preferredFoot: row.preferred_foot || undefined,
    photoUrl: row.image_url || undefined,
    subPosition: row.position || undefined,
    secondaryPositions: row.secondary_positions || undefined,
    league: row.league || undefined,
    ratingTier: row.rating_tier || undefined,
  };
}

export class CatalogPlayerRepository implements PlayerRepository {
  private readonly players: Player[];

  constructor(players: Player[]) {
    this.players = z.array(playerSchema).max(2000).parse(players);
    if (new Set(players.map(p => p.id)).size !== players.length) throw new Error('Duplicate player IDs');
  }

  static async fromFile(path: string): Promise<CatalogPlayerRepository> {
    if (path.endsWith('.csv')) {
      return this.fromCsvFile(path);
    }
    return new CatalogPlayerRepository(JSON.parse(await readFile(path, 'utf8')) as Player[]);
  }

  static async fromCsvFile(path: string): Promise<CatalogPlayerRepository> {
    const content = await readFile(path, 'utf8');
    const records = parseCsv(content);
    const players = records.map(csvRowToPlayer);
    return new CatalogPlayerRepository(players);
  }

  static async fromDefaultPool(dirPath?: string): Promise<CatalogPlayerRepository> {
    const poolDir = dirPath ?? fileURLToPath(new URL('../../../data/default-pool', import.meta.url));
    const combinedPath = join(poolDir, 'default-player-pool.csv');

    try {
      return await CatalogPlayerRepository.fromCsvFile(combinedPath);
    } catch {
      // Alternative fallback: load individual category CSVs
      const files = ['gk.csv', 'def.csv', 'mid.csv', 'att.csv'];
      const players: Player[] = [];
      for (const f of files) {
        const content = await readFile(join(poolDir, f), 'utf8');
        players.push(...parseCsv(content).map(csvRowToPlayer));
      }
      return new CatalogPlayerRepository(players);
    }
  }

  async getPlayer(id: string): Promise<Player | null> {
    return structuredClone(this.players.find(p => p.id === id) ?? null);
  }

  async listPlayerPool(config: RoomSettings['playerPoolConfig'], teamCount?: number): Promise<Player[]> {
    if (config.playerIds && config.playerIds.length > 0) {
      return structuredClone(
        this.players.filter(p => config.playerIds!.includes(p.id) && (!config.potIds || config.potIds.includes(p.potId)))
      );
    }

    const candidatePool = this.players.filter(p => !config.potIds || config.potIds.includes(p.potId));

    // Team-count aware scaling for full catalog (supporting up to 10 teams with ~20% buffer)
    if (this.players.length >= 200 && teamCount && teamCount < 10) {
      const targetGk = Math.min(24, Math.ceil(teamCount * 2 * 1.2));
      const targetDef = Math.min(84, Math.ceil(teamCount * 7 * 1.2));
      const targetMid = Math.min(84, Math.ceil(teamCount * 7 * 1.2));
      const targetAtt = Math.min(96, Math.ceil(teamCount * 8 * 1.2));

      const gks = candidatePool.filter(p => p.potId === 'GK' || p.position === 'GK').slice(0, targetGk);
      const defs = candidatePool.filter(p => p.potId === 'DEF' || p.position === 'DEF').slice(0, targetDef);
      const mids = candidatePool.filter(p => p.potId === 'MID' || p.position === 'MID').slice(0, targetMid);
      const atts = candidatePool.filter(p => p.potId === 'ATT' || p.position === 'FWD' || p.position === 'ATT').slice(0, targetAtt);

      if (gks.length || defs.length || mids.length || atts.length) {
        const selectedIds = new Set([...gks, ...defs, ...mids, ...atts].map(p => p.id));
        return structuredClone(candidatePool.filter(p => selectedIds.has(p.id)));
      }
    }

    return structuredClone(candidatePool);
  }

  async getPlayersByPot(potId: string): Promise<Player[]> {
    return this.listPlayerPool({ potIds: [potId] });
  }
}

/** Fictional demo catalog fallback if neither default-pool nor PLAYER_CATALOG_PATH are present. */
export const demoPlayers: Player[] = Array.from({ length: 80 }, (_, i) => ({
  id: `demo-${i + 1}`,
  name: `Demo Footballer ${i + 1}`,
  position: (['GK', 'DEF', 'MID', 'FWD'] as const)[i % 4]!,
  ovr: 70 + i % 25,
  stats: { pac: 65 + i % 30, pace: 65 + i % 30, pas: 60 + i % 35, passing: 60 + i % 35 },
  basePriceUnits: 2,
  potId: `pot-${Math.floor(i / 20) + 1}`,
}));
