import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DomainError } from '../../domain/errors.js';
import type { Fc26Catalog } from './fc26.catalog.js';
/** FC26 catalog status and import. Paths come from server configuration only; clients never supply any. */
export function registerFc26Routes(app: FastifyInstance, catalog: Fc26Catalog | undefined): void {
  const need = (): Fc26Catalog => {
    if (!catalog) throw new DomainError('FC26_UNAVAILABLE', 'FC26 database is not configured on this server.', 503);
    return catalog;
  };
  app.get('/api/fc26/status', async () => {
    const c = need();
    const stats = await c.stats();
    return { ...stats, topRatingThreshold: c.topRatingThreshold, lastImport: c.lastReport() };
  });
  app.post('/api/fc26/import', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async request => {
    z.object({}).strict().parse(request.body ?? {});
    return need().importAll();
  });
}
