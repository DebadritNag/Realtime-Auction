import {visiblePlayers} from '../heroes/hero.engine.js';
import {requireThat} from '../../../domain/errors.js';
import type {Tournament,TransferTransaction} from '../manager.types.js';
import type {ManagerTournamentRepository} from '../manager.repository.js';
import {synchronizeSheets} from '../squad/squad.engine.js';
export interface AuditRow {player:string;counterpart:string;type:string;amountUnits:number;detail:string}
export function transferAudit(t:Tournament,windowId:string){
 const window=t.transferWindows?.find(w=>w.id===windowId);requireThat(window,'WINDOW_NOT_FOUND','Transfer window not found.',404);
 requireThat(window.status==='CLOSED','WINDOW_NOT_CLOSED','Close the transfer window before downloading its audit.',409);
 requireThat(window.auditAvailable&&window.teams.length===t.teams.length,'WINDOW_AUDIT_UNAVAILABLE','This older window predates budget snapshots. Its historical budgets cannot be verified.',409);
 const transactions=t.transactions.filter(row=>row.transferWindowId===window.id);
 const player=(id:string)=>visiblePlayers(t).find(p=>p.id===id)?.name??'Secret Player (unrevealed)';
 const team=(id:string|null)=>window.teams.find(team=>team.teamId===id)?.teamName??'Free Agent Pool';
 const teams=window.teams.slice().sort((a,b)=>a.teamName.localeCompare(b.teamName)).map(snapshot=>{
  const incoming=transactions.filter(row=>row.toTeamId===snapshot.teamId),outgoing=transactions.filter(row=>row.fromTeamId===snapshot.teamId);
  const row=(tr:TransferTransaction,direction:'IN'|'OUT'):AuditRow=>{
   const other=transactions.find(x=>x.id!==tr.id&&((tr.buyoutId&&x.buyoutId===tr.buyoutId)||(tr.tradeId&&x.tradeId===tr.tradeId)));
   const type=tr.type==='SECRET_HERO_PURCHASE'?'Secret Player':tr.type==='RELEASE'?'Released':tr.type==='FREE_AGENT_SIGNING'?'Free Agent Signing':tr.type==='TRADE'?'Player Trade':other?'Cash + Player Buyout':'Cash Buyout';
   return {player:player(tr.playerId),counterpart:team(direction==='IN'?tr.fromTeamId:tr.toTeamId),type,amountUnits:tr.amountUnits,detail:other?(tr.amountUnits>0?'+ '+player(other.playerId):'Exchanged for '+player(other.playerId)+(other.amountUnits?' + cash component ₹'+other.amountUnits/2+' Cr':'')):''};
  };
  const spent=incoming.filter(r=>r.type==='BUYOUT'||r.type==='FREE_AGENT_SIGNING'||r.type==='SECRET_HERO_PURCHASE').reduce((n,r)=>n+r.amountUnits,0);
  const received=outgoing.filter(r=>r.type==='BUYOUT'||r.type==='RELEASE').reduce((n,r)=>n+r.amountUnits,0);
  requireThat(snapshot.closingBudgetUnits!==null&&Number.isSafeInteger(spent)&&Number.isSafeInteger(received)&&snapshot.openingBudgetUnits-spent+received===snapshot.closingBudgetUnits,'WINDOW_ACCOUNTING_MISMATCH','The persisted transfer ledger does not reconcile with this window’s budget snapshots.',409);
  return {...snapshot,bought:incoming.filter(r=>r.type!=='TRADE').map(r=>row(r,'IN')),sold:outgoing.filter(r=>r.type!=='TRADE').map(r=>row(r,'OUT')),trades:outgoing.filter(r=>r.type==='TRADE'||r.type==='BUYOUT'&&transactions.some(x=>x.id!==r.id&&x.buyoutId===r.buyoutId)).map(r=>({out:player(r.playerId),in:player(transactions.find(x=>x.id!==r.id&&(r.tradeId?x.tradeId===r.tradeId:x.buyoutId===r.buyoutId))!.playerId),with:team(r.toTeamId),cashPaidUnits:incoming.filter(x=>x.buyoutId&&x.buyoutId===r.buyoutId).reduce((n,x)=>n+x.amountUnits,0),cashReceivedUnits:r.amountUnits})),spentUnits:spent,receivedUnits:received,netSpendUnits:spent-received};
 });
 return {tournamentName:t.name,window,teams};
}
export type TransferAuditReport=ReturnType<typeof transferAudit>;
export class ManagerReportService {
 constructor(private repository:ManagerTournamentRepository){}
 private async host(id:string,user:string){const t=await this.repository.find(id);requireThat(t,'TOURNAMENT_NOT_FOUND','Tournament not found.',404);requireThat(t.teams.some(team=>team.managerUserId===user&&team.invitation==='JOINED'),'NOT_TOURNAMENT_MEMBER','Active membership required.',403);requireThat(t.hostUserId===user,'HOST_ONLY','Only the host may download tournament reports.',403);return t;}
 async windows(id:string,user:string){return (await this.host(id,user)).transferWindows??[];}
 async audit(id:string,user:string,windowId:string){return transferAudit(await this.host(id,user),windowId);}
 async lineups(id:string,user:string){const t=await this.host(id,user);synchronizeSheets(t);t.players=visiblePlayers(t);return t;}
}
