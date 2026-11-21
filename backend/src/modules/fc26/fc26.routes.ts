import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DomainError } from '../../domain/errors.js';
import type { Fc26Catalog } from './fc26.catalog.js';
import type { RoomManager } from '../rooms/room.manager.js';
import { requireMember } from '../rooms/room.service.js';
import { roomCodeSchema } from '../../schemas/settings.js';
import { publicPlayer } from '../teams/team.service.js';
import { RETENTION_PRICE_CR } from '../../domain/retention.js';
/** FC26 catalog status and import. Paths come from server configuration only; clients never supply any. */
export function registerFc26Routes(app: FastifyInstance, catalog: Fc26Catalog | undefined, manager?: RoomManager): void {
  const need = (): Fc26Catalog => {
    if (!catalog) throw new DomainError('FC26_UNAVAILABLE', 'FC26 database is not configured on this server.', 503);
    return catalog;
  };
  app.get('/api/fc26/status', async () => {
    const c = need();
    const stats = await c.stats();
    return { ...stats, topRatingThreshold: c.topRatingThreshold, lastImport: c.lastReport() };
  });
  // Retention picker data: member-only, excludes players already retained in this room.
  app.get('/api/rooms/:code/retention/players', async request => {
    const { code } = z.object({ code: roomCodeSchema }).parse(request.params);
    const query = z.object({
      search: z.string().trim().max(100).optional(),
      group: z.enum(['ALL', 'GK', 'CB', 'FB', 'CM', 'WM', 'ST', 'W']).default('ALL'),
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).strict().parse(request.query);
    const c = need();
    if (!manager) throw new DomainError('FC26_UNAVAILABLE', 'Room manager is not available.', 503);
    const room = await manager.loadRoom(code);
    requireMember(room, request.auth.userId);
    const excludeIds = (room.retention?.picks ?? []).map(p => p.playerId);
    const found = await c.search({ query: query.search, group: query.group, offset: query.offset, limit: query.limit, excludeIds });
    return { total: found.total, offset: query.offset, limit: query.limit, retentionPriceCr: RETENTION_PRICE_CR,
      players: found.players.map(p => ({ ...publicPlayer(p), retentionPriceCr: RETENTION_PRICE_CR, retainedByTeamId: null })) };
  });
  app.post('/api/fc26/import', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async request => {
    z.object({}).strict().parse(request.body ?? {});
    return need().importAll();
  });
}
