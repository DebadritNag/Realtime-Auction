import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ManagerModeService } from './manager.service.js';
import { mutationSchema } from './manager.schemas.js';
export function registerManagerRoutes(app: FastifyInstance, service: ManagerModeService) {
    const params = z.object({ id: z.string().min(1).max(100) });
    app.get('/api/manager-mode', async (req) => service.list(req.auth.userId));
    app.get('/api/manager-mode/from-auction/:id', async (req) => { const { room, existing, importReport } = await service.preview(params.parse(req.params).id, req.auth.userId); return { auctionId: room.id, name: room.auctionName, teams: room.teams, players: room.players, purchases: room.purchases, existingId: existing?.id ?? null, importReport }; });
    app.post('/api/manager-mode/from-auction/:id/preview', { bodyLimit: 2100000 }, async (req) => { const body = z.object({ csv: z.string().max(2000000) }).strict().parse(req.body); return (await service.preview(params.parse(req.params).id, req.auth.userId, body.csv)).importReport; });
    app.post('/api/manager-mode/from-auction/:id', { bodyLimit: 2100000 }, async (req) => service.create(params.parse(req.params).id, req.auth.userId, req.body));
    app.get('/api/manager-mode/:id', async (req) => service.state(params.parse(req.params).id, req.auth.userId));
    app.post('/api/manager-mode/:id/actions', async (req) => { const body = mutationSchema.parse(req.body); return service.mutate(params.parse(req.params).id, req.auth.userId, body.requestId, body.action); });
}
