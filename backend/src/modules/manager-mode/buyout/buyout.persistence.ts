import type {Db} from '../auction-snapshot.repository.js';
import type {Tournament} from '../manager.types.js';
import type {BuyoutOffer} from './buyout.types.js';
import {requireThat} from '../../../domain/errors.js';
interface BuyoutRow {id:string;from_team_id:string;to_team_id:string;target_player_id:string;offer_type:BuyoutOffer['offerType'];cash_amount_units:string;included_player_id:string|null;status:BuyoutOffer['status'];parent_buyout_id:string|null;responding_team_id:string;created_by:string;target_ownership_token:string;included_ownership_token:string|null;created_at:Date;updated_at:Date;resolved_at:Date|null;}
export async function loadBuyouts(db:Db,id:string):Promise<BuyoutOffer[]>{const rows=await db<BuyoutRow[]>`select * from public.manager_buyout_offers where tournament_id=${id} order by created_at,id`;return rows.map(r=>({id:r.id,fromTeamId:r.from_team_id,toTeamId:r.to_team_id,targetPlayerId:r.target_player_id,offerType:r.offer_type,cashAmountUnits:Number(r.cash_amount_units),includedPlayerId:r.included_player_id,status:r.status,parentBuyoutId:r.parent_buyout_id,respondingTeamId:r.responding_team_id,createdBy:r.created_by,targetOwnershipToken:r.target_ownership_token,includedOwnershipToken:r.included_ownership_token,createdAt:new Date(r.created_at).getTime(),updatedAt:new Date(r.updated_at).getTime(),resolvedAt:r.resolved_at?new Date(r.resolved_at).getTime():null}));}
export async function persistBuyouts(db:Db,t:Tournament,before:Tournament){
 const offers=t.buyouts??[],old=before.buyouts??[];
 const accepted=offers.find(o=>o.status==='ACCEPTED'&&old.find(x=>x.id===o.id)?.status==='PENDING');
 if(accepted){
 const o=accepted;
 const [locked]=await db<{status:string}[]>`select status from public.manager_buyout_offers where id=${o.id} and tournament_id=${t.id} for update`;requireThat(locked?.status==='PENDING','BUYOUT_NOT_PENDING','Offer was already resolved.',409);
 const ids=[o.targetPlayerId,...(o.includedPlayerId?[o.includedPlayerId]:[])].sort();
 const players=await db<{id:string;current_team_id:string|null}[]>`select id,current_team_id from public.manager_tournament_players where tournament_id=${t.id} and id in ${db(ids)} order by id for update`;
 requireThat(players.length===ids.length&&players.find(p=>p.id===o.targetPlayerId)?.current_team_id===o.toTeamId&&(!o.includedPlayerId||players.find(p=>p.id===o.includedPlayerId)?.current_team_id===o.fromTeamId),'STALE_OWNERSHIP','Player ownership changed.',409);
 const teams=await db<{id:string;current_transfer_budget_units:string}[]>`select id,current_transfer_budget_units from public.manager_tournament_teams where tournament_id=${t.id} and id in ${db([o.fromTeamId,o.toTeamId].sort())} order by id for update`;
 requireThat(teams.length===2&&Number(teams.find(x=>x.id===o.fromTeamId)!.current_transfer_budget_units)>=o.cashAmountUnits,'INSUFFICIENT_BUDGET','Buyer budget changed.',409);
 await db`update public.manager_tournament_teams set current_transfer_budget_units=current_transfer_budget_units+case when id=${o.fromTeamId}::uuid then -${o.cashAmountUnits}::bigint else ${o.cashAmountUnits}::bigint end,updated_at=now() where tournament_id=${t.id} and id in ${db([o.fromTeamId,o.toTeamId])}`;
 const movements=t.transactions.filter(x=>x.buyoutId===o.id);
 for(const move of movements)await db`update public.manager_tournament_players set current_team_id=${move.toTeamId},ownership_status='OWNED',manager_mode_acquisition_price_units=${move.amountUnits},updated_at=now() where id=${move.playerId} and tournament_id=${t.id}`;
 await db`insert into public.manager_transfer_transactions ${db(movements.map(m=>({id:m.id,tournament_id:t.id,player_id:m.playerId,from_team_id:m.fromTeamId,to_team_id:m.toTeamId,type:'BUYOUT',amount_units:m.amountUnits,related_buyout_id:o.id,transaction_group_id:o.id,created_at:new Date(m.at)})))}`;
 await db`insert into public.manager_buyout_cash_movements(buyout_id,tournament_id,from_team_id,to_team_id,amount_units) values(${o.id},${t.id},${o.fromTeamId},${o.toTeamId},${o.cashAmountUnits})`;
 }
 // Resolve parents before inserting linked counters (partial unique pending-offer index).
 for(const o of offers){const previous=old.find(x=>x.id===o.id);if(previous&&JSON.stringify(previous)!==JSON.stringify(o))await db`update public.manager_buyout_offers set status=${o.status},updated_at=${new Date(o.updatedAt)},resolved_at=${o.resolvedAt?new Date(o.resolvedAt):null} where id=${o.id} and tournament_id=${t.id}`;}
 for(const o of offers.filter(o=>!old.some(x=>x.id===o.id)))await db`insert into public.manager_buyout_offers ${db({id:o.id,tournament_id:t.id,from_team_id:o.fromTeamId,to_team_id:o.toTeamId,target_player_id:o.targetPlayerId,offer_type:o.offerType,cash_amount_units:o.cashAmountUnits,included_player_id:o.includedPlayerId,status:o.status,parent_buyout_id:o.parentBuyoutId,responding_team_id:o.respondingTeamId,created_by:o.createdBy,target_ownership_token:o.targetOwnershipToken,included_ownership_token:o.includedOwnershipToken,created_at:new Date(o.createdAt),updated_at:new Date(o.updatedAt)})}`;
}
