import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DomainError } from '../../domain/errors.js';
import type { PlayerRepository } from '../../repositories/interfaces.js';
import type { Fc26Catalog } from '../fc26/fc26.catalog.js';
import { publicPlayer } from '../teams/team.service.js';
/** Authenticated preview of the same catalog that feeds the auction engine. */
export function registerPlayerRoutes(app: FastifyInstance, players: PlayerRepository, fc26?: Fc26Catalog): void {
  app.get('/api/players', async request => {
    const query = z.object({
      source: z.enum(['DEFAULT', 'FC26']).default('DEFAULT'),
      potId: z.string().min(1).max(100).optional(),
      search: z.string().trim().max(100).optional(),
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(2000).default(2000),
    }).strict().parse(request.query);
    if (query.source === 'FC26') {
      if (!fc26) throw new DomainError('FC26_UNAVAILABLE', 'FC26 database is not configured on this server.', 503);
      const [found, stats] = await Promise.all([
        fc26.search({ query: query.search, potId: query.potId, offset: query.offset, limit: query.limit }), fc26.stats()]);
      return { total: found.total, catalogTotal: stats.total, offset: query.offset, pots: Object.keys(stats.byPot),
        players: found.players.map(publicPlayer) };
    }
    const catalog = await players.listPlayerPool({});
    const needle = query.search?.toLowerCase();
    const filtered = catalog.filter(p => (!query.potId || p.potId === query.potId) &&
      (!needle || (p.name + ' ' + (p.club ?? '')).toLowerCase().includes(needle)));
    return { total: filtered.length, catalogTotal: catalog.length, offset: query.offset,
      pots: [...new Set(catalog.map(p => p.potId))],
      players: filtered.slice(query.offset, query.offset + query.limit).map(publicPlayer) };
  });
}
