import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ManagerModeService } from './manager.service.js';
import { mutationSchema } from './manager.schemas.js';
import {ManagerReportService} from './reports/report.service.js';
import {allTeamLineupsPdf,transferAuditPdf} from './reports/report.pdf.js';
export function registerManagerRoutes(app: FastifyInstance, service: ManagerModeService) {
    const reports=new ManagerReportService(service.repository);
    app.get('/api/manager-mode/:id/transfer-windows',async req=>reports.windows(params.parse(req.params).id,req.auth.userId));
    app.get('/api/manager-mode/:id/transfer-windows/:windowId/report.pdf',{config:{rateLimit:{max:8,timeWindow:'1 minute'}}},async(req,reply)=>{
        const p=z.object({id:z.string().min(1).max(100),windowId:z.string().uuid()}).parse(req.params);
        const report=await reports.audit(p.id,req.auth.userId,p.windowId);
        return reply.type('application/pdf').header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename="Transfer-Window-${report.window.number}-Audit.pdf"`).send(transferAuditPdf(report));
    });
    app.get('/api/manager-mode/:id/team-sheets/report.pdf',{config:{rateLimit:{max:8,timeWindow:'1 minute'}}},async(req,reply)=>{
        const t=await reports.lineups(params.parse(req.params).id,req.auth.userId);
        return reply.type('application/pdf').header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition','attachment; filename="All-Teams-Lineups.pdf"').send(allTeamLineupsPdf(t));
    });
    const params = z.object({ id: z.string().min(1).max(100) });
    app.get('/api/manager-mode/:id/secret-player-purchases/:purchaseId/reveal',async(req,reply)=>{const p=z.object({id:z.string().uuid(),purchaseId:z.string().uuid()}).parse(req.params);reply.header('Cache-Control','private, no-store');return service.reveal(p.id,req.auth.userId,p.purchaseId);});
    app.get('/api/manager-mode', async (req) => service.list(req.auth.userId));
    app.get('/api/manager-mode/by-auction/:id', async (req) => {
        const auctionId = params.parse(req.params).id;
        const existing = await service.repository.findByAuction(auctionId);
        if (!existing) return { exists: false, tournamentId: null, status: null };
        return { exists: true, tournamentId: existing.id, status: existing.status };
    });
    app.get('/api/manager-mode/from-auction/:id', async (req) => { const { room, existing, importReport } = await service.preview(params.parse(req.params).id, req.auth.userId); return { auctionId: room.id, name: room.auctionName, teams: room.teams, players: room.players, purchases: room.purchases, existingId: existing?.id ?? null, importReport }; });
    app.post('/api/manager-mode/from-auction/:id/preview', { bodyLimit: 2100000 }, async (req) => { const body = z.object({ csv: z.string().max(2000000) }).strict().parse(req.body); return (await service.preview(params.parse(req.params).id, req.auth.userId, body.csv)).importReport; });
    app.post('/api/manager-mode/from-auction/:id', { bodyLimit: 2100000 }, async (req) => service.create(params.parse(req.params).id, req.auth.userId, req.body));
    app.post('/api/manager-mode/:id/join',async req=>{const body=z.object({requestId:z.string().uuid()}).strict().parse(req.body);return service.mutate(params.parse(req.params).id,req.auth.userId,body.requestId,{type:'INVITATION',accept:true});});
    app.get('/api/manager-mode/:id/history',async req=>{const q=z.object({kind:z.enum(['transactions','trades','buyouts','messages']),before:z.string().max(100).optional(),sessionId:z.string().max(100).optional()}).parse(req.query);return service.history(params.parse(req.params).id,req.auth.userId,q.kind,q.before,q.sessionId);});
    app.get('/api/manager-mode/:id/notifications',async req=>service.notifications(params.parse(req.params).id,req.auth.userId,z.object({before:z.string().min(1).max(100).optional()}).parse(req.query).before));
    app.get('/api/manager-mode/:id', async (req) => service.state(params.parse(req.params).id, req.auth.userId));
    app.post('/api/manager-mode/:id/actions', async (req) => {
      const body=mutationSchema.parse(req.body),id=params.parse(req.params).id;
      const secret=body.action.type==='BUY_SECRET_PLAYER'||body.action.type==='REVEAL_SECRET_PLAYER';
      const data={event:'secret-player-action',actionType:body.action.type,tournamentId:id,requestId:body.requestId,...(body.action.type==='BUY_SECRET_PLAYER'?{secretSlotId:body.action.secretSlotId}:{})};
      if(secret)req.log.info({...data,stage:'received'},'Secret Player action');
      try{const state=await service.mutate(id,req.auth.userId,body.requestId,body.action);if(secret)req.log.info({...data,teamId:state.myTeamId,stage:'response returned'},'Secret Player action');return state;}
      catch(error){const e=error as {code?:string;details?:{postgresCode?:string;constraint?:string;stage?:string;teamId?:string;secretSlotId?:string}};if(secret)req.log.error({...data,stage:e.details?.stage??'transaction',teamId:e.details?.teamId,secretSlotId:e.details?.secretSlotId??('secretSlotId' in data?data.secretSlotId:undefined),code:e.code,databaseCode:e.details?.postgresCode,constraint:e.details?.constraint},'Secret Player action failed');throw error;}
    });
    app.delete('/api/manager-mode/:id', async (req, reply) => { await service.delete(params.parse(req.params).id, req.auth.userId); reply.code(204).send(); });
}
