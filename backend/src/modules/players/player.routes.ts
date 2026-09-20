import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PlayerRepository } from '../../repositories/interfaces.js';
import { publicPlayer } from '../teams/team.service.js';

/** Authenticated preview of the same catalog that feeds the auction engine. */
export function registerPlayerRoutes(app: FastifyInstance, players: PlayerRepository): void {
  app.get('/api/players', async request => {
    const query = z.object({
      potId: z.string().min(1).max(100).optional(),
      search: z.string().trim().max(100).optional(),
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(2000).default(2000),
    }).strict().parse(request.query);
    const catalog = await players.listPlayerPool({});
    const needle = query.search?.toLowerCase();
    const filtered = catalog.filter(p => (!query.potId || p.potId === query.potId) &&
      (!needle || (p.name + ' ' + (p.club ?? '')).toLowerCase().includes(needle)));
    return { total: filtered.length, catalogTotal: catalog.length, offset: query.offset,
      pots: [...new Set(catalog.map(p => p.potId))],
      players: filtered.slice(query.offset, query.offset + query.limit).map(publicPlayer) };
  });
}
