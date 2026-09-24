import {createHash,randomUUID} from 'node:crypto';
import type {Sql} from 'postgres';
import type {Room} from '../../domain/types.js';
import {requireThat} from '../../domain/errors.js';
import {assertRoom} from '../auction/squad.service.js';
const stableId=(key:string)=>{const h=createHash('sha256').update(key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
/** Archive only a completed server snapshot. Never changes live auction timing or writes back to runtime. */
export async function archiveCompletedAuction(db:Sql,room:Room,user:string){
 requireThat(room.status==='COMPLETED'&&room.hostUserId===user,'HOST_ONLY','Only the host can archive a completed auction.',403);assertRoom(room);
 await db.begin(async tx=>{
 await tx`select pg_advisory_xact_lock(hashtextextended(${room.id},0))`;
 const existing=await tx`select id from public.auction_rooms where id=${room.id}`;if(existing.length)return;
 const s=room.settings;
 await tx`insert into public.auction_rooms ${tx({id:room.id,code:room.code,host_user_id:user,name:room.auctionName,status:'COMPLETED',number_of_teams:s.numberOfTeams,starting_budget_units:s.startingBudgetCr*2,minimum_squad_size:s.minSquadSize,maximum_squad_size:s.maxSquadSize,player_timer_seconds:s.playerTimerSeconds,anti_sniping_enabled:s.antiSnipingEnabled,anti_sniping_threshold_seconds:s.antiSnipingThresholdSeconds,anti_sniping_reset_seconds:s.antiSnipingResetSeconds,minimum_base_price_units:s.minimumBasePriceCr*2,allow_custom_bids:s.allowCustomBids,created_at:new Date(room.createdAt),completed_at:new Date()})}`;
 await tx`insert into public.room_members ${tx(room.teams.map(t=>({id:t.id,room_id:room.id,user_id:t.userId,team_name:t.name,team_logo_url:t.logoUrl??null,role:t.userId===user?'HOST':'PLAYER',status:'JOINED',starting_budget_units:t.startingBudgetUnits,spent_units:t.spentUnits,remaining_budget_units:t.startingBudgetUnits-t.spentUnits,players_owned:t.playerIds.length})))}`;
 const externalIds=room.players.map(p=>p.id);const known=externalIds.length?await tx<{id:string;external_id:string|null}[]>`select id,external_id from public.football_players where external_id in ${tx(externalIds)} or id::text in ${tx(externalIds)}`:[];
 const mapping=new Map<string,string>();const added=[];
 for(const p of room.players){const found=known.find(k=>k.external_id===p.id||k.id===p.id);const id=found?.id??stableId('auction-player:'+p.id);mapping.set(p.id,id);if(!found)added.push({id,external_id:p.id,name:p.name,overall:p.ovr,position:p.subPosition??p.position,secondary_positions:p.secondaryPositions?.split(',').map(x=>x.trim())??[],club:p.club??null,nationality:p.nationality??null,age:p.age??null,image_url:p.photoUrl??null,base_price_units:p.basePriceUnits,pace:p.stats.pace??null,shooting:p.stats.shooting??null,passing:p.stats.passing??null,dribbling:p.stats.dribbling??null,defending:p.stats.defending??null,physical:p.stats.physical??null,metadata:tx.json({archiveSource:'completed-auction',pot:p.potId})});}
 if(added.length)await tx`insert into public.football_players ${tx(added)} on conflict (id) do nothing`;
 const rows=room.players.map((p,i)=>{const purchase=room.purchases.find(x=>x.playerId===p.id);return {id:randomUUID(),room_id:room.id,player_id:mapping.get(p.id)!,queue_order:i,status:p.status,base_price_units:p.basePriceUnits,final_price_units:purchase?.priceUnits??null,winning_team_id:purchase?.teamId??null,auctioned_at:purchase?new Date(purchase.at):null};});
 if(rows.length)await tx`insert into public.auction_pool ${tx(rows)}`;
 if(room.purchases.length)await tx`insert into public.player_purchases ${tx(room.purchases.map(p=>({id:p.id,room_id:room.id,auction_pool_id:rows.find(x=>x.player_id===mapping.get(p.playerId))!.id,player_id:mapping.get(p.playerId)!,team_id:p.teamId,user_id:room.teams.find(t=>t.id===p.teamId)!.userId,price_units:p.priceUnits,purchased_at:new Date(p.at)})))}`;
 // Preserve the original completed snapshot for historical recovery, not as tournament authority.
 await tx`insert into public.auction_runtime_snapshots(room_id,sequence,state) values(${room.id},${room.sequence},${tx.json(JSON.parse(JSON.stringify(room)))})`;
 });
}
