import {loadSeasons,persistSeasons} from './seasons/season.persistence.js';
import {loadBuyouts,persistBuyouts} from './buyout/buyout.persistence.js';
import {loadNegotiations,persistNegotiations} from './negotiation/negotiation.persistence.js';
import {ensureNegotiations} from './negotiation/negotiation.engine.js';
import {randomUUID} from 'node:crypto';
import type {Sql,TransactionSql} from 'postgres';
import type {Database,Json} from '../../types/database.generated.js';
import {DomainError,requireThat} from '../../domain/errors.js';
import type {Tournament,ManagerPlayer} from './manager.types.js';
import type {ManagerTournamentRepository,ManagerIdentityRepository} from './manager.repository.js';
import type {ManagerAction} from './manager.schemas.js';
import type {Db} from './auction-snapshot.repository.js';
type Tables=Database['public']['Tables'];type Row<K extends keyof Tables>=Tables[K]['Row'];
const ms=(v:string|Date)=>new Date(v).getTime();
const json=(db:Db,value:unknown)=>db.json(JSON.parse(JSON.stringify(value)) as Json);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface EventMetadata {sequence?:number;receipt?:{key:string;fingerprint:string};action?:Partial<ManagerAction>;initial?:{startingSnapshot:Tournament['startingSnapshot'];code:string;name:string;budgetMode:Tournament['budgetMode']}}
export function managerDbError(error:unknown):never{
 if(error instanceof DomainError)throw error;const e=error as {code?:string;message?:string};
 if(e.code==='23503')throw new DomainError('INVALID_REFERENCE','A referenced auction, profile, team or player is missing.',409);
 if(e.code==='23505')throw new DomainError('DUPLICATE_MANAGER_RESOURCE','This tournament resource already exists.',409);
 if(e.code==='23514'||e.code==='22P02')throw new DomainError('INVALID_MANAGER_DATA','The submitted data does not match the tournament rules.',400);
 if(e.code==='P0001'&&e.message?.includes('ownership changed'))throw new DomainError('TRADE_OWNERSHIP_CHANGED','Player ownership changed before this trade completed.',409);
 if(e.code==='P0001'&&e.message?.includes('not PENDING'))throw new DomainError('TRADE_NOT_PENDING','The trade is no longer pending.',409);
 throw new DomainError('MANAGER_DATABASE_UNAVAILABLE','Tournament storage is temporarily unavailable. Retry with the same request ID.',503);
}
export class PostgresManagerIdentityRepository implements ManagerIdentityRepository{
 constructor(private db:Sql){}
 async findUsernames(ids:string[]){if(!ids.length)return {};const rows=await this.db<{id:string;username:string}[]>`select id,username from public.profiles where id in ${this.db(ids)}`;return Object.fromEntries(rows.map(r=>[r.id,r.username]));}
}
/** Normalized durable aggregate; every writer first locks the tournament row. */
export class PostgresManagerTournamentRepository implements ManagerTournamentRepository{
 constructor(readonly db:Sql){}
 async find(id:string){if(!uuid.test(id))return null;try{return await this.db.begin('isolation level repeatable read read only',tx=>this.load(tx,id));}catch(e){return managerDbError(e);}}
 async findByAuction(id:string){if(!uuid.test(id))return null;try{const [row]=await this.db<{id:string}[]>`select id from public.manager_tournaments where source_auction_id=${id}`;return row?this.find(row.id):null;}catch(e){return managerDbError(e);}}
 async listForUser(user:string){try{const rows=await this.db<{id:string}[]>`select t.id from public.manager_tournaments t join public.manager_tournament_members m on m.tournament_id=t.id where m.user_id=${user} order by t.updated_at desc`;return (await Promise.all(rows.map(r=>this.find(r.id)))).filter((t):t is Tournament=>t!==null);}catch(e){return managerDbError(e);}}
 private async load(db:Db,id:string):Promise<Tournament|null>{
 const [t]=await db<(Row<'manager_tournaments'>&{current_season_id:string|null})[]>`select * from public.manager_tournaments where id=${id}`;if(!t)return null;
 const [teams,members,players,fixtures,trades,transactions,notifications,events,windows]=await Promise.all([
 db<Row<'manager_tournament_teams'>[]>`select * from public.manager_tournament_teams where tournament_id=${id} order by id`,
 db<Row<'manager_tournament_members'>[]>`select * from public.manager_tournament_members where tournament_id=${id}`,
 db<Row<'manager_tournament_players'>[]>`select * from public.manager_tournament_players where tournament_id=${id} order by overall desc,name,id`,
 db<(Row<'manager_fixtures'>&{season_id:string})[]>`select * from public.manager_fixtures where tournament_id=${id} order by matchday,id`,
 db<Row<'manager_trade_offers'>[]>`select * from public.manager_trade_offers where tournament_id=${id} order by created_at,id`,
 db<(Row<'manager_transfer_transactions'>&{related_buyout_id:string|null})[]>`select * from public.manager_transfer_transactions where tournament_id=${id} order by created_at,id`,
 db<Row<'manager_notifications'>[]>`select * from public.manager_notifications where tournament_id=${id} order by created_at,id`,
 db<Row<'manager_tournament_events'>[]>`select * from public.manager_tournament_events where tournament_id=${id} order by id`,
 db<Row<'manager_transfer_windows'>[]>`select * from public.manager_transfer_windows where tournament_id=${id} and status='OPEN'`
 ]);
 const initial=(events.find(e=>e.event_type==='MANAGER_MODE_CREATED')?.metadata as unknown as EventMetadata)?.initial;
 requireThat(initial,'MANAGER_SNAPSHOT_MISSING','This tournament lacks the application snapshot metadata.',409);
 const receipts:Tournament['receipts']={};let sequence=1;for(const e of events){const m=e.metadata as unknown as EventMetadata|null;if(m?.receipt)receipts[m.receipt.key]={fingerprint:m.receipt.fingerprint};sequence=Math.max(sequence,m?.sequence??1);}
 return {seasonData:await loadSeasons(db,id,t.current_season_id),buyouts:await loadBuyouts(db,id),negotiation:await loadNegotiations(db,id),id:t.id,sourceAuctionId:t.source_auction_id,sourceAuctionCode:initial.code,sourceAuctionName:initial.name,name:t.name,hostUserId:t.host_user_id,status:t.status as Tournament['status'],format:t.fixture_format as Tournament['format'],budgetMode:initial.budgetMode,startingBudgetUnits:Number(t.starting_transfer_budget_units),createdAt:ms(t.created_at),updatedAt:ms(t.updated_at),sequence,transferWindowOpen:windows.length>0,startingSnapshot:initial.startingSnapshot,receipts,
 teams:teams.map(r=>{const original=initial.startingSnapshot.teams.find(x=>x.id===r.id);requireThat(original,'INVALID_MANAGER_DATA','Team snapshot is missing.',409);const status=members.find(m=>m.team_id===r.id&&m.user_id===r.manager_user_id)?.status;return {...original,name:r.team_name,logoUrl:r.team_logo_url??'',managerUserId:r.manager_user_id,invitation:status==='INVITED'?'PENDING':status as 'JOINED'|'DECLINED',transferBudgetUnits:Number(r.current_transfer_budget_units)};}),
 players:players.map(r=>{const original=initial.startingSnapshot.players.find(p=>p.id===r.id);const last=transactions.filter(x=>x.player_id===r.id).at(-1);return {id:r.id,name:r.name,overall:r.overall,position:r.primary_position,category:r.auction_category,secondaryPositions:r.secondary_positions?.join(',')??'',club:r.club??'',nationality:r.nationality??'',imageUrl:r.image_url??'',...(r.age!==null?{age:r.age}:{}),stats:Object.fromEntries(['pace','shooting','passing','dribbling','defending','physical'].flatMap(k=>{const value=r[k as keyof typeof r];return typeof value==='number'?[[k,value]]:[];})),tier:r.tier??'',source:r.source as ManagerPlayer['source'],currentTeamId:r.current_team_id,ownershipStatus:r.ownership_status as ManagerPlayer['ownershipStatus'],availability:r.current_team_id?'SIGNED':'AVAILABLE',auctionPurchasePriceUnits:r.auction_purchase_price_units===null?null:Number(r.auction_purchase_price_units),acquisitionType:last?.type==='RELEASE'?null:last?.type==='AUCTION_IMPORT'?'AUCTION_PURCHASE':last?.type as ManagerPlayer['acquisitionType']??null,acquisitionPriceUnits:last&&last.type!=='RELEASE'?Number(last.amount_units??0):null,metadata:{...original?.metadata,sourcePlayerId:r.source_player_id,sourceAuctionPlayerId:r.source_auction_player_id,externalSourceKey:r.external_source_key}};}),
 fixtures:fixtures.map(f=>({id:f.id,seasonId:f.season_id,matchday:f.matchday,homeTeamId:f.home_team_id,awayTeamId:f.away_team_id,homeScore:f.home_score,awayScore:f.away_score,status:f.status as Tournament['fixtures'][number]['status'],scheduledAt:null,completedAt:f.completed_at?ms(f.completed_at):null})),
 trades:trades.map(r=>({id:r.id,fromTeamId:r.from_team_id,toTeamId:r.to_team_id,offeredPlayerId:r.offered_player_id,requestedPlayerId:r.requested_player_id,status:r.status as Tournament['trades'][number]['status'],parentTradeId:r.parent_trade_id,createdBy:r.created_by,createdAt:ms(r.created_at),updatedAt:ms(r.updated_at)})),
 transactions:transactions.map(r=>({id:r.id,playerId:r.player_id,fromTeamId:r.from_team_id,toTeamId:r.to_team_id!,type:r.type==='AUCTION_IMPORT'?'AUCTION_PURCHASE':r.type as Tournament['transactions'][number]['type'],amountUnits:Number(r.amount_units??0),tradeId:r.related_trade_id,buyoutId:r.related_buyout_id,at:ms(r.created_at)})),
 notifications:notifications.map(n=>({id:n.id,userId:n.user_id,type:n.type,title:n.title,message:n.message,read:n.read_at!==null,createdAt:ms(n.created_at),metadata:(n.metadata??{}) as Record<string,string>})),
 audit:events.map(e=>({id:String(e.id),type:e.event_type,userId:e.actor_user_id??'',at:ms(e.created_at),detail:JSON.stringify((e.metadata as unknown as EventMetadata)?.action??{})}))};
 }
 async createUnique(input:Tournament){try{return await this.db.begin(async tx=>{
 // Lock the existing source row: concurrent requests for one auction serialize before unique insertion.
 const [source]=await tx<{host_user_id:string;status:string}[]>`select host_user_id,status from public.auction_rooms where id=${input.sourceAuctionId} for update`;
 requireThat(source?.status==='COMPLETED'&&source.host_user_id===input.hostUserId,'INVALID_AUCTION_SNAPSHOT','Completed auction and host must match the database.',409);
 const [existing]=await tx<{id:string}[]>`select id from public.manager_tournaments where source_auction_id=${input.sourceAuctionId}`;if(existing)return {tournament:(await this.load(tx,existing.id))!,created:false};
 const t=structuredClone(input);const pool=await tx<{id:string;player_id:string}[]>`select id,player_id from public.auction_pool where room_id=${t.sourceAuctionId}`;
 const playerIds=new Map(t.players.map(p=>[p.id,randomUUID()]));for(const p of t.players){const old=p.id;p.id=playerIds.get(old)!;p.metadata={...p.metadata,...(p.source==='EXTERNAL_POOL'?{externalSourceKey:old}:{sourcePlayerId:old,sourceAuctionPlayerId:pool.find(x=>x.player_id===old)?.id})};if(p.source!=='EXTERNAL_POOL')requireThat(p.metadata.sourceAuctionPlayerId,'INVALID_REFERENCE','Auction pool player is missing.',409);}
 for(const tr of t.transactions)tr.playerId=playerIds.get(tr.playerId)!;
 t.negotiation=undefined;ensureNegotiations(t);
 t.startingSnapshot=structuredClone({teams:t.teams,players:t.players,auctionSequence:t.startingSnapshot.auctionSequence,importReport:t.startingSnapshot.importReport});
 await tx`insert into public.manager_tournaments ${tx({id:t.id,source_auction_id:t.sourceAuctionId,name:t.name,host_user_id:t.hostUserId,status:t.status,fixture_format:t.format,starting_transfer_budget_units:t.startingBudgetUnits,created_at:new Date(t.createdAt)})}`;
 await tx`insert into public.manager_tournament_teams ${tx(t.teams.map(r=>({id:r.id,tournament_id:t.id,source_auction_team_id:r.sourceAuctionTeamId,team_name:r.name,team_logo_url:r.logoUrl||null,manager_user_id:r.managerUserId,starting_transfer_budget_units:r.transferBudgetUnits,current_transfer_budget_units:r.transferBudgetUnits})))}`;
 await tx`insert into public.manager_tournament_members ${tx(t.teams.map(r=>({tournament_id:t.id,team_id:r.id,user_id:r.managerUserId,role:r.managerUserId===t.hostUserId?'HOST':'MANAGER',status:r.invitation==='PENDING'?'INVITED':r.invitation})))}`;
 const invites=t.teams.filter(r=>r.managerUserId!==t.hostUserId);if(invites.length)await tx`insert into public.manager_tournament_invitations ${tx(invites.map(r=>({tournament_id:t.id,team_id:r.id,user_id:r.managerUserId,invited_by:t.hostUserId,status:'PENDING'})))}`;
 if(t.players.length)await tx`insert into public.manager_tournament_players ${tx(t.players.map(p=>({id:p.id,tournament_id:t.id,source_player_id:p.metadata.sourcePlayerId as string??null,source_auction_player_id:p.metadata.sourceAuctionPlayerId as string??null,external_source_key:p.metadata.externalSourceKey as string??null,name:p.name,overall:p.overall,primary_position:p.position,auction_category:p.category,secondary_positions:p.secondaryPositions.split(',').map(v=>v.trim()).filter(Boolean),club:p.club||null,nationality:p.nationality||null,age:p.age??null,image_url:p.imageUrl||null,tier:p.tier||null,source:p.source,ownership_status:p.ownershipStatus,current_team_id:p.currentTeamId,auction_purchase_price_units:p.auctionPurchasePriceUnits,manager_mode_acquisition_price_units:null,pace:p.stats.pace??null,shooting:p.stats.shooting??null,passing:p.stats.passing??null,dribbling:p.stats.dribbling??null,defending:p.stats.defending??null,physical:p.stats.physical??null})))}`;
 if(t.transactions.length)await tx`insert into public.manager_transfer_transactions ${tx(t.transactions.map(r=>({id:r.id,tournament_id:t.id,player_id:r.playerId,from_team_id:null,to_team_id:r.toTeamId,type:'AUCTION_IMPORT',amount_units:r.amountUnits,created_at:new Date(r.at)})))}`;
 const report=t.startingSnapshot.importReport;
 if(report?.rowsDetected){const importId=randomUUID();await tx`insert into public.manager_external_player_imports ${tx({id:importId,tournament_id:t.id,uploaded_by:t.hostUserId,filename:'external-player-upload.csv',status:'COMPLETED',total_rows:report.rowsDetected,valid_rows:report.validPlayers,invalid_rows:report.invalidRows.length,duplicate_rows:report.duplicates})}`;
 if(report.auditRows?.length)await tx`insert into public.manager_external_player_import_rows ${tx(report.auditRows.map(r=>({import_id:importId,row_number:r.row,external_player_id:r.externalId,player_name:r.name,status:r.status,error_message:r.reason})))}`;}
 await persistSeasons(tx,t);
 await persistNegotiations(tx,t);
 await this.notifications(tx,t,[]);
 await tx`insert into public.manager_tournament_events (tournament_id,event_type,actor_user_id,metadata) values (${t.id},'MANAGER_MODE_CREATED',${t.hostUserId},${json(tx,{sequence:1,initial:{startingSnapshot:t.startingSnapshot,code:t.sourceAuctionCode,name:t.sourceAuctionName,budgetMode:t.budgetMode}})})`;
 return {tournament:(await this.load(tx,t.id))!,created:true};
 });}catch(e){return managerDbError(e);}}
 async mutate(id:string,change:(draft:Tournament)=>Promise<void>|void){try{return await this.db.begin(async tx=>{
 const lock=await tx`select id from public.manager_tournaments where id=${id} for update`;requireThat(lock.length,'TOURNAMENT_NOT_FOUND','Tournament not found.',404);
 const before=(await this.load(tx,id))!,draft=structuredClone(before);await change(draft);if(draft.sequence===before.sequence)return before;
 const audit=draft.audit.at(-1)!;const action=JSON.parse(audit.detail) as ManagerAction;const actor=audit.userId;
 const accepted=draft.trades.find(t=>t.status==='ACCEPTED'&&before.trades.find(b=>b.id===t.id)?.status==='PENDING');
 const rpc=action.type==='SCORE'||action.type==='CONFIRM_SIGNING'||Boolean(accepted);
 const oldEvent=await tx<{max:string|null}[]>`select max(id) from public.manager_tournament_events where tournament_id=${id}`;
 if(action.type==='SCORE')await tx`select public.save_fixture_result(${action.fixtureId}::uuid,${action.homeScore}::int,${action.awayScore}::int,${actor}::uuid)`;
 if(accepted)await tx`select public.accept_manager_trade(${accepted.id}::uuid,${actor}::uuid)`;
 await tx`update public.manager_tournaments set status=${draft.status},updated_at=now() where id=${id}`;
 for(const team of draft.teams){const prior=before.teams.find(t=>t.id===team.id)!;if(prior.invitation!==team.invitation){await tx`update public.manager_tournament_members set status=${team.invitation==='PENDING'?'INVITED':team.invitation},joined_at=case when ${team.invitation}='JOINED' then now() else joined_at end where tournament_id=${id} and user_id=${team.managerUserId}`;await tx`update public.manager_tournament_invitations set status=${team.invitation},responded_at=case when ${team.invitation}='PENDING' then null else now() end where tournament_id=${id} and user_id=${team.managerUserId}`;}}
 await persistSeasons(tx,draft,before);
 const added=draft.fixtures.filter(f=>!before.fixtures.some(x=>x.id===f.id));if(added.length)await tx`insert into public.manager_fixtures ${tx(added.map(f=>({id:f.id,tournament_id:id,season_id:f.seasonId!,matchday:f.matchday,home_team_id:f.homeTeamId,away_team_id:f.awayTeamId,status:f.status})))}`;
 if(action.type==='RESET_SCORE')await tx`update public.manager_fixtures set home_score=null,away_score=null,status='SCHEDULED',completed_at=null where id=${action.fixtureId} and tournament_id=${id}`;
 if(before.transferWindowOpen!==draft.transferWindowOpen){if(draft.transferWindowOpen)await tx`insert into public.manager_transfer_windows(tournament_id,opened_by,status) values(${id},${actor},'OPEN')`;else await tx`update public.manager_transfer_windows set status='CLOSED',closed_at=now(),closed_by=${actor} where tournament_id=${id} and status='OPEN'`;}
 for(const trade of draft.trades){const prior=before.trades.find(t=>t.id===trade.id);if(!prior)await tx`insert into public.manager_trade_offers ${tx({id:trade.id,tournament_id:id,from_team_id:trade.fromTeamId,to_team_id:trade.toTeamId,offered_player_id:trade.offeredPlayerId,requested_player_id:trade.requestedPlayerId,parent_trade_id:trade.parentTradeId,created_by:trade.createdBy,status:trade.status})}`;else if(prior.status!==trade.status&&trade.id!==accepted?.id)await tx`update public.manager_trade_offers set status=${trade.status},resolved_at=now(),updated_at=now() where id=${trade.id} and tournament_id=${id}`;}
 if(accepted)await tx`update public.manager_tournament_players set manager_mode_acquisition_price_units=0 where id in ${tx([accepted.offeredPlayerId,accepted.requestedPlayerId])} and tournament_id=${id}`;
 if(action.type==='CONFIRM_SIGNING'){
 const session=draft.negotiation!.sessions.find(s=>s.id===action.sessionId)!;
 const priorPlayer=before.players.find(p=>p.id===session.playerId)!;
 const lockedPlayer=await tx<{current_team_id:string|null;ownership_status:string}[]>`select current_team_id,ownership_status from public.manager_tournament_players where id=${session.playerId} and tournament_id=${id} for update`;
 requireThat(lockedPlayer[0]?.current_team_id===null&&lockedPlayer[0]?.ownership_status==='FREE_AGENT'&&!priorPlayer.currentTeamId,'PLAYER_ALREADY_SIGNED','This player has already signed.',409);
 const budget=await tx<{current_transfer_budget_units:string}[]>`select current_transfer_budget_units from public.manager_tournament_teams where id=${session.teamId} and tournament_id=${id} for update`;
 requireThat(Number(budget[0]?.current_transfer_budget_units)>=session.lastOfferUnits!,'INSUFFICIENT_BUDGET','Budget changed before signing.',409);
 await tx`update public.manager_tournament_teams set current_transfer_budget_units=current_transfer_budget_units-${session.lastOfferUnits!},updated_at=now() where id=${session.teamId} and tournament_id=${id}`;
 await tx`select public.change_player_ownership(${session.playerId}::uuid,${session.teamId}::uuid,'FREE_AGENT_SIGNING',${session.lastOfferUnits!}::bigint,${actor}::uuid)`;
 await tx`update public.manager_tournament_players set manager_mode_acquisition_price_units=${session.lastOfferUnits!} where id=${session.playerId}`;
 }
 await persistBuyouts(tx,draft,before);
 await persistNegotiations(tx,draft,before);
 await this.notifications(tx,draft,before.notifications);
 const key=Object.keys(draft.receipts).find(k=>!before.receipts[k]);const privateAction=['START_NEGOTIATION','OFFER_FREE_AGENT','END_NEGOTIATION','CONFIRM_SIGNING','DIALOGUE_GENERATED','BUYOUT','BUYOUT_COUNTER','BUYOUT_RESPONSE'].includes(action.type);const meta={sequence:draft.sequence,action:privateAction?{type:action.type}:action,...(key?{receipt:{key,fingerprint:draft.receipts[key]!.fingerprint}}:{})};
 if(rpc)await tx`update public.manager_tournament_events set metadata=coalesce(metadata,'{}'::jsonb)||${json(tx,meta)} where tournament_id=${id} and id>${oldEvent[0]?.max??0}::bigint`;
 else await tx`insert into public.manager_tournament_events(tournament_id,event_type,actor_user_id,metadata) values(${id},${this.eventType(action)},${actor},${json(tx,meta)})`;
 return (await this.load(tx,id))!;
 });}catch(e){return managerDbError(e);}}
 private eventType(a:ManagerAction){switch(a.type){case 'INVITATION':return a.accept?'MEMBER_JOINED':'MEMBER_DECLINED';case 'GENERATE_FIXTURES':return 'FIXTURES_GENERATED';case 'RESET_SCORE':return 'RESULT_EDITED';case 'WINDOW':return a.open?'TRANSFER_WINDOW_OPENED':'TRANSFER_WINDOW_CLOSED';case 'TRADE':return a.parentTradeId?'TRADE_COUNTERED':'TRADE_CREATED';case 'TRADE_RESPONSE':return a.response==='REJECT'?'TRADE_REJECTED':'TRADE_CANCELLED';case 'STATUS':return a.status==='COMPLETED'?'TOURNAMENT_COMPLETED':'TOURNAMENT_STATUS_CHANGED';default:return 'TOURNAMENT_STATUS_CHANGED';}}
 async delete(id:string):Promise<void>{
  try{
   await this.db.begin(async tx=>{
    const [row]=await tx<{id:string}[]>`select id from public.manager_tournaments where id=${id} for update`;
    requireThat(row,'TOURNAMENT_NOT_FOUND','Tournament not found.',404);
    // Remove dependent ledgers/offers first: their player FKs deliberately restrict deletion.
    await tx`delete from public.manager_transfer_transactions where tournament_id=${id}`;
    await tx`delete from public.manager_buyout_offers where tournament_id=${id}`;
    await tx`delete from public.manager_trade_offers where tournament_id=${id}`;
    await tx`delete from public.manager_free_agent_offers where session_id in (select id from public.manager_negotiation_sessions where tournament_id=${id})`;
    await tx`delete from public.manager_negotiation_sessions where tournament_id=${id}`;
    await tx`delete from public.manager_tournaments where id=${id}`;
   });
  }catch(e){return managerDbError(e);}
 }
 private async notifications(db:Db,t:Tournament,previous:Tournament['notifications']){const added=t.notifications.filter(n=>!previous.some(p=>p.id===n.id));const types:Record<string,string>={PLAYER_TRANSFERRED:'PLAYER_TRANSFERRED',INVITATION:'TOURNAMENT_INVITE',MEMBER_UPDATED:'MANAGER_JOINED',GENERATE_FIXTURES:'FIXTURES_GENERATED',SCORE:'RESULT_UPDATED',RESET_SCORE:'RESULT_UPDATED',ANNOUNCEMENT:'TOURNAMENT_ANNOUNCEMENT',TRADE:'TRADE_RECEIVED',TRADE_RESPONSE:'PLAYER_TRANSFERRED',WINDOW:t.transferWindowOpen?'TRANSFER_WINDOW_OPENED':'TRANSFER_WINDOW_CLOSED'};
 if(added.length)await db`insert into public.manager_notifications ${db(added.map(n=>({id:n.id,tournament_id:t.id,user_id:n.userId,type:types[n.type]??'TOURNAMENT_ANNOUNCEMENT',title:n.title,message:n.message,metadata:json(db,{...n.metadata,kind:n.type}),created_at:new Date(n.createdAt)})))}`;
 for(const n of t.notifications)if(n.read&&!previous.find(p=>p.id===n.id)?.read)await db`update public.manager_notifications set read_at=now() where id=${n.id} and user_id=${n.userId}`;
 }
}

export { PostgresManagerTournamentRepository as PostgresManagerRepository };
