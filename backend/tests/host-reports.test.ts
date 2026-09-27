import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {source} from './squad.test.js';
import {ManagerModeService} from '../src/modules/manager-mode/manager.service.js';
import {MemoryManagerRepository} from '../src/modules/manager-mode/manager.repository.js';
import {ManagerReportService,transferAudit} from '../src/modules/manager-mode/reports/report.service.js';
import {allTeamLineupsPdf,transferAuditPdf} from '../src/modules/manager-mode/reports/report.pdf.js';
import {buildApp} from '../src/app.js';
import {MemoryRoomRepository} from '../src/repositories/memory.js';
import {StaticTokenAuthService} from '../src/modules/auth-context/auth.service.js';
async function setup(){const room=source(),repo=new MemoryManagerRepository(),service=new ManagerModeService(repo,async()=>room);const s=await service.create(room.id,'user0',{name:'Report League',addUnusedAuctionPurse:false});const act=(user:string,a:Parameters<typeof service.mutate>[3],request=randomUUID())=>service.mutate(s.id,user,request,a);for(let i=1;i<8;i++)await act('user'+i,{type:'INVITATION',accept:true});await act('user0',{type:'GENERATE_FIXTURES'});return {room,repo,service,act,id:s.id,reports:new ManagerReportService(repo)};}
it('isolates two windows, records all transfer types, reconciles budgets and freezes history',async()=>{
 const f=await setup();let s=await f.act('user0',{type:'WINDOW',open:true});const w1=s.transferWindows![0]!;
 expect(w1.teams.every(t=>t.openingBudgetUnits===200)).toBe(true);
 await f.act('user0',{type:'WINDOW',open:true});expect((await f.reports.windows(f.id,'user0'))).toHaveLength(1);
 s=await f.act('user0',{type:'TRADE',offeredPlayerId:'p1',requestedPlayerId:'p25'});await f.act('user1',{type:'TRADE_RESPONSE',tradeId:s.trades.at(-1)!.id,response:'ACCEPT'});
 s=await f.act('user0',{type:'BUYOUT',targetPlayerId:'p26',offerType:'CASH_PLUS_PLAYER',cashAmountUnits:20,includedPlayerId:'p2'});await f.act('user1',{type:'BUYOUT_RESPONSE',buyoutId:s.buyouts!.at(-1)!.id,response:'ACCEPT'});
 s=await f.act('user0',{type:'BUYOUT',targetPlayerId:'p27',offerType:'CASH',cashAmountUnits:10});await f.act('user1',{type:'BUYOUT_RESPONSE',buyoutId:s.buyouts!.at(-1)!.id,response:'ACCEPT'});
 s=await f.act('user0',{type:'START_NEGOTIATION',playerId:'p192'});const session=s.negotiation.sessions.find(x=>x.playerId==='p192')!;await f.act('user0',{type:'OFFER_FREE_AGENT',sessionId:session.id,amountUnits:80});await f.act('user0',{type:'CONFIRM_SIGNING',sessionId:session.id});
 s=await f.service.state(f.id,'user0');const q=s.saleQuotes!.p3!;await f.act('user0',{type:'SELL_PLAYER',playerId:'p3',ownershipToken:q.ownershipToken,expectedSaleUnits:q.saleValueUnits});
 await expect(f.reports.audit(f.id,'user0',w1.id)).rejects.toMatchObject({code:'WINDOW_NOT_CLOSED'});
 await f.act('user0',{type:'WINDOW',open:false});const report=await f.reports.audit(f.id,'user0',w1.id),a=report.teams.find(t=>t.teamId==='team0')!;
 expect(a.spentUnits).toBe(110);expect(a.receivedUnits).toBe(q.saleValueUnits);expect(a.closingBudgetUnits).toBe(200-110+q.saleValueUnits);expect(a.trades).toHaveLength(2);expect(a.bought.some(r=>r.type==='Cash + Player Buyout'&&r.detail.includes('Player 2'))).toBe(true);expect(report.teams).toHaveLength(8);expect(report.teams.find(t=>t.teamId==='team7')!.spentUnits).toBe(0);
 await f.act('user0',{type:'WINDOW',open:true});s=await f.service.state(f.id,'user0');const w2=s.transferWindows!.at(-1)!;expect(w2.id).not.toBe(w1.id);expect(w2.number).toBe(2);const quote=s.saleQuotes!.p4!;await f.act('user0',{type:'SELL_PLAYER',playerId:'p4',ownershipToken:quote.ownershipToken,expectedSaleUnits:quote.saleValueUnits});await f.act('user0',{type:'WINDOW',open:false});expect(await f.reports.audit(f.id,'user0',w1.id)).toEqual(report);const second=await f.reports.audit(f.id,'user0',w2.id);expect(second.teams.flatMap(t=>t.sold).map(r=>r.player)).toEqual(['Player 4']);
 const t=(await f.repo.find(f.id))!;expect(t.transactions.filter(r=>r.type!=='AUCTION_PURCHASE').every(r=>r.transferWindowId)).toBe(true);
 mkdirSync('test-results',{recursive:true});const pdf=transferAuditPdf(report,0);expect(pdf.subarray(0,4).toString()).toBe('%PDF');writeFileSync('test-results/window-audit.pdf',pdf);
});
it('freezes an open window before season bonuses and serves fresh saved lineups only to the host',async()=>{
 const f=await setup();let s=await f.act('user0',{type:'WINDOW',open:true});const w=s.transferWindows![0]!;await f.act('user0',{type:'END_CURRENT_SEASON',confirmation:'END SEASON'});const report=await f.reports.audit(f.id,'user0',w.id);expect(report.teams.every(t=>t.closingBudgetUnits===200)).toBe(true);expect((await f.service.state(f.id,'user0')).teams[0]!.transferBudgetUnits).toBeGreaterThan(200);
 await f.act('user0',{type:'START_NEXT_SEASON'});await f.act('user0',{type:'SAVE_TEAM_SHEET',formation:'4-3-3 Holding',slots:[...Array.from({length:10},(_,i)=>'p'+(i+1)),'p0'],bench:['p11'],captainId:'p1'});let t=await f.reports.lineups(f.id,'user0');expect(t.squadData!.sheets[0]!.formation).toBe('4-3-3 Holding');
 await f.act('user0',{type:'SAVE_TEAM_SHEET',formation:'4-2-3-1 Narrow',slots:Array(11).fill(null),bench:['p1'],captainId:null});t=await f.reports.lineups(f.id,'user0');expect(t.squadData!.sheets[0]!.formation).toBe('4-2-3-1 Narrow');expect(t.squadData!.sheets).toHaveLength(1);
 for(const method of [()=>f.reports.lineups(f.id,'user1'),()=>f.reports.audit(f.id,'user1',w.id),()=>f.reports.windows(f.id,'user1')])await expect(method()).rejects.toMatchObject({code:'HOST_ONLY'});
 await expect(f.reports.lineups(f.id,'outsider')).rejects.toMatchObject({code:'NOT_TOURNAMENT_MEMBER'});
 mkdirSync('test-results',{recursive:true});writeFileSync('test-results/all-team-lineups.pdf',allTeamLineupsPdf(t,0));
 t.transferWindows![0]!.auditAvailable=false;expect(()=>transferAudit(t,w.id)).toThrow('older window');
});
it('protects PDF endpoints with authentication and host membership and disables caching',async()=>{
 const f=await setup(),rooms=new MemoryRoomRepository();await rooms.create(f.room);const {app}=await buildApp({authService:new StaticTokenAuthService(new Map(f.room.teams.map(t=>[t.userId,{userId:t.userId}]))),repository:rooms,managerRepository:f.repo,logger:false,timersEnabled:false});
 try{await app.ready();const path='/api/manager-mode/'+f.id+'/team-sheets/report.pdf';expect((await app.inject({url:path})).statusCode).toBe(401);expect((await app.inject({url:path,headers:{authorization:'Bearer user1'}})).statusCode).toBe(403);const response=await app.inject({url:path,headers:{authorization:'Bearer user0'}});expect(response.statusCode).toBe(200);expect(response.headers['content-type']).toContain('application/pdf');expect(response.headers['cache-control']).toBe('private, no-store');expect(response.rawPayload.subarray(0,4).toString()).toBe('%PDF');}finally{await app.close();}
});
