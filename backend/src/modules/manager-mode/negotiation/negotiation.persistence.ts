import type {Db} from '../auction-snapshot.repository.js';
import type {Tournament} from '../manager.types.js';
import type {NegotiationData,NegotiationProfile,NegotiationSession,NegotiationOffer,NegotiationMessage,TransferRules} from './negotiation.types.js';
import {ensureNegotiations} from './negotiation.engine.js';
const snake=(s:string)=>s.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
const camel=(s:string)=>s.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase());
const timeKeys=new Set(['createdAt','updatedAt','closedAt','lastOfferAt','cooldownUntil']);
function toRow(value:object){return Object.fromEntries(Object.entries(value).map(([key,value])=>[snake(key),timeKeys.has(key)&&value!==null?new Date(value as number):value]));}
function fromRow<T>(row:Record<string,unknown>):T{return Object.fromEntries(Object.entries(row).filter(([key])=>!['tournament_id','created_at'].includes(key)||key==='created_at').map(([key,value])=>{const name=camel(key);return [name,timeKeys.has(name)&&value!==null?new Date(value as string).getTime():name.endsWith('Units')&&value!==null?Number(value):value];})) as T;}
export async function loadNegotiations(db:Db,id:string):Promise<NegotiationData>{
 const [rules,profiles,sessions,offers,messages]=await Promise.all([
 db`select * from public.manager_transfer_rules where tournament_id=${id}`,
 db`select * from public.manager_player_negotiation_profiles where tournament_id=${id}`,
 db`select * from public.manager_negotiation_sessions where tournament_id=${id} order by created_at,id`,
 db`select o.* from public.manager_free_agent_offers o join public.manager_negotiation_sessions s on s.id=o.session_id where s.tournament_id=${id} order by o.created_at,o.id`,
 db`select m.* from public.manager_negotiation_messages m join public.manager_negotiation_sessions s on s.id=m.session_id where s.tournament_id=${id} order by m.created_at,case m.sender when 'MANAGER' then 0 else 1 end,m.id`
 ]);
 return {rules:rules[0]?fromRow<TransferRules>(rules[0]):{difficulty:'NORMAL',visibility:'SEMI_TRANSPARENT',offerCooldownMs:3000,walkAwayCooldownMs:180000},profiles:profiles.map(r=>fromRow<NegotiationProfile>(r)),sessions:sessions.map(r=>fromRow<NegotiationSession>(r)),offers:offers.map(r=>fromRow<NegotiationOffer>(r)),messages:messages.map(r=>fromRow<NegotiationMessage>(r))};
}
export async function persistNegotiations(db:Db,t:Tournament,old?:Tournament){
 const data=ensureNegotiations(t),before=old?.negotiation;
 if(!before||JSON.stringify(before.rules)!==JSON.stringify(data.rules))await db`insert into public.manager_transfer_rules ${db({tournament_id:t.id,...toRow(data.rules)})} on conflict(tournament_id) do update set difficulty=excluded.difficulty,visibility=excluded.visibility,offer_cooldown_ms=excluded.offer_cooldown_ms,walk_away_cooldown_ms=excluded.walk_away_cooldown_ms`;
 const profiles=data.profiles.filter(p=>!before?.profiles.some(x=>x.playerId===p.playerId));if(profiles.length)await db`insert into public.manager_player_negotiation_profiles ${db(profiles.map(p=>({tournament_id:t.id,...toRow(p)})))} on conflict(player_id) do nothing`;
 for(const s of data.sessions){const previous=before?.sessions.find(x=>x.id===s.id);if(JSON.stringify(previous)===JSON.stringify(s))continue;const row=toRow(s);if(!previous)await db`insert into public.manager_negotiation_sessions ${db({...row,tournament_id:t.id})}`;else await db`update public.manager_negotiation_sessions set ${db(row)} where id=${s.id} and tournament_id=${t.id}`;}
 const offers=data.offers.filter(o=>!before?.offers.some(x=>x.id===o.id));if(offers.length)await db`insert into public.manager_free_agent_offers ${db(offers.map(toRow))}`;
 const messages=data.messages.filter(m=>!before?.messages.some(x=>x.id===m.id));if(messages.length)await db`insert into public.manager_negotiation_messages ${db(messages.map(toRow))}`;
 for(const m of data.messages){const prior=before?.messages.find(x=>x.id===m.id);if(prior&&prior.message!==m.message)await db`update public.manager_negotiation_messages set message=${m.message},provider=${m.provider} where id=${m.id} and session_id=${m.sessionId}`;}
}
