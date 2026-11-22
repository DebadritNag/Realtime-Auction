import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { roomCodeSchema } from '../../../schemas/settings.js';
import type { RoomManager } from '../../rooms/room.manager.js';
import { PoolImportService } from './pool-import.service.js';

const bodySchema = z.object({
  source: z.enum(['CSV', 'FC26_DATABASE', 'DEFAULT_POOL']),
  fileName: z.string().max(300).optional(),
  csv: z.string().max(1_500_000).optional(),
  playerIds: z.array(z.string().min(1).max(100)).max(500).optional(),
  potIds: z.array(z.string().min(1).max(50)).max(20).optional(),
  search: z.string().trim().max(100).optional(),
  batchId: z.string().uuid().optional(),
}).strict();
const route = { bodyLimit: 2 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

/** Host-only additive imports into a live auction. Clients never supply server paths; prices are computed server-side. */
export function registerPoolImportRoutes(app: FastifyInstance, manager: RoomManager): PoolImportService {
  const service = new PoolImportService(manager);
  const params = z.object({ code: roomCodeSchema });
  app.post('/api/rooms/:code/pool-import/preview', route, async request => {
    const { code } = params.parse(request.params);
    const body = bodySchema.parse(request.body);
    return service.preview(code, request.auth.userId, body);
  });
  app.post('/api/rooms/:code/pool-import/commit', route, async request => {
    const { code } = params.parse(request.params);
    const body = bodySchema.parse(request.body);
    return service.commit(code, request.auth.userId, body);
  });
  return service;
}
