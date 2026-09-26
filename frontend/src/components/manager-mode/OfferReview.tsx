'use client';
import type {TournamentState} from '@/types/manager-mode';
import type {ManagerAction} from '@/services/manager-mode.service';
export function OfferReview({state,kind,id,action}:{state:TournamentState;kind:'trade'|'buyout'|'negotiation';id:string;action:(a:ManagerAction)=>Promise<void>}){
 const unread=state.notifications.filter(n=>!n.read&&n.metadata.entityType===kind&&n.metadata.entityId===id);
 return (state.unseenOffers?.includes(kind+':'+id)??Boolean(unread.length))?<button className="text-xs text-emerald-300 underline" onClick={()=>void action({type:'READ_OFFER',entityType:kind,entityId:id})}>Mark offer reviewed</button>:null;
}
