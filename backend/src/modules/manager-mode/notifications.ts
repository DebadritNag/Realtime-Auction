import type {Tournament} from './manager.types.js';
export function unseenOffers(t:Tournament,user:string,teamId:string){
 const keys=new Set<string>();
 for(const n of t.notifications){if(n.userId!==user||n.read)continue;const {entityType:kind,entityId:id}=n.metadata;
 const actionable=kind==='trade'?t.trades.some(o=>o.id===id&&o.toTeamId===teamId&&o.status==='PENDING'):kind==='buyout'?t.buyouts?.some(o=>o.id===id&&o.respondingTeamId===teamId&&o.status==='PENDING'):kind==='negotiation'?t.negotiation?.sessions.some(o=>o.id===id&&o.teamId===teamId&&['ACTIVE','ACCEPTED'].includes(o.status)):false;
 if(actionable)keys.add(kind+':'+id);
 }return [...keys];
}
