import type {Tournament} from '../manager.types.js';
import type {NegotiationSession} from './negotiation.types.js';
export const offerBehaviors=['FIRST_OFFER','VERY_LOW_OFFER','LOWBALL','FAIR_OFFER','STRONG_OFFER','STRONG_IMPROVEMENT','SMALL_IMPROVEMENT','REPEATED_LOW_OFFER','MATCHED_COUNTER','EXCEEDED_COUNTER','WORSE_THAN_PREVIOUS'] as const;
export type OfferBehavior=typeof offerBehaviors[number];
export interface OfferReaction {previousOfferUnits:number|null;offerBehavior:OfferBehavior;offerQuality:'VERY_LOW'|'BELOW_PREFERRED'|'FAIR'|'STRONG';lowballCount:number;consecutiveImprovementCount:number;playingTime:'HIGH'|'MEDIUM'|'LOW';clubStrength:'STRONG'|'AVERAGE'|'DEVELOPING';}
/** Read-only description of committed history. Never changes evaluation, emotions or amounts. */
export function describeOffer(t:Tournament,s:NegotiationSession):OfferReaction {
 const data=t.negotiation!,profile=data.profiles.find(p=>p.playerId===s.playerId)!;
 const history=data.offers.filter(o=>o.sessionId===s.id),current=history.at(-1)!,previous=history.at(-2);
 const amount=current.offerUnits,old=previous?.offerUnits??null,counter=previous?.counterUnits??null;
 const lowballCount=history.filter(o=>o.offerUnits<profile.minimumValueUnits).length;
 let consecutiveImprovementCount=0;for(let i=history.length-1;i>0&&history[i]!.offerUnits>history[i-1]!.offerUnits;i--)consecutiveImprovementCount++;
 const offerQuality=amount<profile.minimumValueUnits*.5?'VERY_LOW':amount<profile.preferredValueUnits?'BELOW_PREFERRED':amount>=profile.idealValueUnits?'STRONG':'FAIR';
 let offerBehavior:OfferBehavior;
 if(old!==null&&amount<old)offerBehavior='WORSE_THAN_PREVIOUS';
 else if(counter!==null&&amount>counter)offerBehavior='EXCEEDED_COUNTER';
 else if(counter!==null&&amount===counter)offerBehavior='MATCHED_COUNTER';
 else if(amount<profile.minimumValueUnits&&lowballCount>1)offerBehavior='REPEATED_LOW_OFFER';
 else if(offerQuality==='VERY_LOW')offerBehavior='VERY_LOW_OFFER';
 else if(amount<profile.minimumValueUnits)offerBehavior='LOWBALL';
 else if(old!==null&&amount>old)offerBehavior=amount-old>=Math.max(4,Math.ceil(old*.2))?'STRONG_IMPROVEMENT':'SMALL_IMPROVEMENT';
 else if(offerQuality==='STRONG')offerBehavior='STRONG_OFFER';
 else if(offerQuality==='FAIR')offerBehavior='FAIR_OFFER';
 else offerBehavior='FIRST_OFFER';
 const player=t.players.find(p=>p.id===s.playerId)!,squad=t.players.filter(p=>p.currentTeamId===s.teamId);
 const competitors=squad.filter(p=>p.position===player.position&&p.overall>=player.overall).length;
 const top=[...squad].sort((a,b)=>b.overall-a.overall).slice(0,11),strength=top.reduce((n,p)=>n+p.overall,0)/Math.max(1,top.length);
 return {previousOfferUnits:old,offerBehavior,offerQuality,lowballCount,consecutiveImprovementCount,playingTime:competitors===0?'HIGH':competitors===1?'MEDIUM':'LOW',clubStrength:strength>=80?'STRONG':strength>=70?'AVERAGE':'DEVELOPING'};
}
