import {createHash} from 'node:crypto';
import type {ManagerPlayer} from '../manager.types.js';
import type {Archetype,NegotiationProfile} from './negotiation.types.js';
type Values=Pick<NegotiationProfile,'marketValueUnits'|'minimumValueUnits'|'preferredValueUnits'|'idealValueUnits'>;
/** Game-economy bands in integer half-crore units, not real-world transfer values. */
export function freeAgentValues(p:ManagerPlayer,personality:Archetype):Values {
 const [low,high]=p.overall<=80?[2,6]:p.overall<=82?[4,10]:p.overall<=84?[8,14]:p.overall<=86?[12,20]:p.overall<=88?[18,28]:[24,36];
 const stats=Object.values(p.stats).filter(Number.isFinite);
 const quality=stats.length?stats.reduce((a,b)=>a+b,0)/stats.length: p.overall;
 const variation=createHash('sha256').update(p.id).digest()[0]!/255;
 const fraction=Math.max(.15,Math.min(.95,.35+(p.overall%2===0?.12:0)+(p.age&&p.age<25?.08:p.age&&p.age>32?-.08:0)+(['ST','LW','RW'].includes(p.position)?.06:0)+Math.max(-.1,Math.min(.1,(quality-75)/100))+variation*.16));
 const personalityFactor=personality==='MONEY_DRIVEN'||personality==='OPPORTUNISTIC'?1.1:personality==='STUBBORN'?1.05:personality==='RELAXED'||personality==='LOYAL'?.9:1;
 const discount=p.metadata.freeAgentReason==='TEAM_RELEASE'?.75:p.source==='AUCTION_UNSOLD'?(p.overall>=87?.9:personality==='STUBBORN'?.85:.8):1;
 const market=Math.max(2,Math.round((low+(high-low)*fraction)*discount));
 const preferred=Math.max(2,Math.min(Math.round(high*discount),Math.round(market*personalityFactor)));
 return {marketValueUnits:market,minimumValueUnits:Math.max(2,Math.min(preferred,Math.round(preferred*.75))),preferredValueUnits:preferred,idealValueUnits:Math.max(preferred,Math.round(preferred*1.2))};
}
/** Bounded pressure: even an enormous rival offer cannot multiply expectations. */
export function competitiveValues(p:NegotiationProfile,interestedClubs:number,highestRivalUnits:number):Values {
 const demand=Math.min(.15,Math.max(0,interestedClubs)*.05);
 const rival=Math.min(.2,Math.max(0,highestRivalUnits/p.preferredValueUnits-1)*.15);
 const factor=1+demand+rival;
 return {...p,preferredValueUnits:Math.round(p.preferredValueUnits*factor),idealValueUnits:Math.min(Math.round(p.preferredValueUnits*1.6),Math.round(p.idealValueUnits*factor))};
}
