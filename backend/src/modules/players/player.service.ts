import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import type { Player } from '../../domain/types.js';
import type { PlayerRepository } from '../../repositories/interfaces.js';
import type { RoomSettings } from '../../schemas/settings.js';
export const playerSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().min(1).max(100),
  position: z.enum(['GK', 'DEF', 'MID', 'FWD']), ovr: z.number().int().min(1).max(99),
  stats: z.record(z.number().finite().min(0).max(100)),
  basePriceUnits: z.number().int().min(1).max(2_000_000), potId: z.string().min(1).max(100),
}).strict();
export class CatalogPlayerRepository implements PlayerRepository {
  private readonly players: Player[];
  constructor(players: Player[]) {
    this.players = z.array(playerSchema).max(2000).parse(players);
    if (new Set(players.map(p => p.id)).size !== players.length) throw new Error('Duplicate player IDs');
  }
  static async fromFile(path: string): Promise<CatalogPlayerRepository> {
    return new CatalogPlayerRepository(JSON.parse(await readFile(path, 'utf8')) as Player[]);
  }
  async getPlayer(id: string): Promise<Player | null> { return structuredClone(this.players.find(p => p.id === id) ?? null); }
  async listPlayerPool(config: RoomSettings['playerPoolConfig']): Promise<Player[]> {
    return structuredClone(this.players.filter(p => (!config.playerIds || config.playerIds.includes(p.id)) && (!config.potIds || config.potIds.includes(p.potId))));
  }
  async getPlayersByPot(potId: string): Promise<Player[]> { return this.listPlayerPool({ potIds: [potId] }); }
}
/** Fictional demo catalog, replace via PLAYER_CATALOG_PATH or injected repository. */
export const demoPlayers: Player[] = Array.from({ length: 80 }, (_, i) => ({
  id: `demo-${i + 1}`, name: `Demo Footballer ${i + 1}`,
  position: (['GK', 'DEF', 'MID', 'FWD'] as const)[i % 4]!,
  ovr: 70 + i % 25, stats: { pace: 65 + i % 30, passing: 60 + i % 35 },
  basePriceUnits: 2, potId: `pot-${Math.floor(i / 20) + 1}`,
}));
