import type {TournamentState} from '@/types/manager-mode';
export function actionableNotifications(state:TournamentState){return state.notifications.filter(n=>{
 if(n.read)return false;
 if(n.metadata.entityType==='trade')return state.trades.some(t=>t.id===n.metadata.entityId&&t.toTeamId===state.myTeamId&&t.status==='PENDING');
 if(n.metadata.entityType==='buyout')return state.buyouts?.some(o=>o.id===n.metadata.entityId&&o.respondingTeamId===state.myTeamId&&o.status==='PENDING');
 if(n.metadata.entityType==='negotiation')return state.negotiation?.sessions.some(s=>s.id===n.metadata.entityId&&['ACTIVE','ACCEPTED'].includes(s.status));
 return false;
});}
export function offerCount(state:TournamentState,kind?:string){if(state.unseenOffers)return state.unseenOffers.filter(key=>!kind||key.startsWith(kind+':')).length;return new Set(actionableNotifications(state).filter(n=>!kind||n.metadata.entityType===kind).map(n=>n.metadata.entityType+':'+n.metadata.entityId)).size;}
export function notificationHref(id:string,n:{metadata:Record<string,string>}){return '/manager-mode/'+id+(n.metadata.entityType==='negotiation'?'/transfers/free-agents/'+n.metadata.playerId:n.metadata.entityType==='buyout'||n.metadata.entityType==='trade'?'/transfers/offers':n.metadata.entityType==='fixture'?'/fixtures':'/notifications');}
