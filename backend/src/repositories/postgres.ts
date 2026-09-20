import postgres,{type Sql,type TransactionSql} from 'postgres';
import {createHash} from 'node:crypto';
import type {Room,Player} from '../domain/types.js';
import type {RoomRepository,PlayerRepository} from './interfaces.js';
import {DomainError,requireThat} from '../domain/errors.js';
import type {RoomSettings} from '../schemas/settings.js';
import {calculateResults} from '../modules/results/result.service.js';
export function connectDatabase(url:string):Sql {
 return postgres(url,{max:5,prepare:false,ssl:'require',connect_timeout:15,idle_timeout:30,connection:{statement_timeout:10000}});
}
const uuid=(roomId:string,id:string)=>{const h=createHash('sha256').update(roomId+':'+id).digest('hex').slice(0,32);return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20);};
const date=(value:number|null|undefined)=>value==null?null:new Date(value);
export class PostgresRoomRepository implements RoomRepository{
 constructor(private sql:Sql){}
 async create(room:Room):Promise<void>{
  try{await this.sql.begin(async tx=>{await this.persist(tx,room,null);});}
  catch(e){if((e as {code?:string}).code==='23505')throw new DomainError('ROOM_CODE_CONFLICT','Room code already exists.',409);throw e;}
 }
 async findByCode(code:string):Promise<Room|null>{
  const rows=await this.sql<{state:Room|null}[]>`select s.state from public.auction_rooms r left join public.auction_runtime_snapshots s on s.room_id=r.id where r.code=${code}`;
  if(rows.length&&!rows[0]?.state)throw new DomainError('ROOM_RECOVERY_UNAVAILABLE','This room predates the server snapshot format.',409);
  return rows[0]?.state??null;
 }
 async listRecoverable():Promise<Room[]>{
  const rows=await this.sql<{state:Room}[]>`select state from public.auction_runtime_snapshots where state is not null and state ? 'receipts' and state ? 'players'`;
  return rows.map(r=>r.state);
 }
 async commit(room:Room,expectedSequence:number):Promise<void>{
  await this.sql.begin(async tx=>{
   const rows=await tx<{state:Room;sequence:string}[]>`select state,sequence from public.auction_runtime_snapshots where room_id=${room.id} for update`;
   requireThat(Number(rows[0]?.sequence)===expectedSequence,'VERSION_CONFLICT','Room version changed.',409);
   await this.persist(tx,room,rows[0]!.state);
  });
 }
 private async persist(tx:TransactionSql,room:Room,previous:Room|null):Promise<void>{
  const s=room.settings;
  const row={id:room.id,code:room.code,host_user_id:room.hostUserId,name:room.auctionName,status:room.status,
   number_of_teams:s.numberOfTeams,starting_budget_units:s.startingBudgetCr*2,minimum_squad_size:s.minSquadSize,maximum_squad_size:s.maxSquadSize,
   player_timer_seconds:s.playerTimerSeconds,anti_sniping_enabled:s.antiSnipingEnabled,anti_sniping_threshold_seconds:s.antiSnipingThresholdSeconds,
   anti_sniping_reset_seconds:s.antiSnipingResetSeconds,minimum_base_price_units:s.minimumBasePriceCr*2,allow_custom_bids:s.allowCustomBids};
  if(!previous)await tx`insert into public.auction_rooms ${tx({...row,created_at:new Date(room.createdAt)})}`;
  else await tx`update public.auction_rooms set ${tx(row)}, started_at=coalesce(started_at,${room.status!=='LOBBY'?new Date():null}),completed_at=coalesce(completed_at,${room.status==='COMPLETED'?new Date():null}) where id=${room.id}`;
  const existing=new Set(previous?.teams.map(t=>t.id)??[]);
  for(const team of room.teams){
   const member={id:team.id,room_id:room.id,user_id:team.userId,team_name:team.name,team_logo_url:team.logoUrl??null,
    role:team.userId===room.hostUserId?'HOST':'PLAYER',status:'JOINED',starting_budget_units:team.startingBudgetUnits,
    spent_units:team.spentUnits,remaining_budget_units:team.startingBudgetUnits-team.spentUnits,players_owned:team.playerIds.length};
   if(!existing.has(team.id))await tx`insert into public.room_members ${tx(member)}`;
   else await tx`update public.room_members set ${tx(member)} where id=${team.id}`;
  }
  for(const old of previous?.teams??[])if(!room.teams.some(t=>t.id===old.id))await tx`delete from public.room_members where id=${old.id} and room_id=${room.id}`;
  if(room.players.length&&!(previous?.players.length)){
   const pots=[...new Set(room.players.map(p=>p.potId))].map((name,i)=>({id:uuid(room.id,'pot:'+name),room_id:room.id,name,sort_order:i}));
   if(pots.length)await tx`insert into public.auction_pots ${tx(pots)}`;
   await tx`insert into public.auction_pool ${tx(room.players.map((p,i)=>({id:uuid(room.id,p.id),room_id:room.id,player_id:p.id,pot_id:uuid(room.id,'pot:'+p.potId),queue_order:i,status:p.status,base_price_units:p.basePriceUnits})))}`;
  }else{
   // Resolve the old active row before activating its replacement (partial unique ACTIVE index).
   const changed=room.players.filter(p=>previous?.players.find(old=>old.id===p.id)?.status!==p.status).sort((a,b)=>Number(a.status==='ACTIVE')-Number(b.status==='ACTIVE'));
   for(const p of changed){
    const purchase=room.purchases.find(v=>v.playerId===p.id);
    await tx`update public.auction_pool set status=${p.status},final_price_units=${purchase?.priceUnits??null},winning_team_id=${purchase?.teamId??null},auctioned_at=${purchase?date(purchase.at):null} where room_id=${room.id} and player_id=${p.id}`;
   }
  }
  const bids=room.bids.filter(b=>!previous?.bids.some(old=>old.id===b.id));
  if(bids.length)await tx`insert into public.auction_bids ${tx(bids.map(b=>({id:b.id,room_id:room.id,auction_pool_id:uuid(room.id,b.playerId),player_id:b.playerId,user_id:room.teams.find(t=>t.id===b.teamId)!.userId,team_id:b.teamId,amount_units:b.amountUnits,created_at:new Date(b.at),sequence:room.sequence})))}`;
  const purchases=room.purchases.filter(p=>!previous?.purchases.some(old=>old.id===p.id));
  if(purchases.length)await tx`insert into public.player_purchases ${tx(purchases.map(p=>({id:p.id,room_id:room.id,auction_pool_id:uuid(room.id,p.playerId),player_id:p.playerId,team_id:p.teamId,user_id:room.teams.find(t=>t.id===p.teamId)!.userId,price_units:p.priceUnits,purchased_at:new Date(p.at)})))}`;
  const a=room.active;
  const snapshot={room_id:room.id,active_pool_item_id:a?uuid(room.id,a.playerId):null,current_bid_units:a?.currentBidUnits??null,highest_bidder_team_id:a?.highestBidderTeamId??null,
   started_at:date(a?.startedAt),ends_at:date(a?.endsAt),remaining_time_ms:a?.remainingTimeMs??null,sequence:room.sequence,state:tx.json(JSON.parse(JSON.stringify(room)))};
  if(!previous)await tx`insert into public.auction_runtime_snapshots ${tx(snapshot)}`;
  else await tx`update public.auction_runtime_snapshots set ${tx(snapshot)} where room_id=${room.id}`;
  if(room.status==='COMPLETED'&&previous?.status!=='COMPLETED')await tx`insert into public.auction_result_snapshots (room_id,summary) values (${room.id},${tx.json(JSON.parse(JSON.stringify(calculateResults(room))))}) on conflict (room_id) do update set summary=excluded.summary,generated_at=now()`;
 }
}
interface PlayerRow {id:string;name:string;position:string;overall:number;pace:number|null;shooting:number|null;passing:number|null;dribbling:number|null;defending:number|null;physical:number|null;base_price_units:string;club:string|null;nationality:string|null;age:number|null;preferred_foot:string|null;image_url:string|null;metadata:Record<string,unknown>|null}
export class PostgresPlayerRepository implements PlayerRepository{
 constructor(private sql:Sql){}
 private map(p:PlayerRow):Player{
  const position=p.position==='GK'?'GK':['CB','LB','RB','LWB','RWB'].includes(p.position)?'DEF':['CDM','CM','CAM','LM','RM'].includes(p.position)?'MID':'FWD';
  return {id:p.id,name:p.name,position,ovr:p.overall,basePriceUnits:Math.max(1,Number(p.base_price_units)),
   stats:Object.fromEntries(Object.entries({pace:p.pace,shooting:p.shooting,passing:p.passing,dribbling:p.dribbling,defending:p.defending,physical:p.physical}).filter((entry):entry is [string,number]=>entry[1]!==null)),
   potId:typeof p.metadata?.pot==='string'?p.metadata.pot:position,club:p.club??undefined,nationality:p.nationality??undefined,age:p.age??undefined,preferredFoot:p.preferred_foot??undefined,photoUrl:p.image_url??undefined};
 }
 async listPlayerPool(config:RoomSettings['playerPoolConfig'], _teamCount?: number):Promise<Player[]>{
  const rows=await this.sql<PlayerRow[]>`select * from public.football_players where active=true order by overall desc,name,id limit 2000`;
  return rows.map(p=>this.map(p)).filter(p=>(!config.playerIds||config.playerIds.includes(p.id))&&(!config.potIds||config.potIds.includes(p.potId)));
 }
 async getPlayer(id:string):Promise<Player|null>{const rows=await this.sql<PlayerRow[]>`select * from public.football_players where id=${id}`;return rows[0]?this.map(rows[0]):null;}
 getPlayersByPot(potId:string){return this.listPlayerPool({potIds:[potId]});}
}
