import type {Db} from '../auction-snapshot.repository.js';
import type {Tournament} from '../manager.types.js';
import type {SecretHero,HeroIdentity} from './hero.types.js';
import {requireThat} from '../../../domain/errors.js';
type Trace=(stage:string,data?:{teamId?:string;secretSlotId?:string})=>void;
export async function loadSecretHeroes(db:Db,id:string):Promise<SecretHero[]>{
 const rows=await db`select * from public.manager_secret_heroes where tournament_id=${id} order by display_order,id`;
 return rows.map(r=>({id:r.id,identity:r.identity as HeroIdentity,teamId:r.team_id,playerId:r.player_id,claimedAt:r.claimed_at?new Date(r.claimed_at).getTime():null,revealedAt:r.revealed_at?new Date(r.revealed_at).getTime():null,transferWindowId:r.transfer_window_id}));
}
/** Caller holds the tournament row lock; all writes commit or roll back together. */
export async function persistSecretHeroes(db:Db,t:Tournament,before:Tournament,report:Trace=()=>{}):Promise<void>{
 let stage='secret pool loaded';let context:{teamId?:string;secretSlotId?:string}={};
 const trace:Trace=(value,data)=>{stage=value;context={...context,...data};report(stage,context);};
 try{
 const heroes=t.secretHeroes??[],old=before.secretHeroes??[];
 const added=heroes.filter(h=>!old.some(x=>x.id===h.id));
 if(added.length)await db`insert into public.manager_secret_heroes ${db(added.map(h=>({id:h.id,tournament_id:t.id,identity:db.json({name:h.identity.name,position:h.identity.position}),display_order:heroes.indexOf(h)})))}`;
 for(const h of heroes){
  const prev=old.find(x=>x.id===h.id);
  if(h.teamId&&!prev?.teamId){
   trace('locking slot',{teamId:h.teamId,secretSlotId:h.id});
   const [slot]=await db`select team_id from public.manager_secret_heroes where id=${h.id} and tournament_id=${t.id} for update`;
   trace('slot locked');
   requireThat(slot&&!slot.team_id,'SECRET_PLAYER_ALREADY_CLAIMED','This Secret Player was just claimed by another team.',409);
   const [team]=await db`select current_transfer_budget_units from public.manager_tournament_teams where id=${h.teamId} and tournament_id=${t.id} for update`;
   requireThat(team&&Number(team.current_transfer_budget_units)>=90,'INSUFFICIENT_BUDGET','A Secret Player costs ₹45 Cr.',409);
   const claimed=await db`select id from public.manager_secret_heroes where tournament_id=${t.id} and team_id=${h.teamId}`;
   requireThat(!claimed.length,'SECRET_PLAYER_ALREADY_USED','Your team has already claimed a Hero.',409);
   const p=t.players.find(p=>p.id===h.playerId)!;
   await db`insert into public.manager_tournament_players ${db({id:p.id,tournament_id:t.id,name:p.name,primary_position:p.position,auction_category:p.category,secondary_positions:[],overall:null,source:'SECRET_HERO',ownership_status:'OWNED',current_team_id:h.teamId,manager_mode_acquisition_price_units:90})}`;
   trace('player assigned');
   await db`update public.manager_tournament_teams set current_transfer_budget_units=current_transfer_budget_units-90,updated_at=now() where id=${h.teamId} and tournament_id=${t.id}`;
   trace('budget deducted');
   const tr=t.transactions.find(x=>x.playerId===p.id&&x.type==='SECRET_HERO_PURCHASE')!;
   await db`insert into public.manager_transfer_transactions ${db({id:tr.id,tournament_id:t.id,player_id:p.id,from_team_id:null,to_team_id:h.teamId,type:'SECRET_HERO_PURCHASE',amount_units:90,transfer_window_id:h.transferWindowId,created_at:new Date(tr.at)})}`;
   trace('transaction recorded');
   await db`update public.manager_secret_heroes set team_id=${h.teamId},player_id=${p.id},claimed_at=${new Date(h.claimedAt!)},transfer_window_id=${h.transferWindowId} where id=${h.id}`;
  }
  if(h.revealedAt!==null&&h.revealedAt!==prev?.revealedAt)await db`update public.manager_secret_heroes set revealed_at=${new Date(h.revealedAt)} where id=${h.id} and tournament_id=${t.id} and team_id=${h.teamId}`;
 }
 }catch(error){if(error&&typeof error==='object')Object.assign(error,{heroStage:stage,heroTeamId:context.teamId,heroSlotId:context.secretSlotId});throw error;}
}
