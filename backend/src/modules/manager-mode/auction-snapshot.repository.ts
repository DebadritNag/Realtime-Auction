import type {Sql,TransactionSql} from 'postgres';
import type {Database} from '../../types/database.generated.js';
import type {Room} from '../../domain/types.js';
import {settingsSchema} from '../../schemas/settings.js';
import {requireThat} from '../../domain/errors.js';
type Row<K extends keyof Database['public']['Tables']>=Database['public']['Tables'][K]['Row'];
export type Db=Sql|TransactionSql;
/** Completed auctions are read as independent team and pool queries, never a team/player cross join. */
export async function readCompletedAuction(db:Db,id:string):Promise<Room|null>{
 const [room]=await db<Row<'auction_rooms'>[]>`select * from public.auction_rooms where id=${id}`;if(!room)return null;
 requireThat(room.status==='COMPLETED','AUCTION_NOT_COMPLETED','Complete the auction first.');
 const [teams,pool]=await Promise.all([
 db<(Row<'room_members'>&{username:string|null})[]>`select m.*,p.username from public.room_members m join public.profiles p on p.id=m.user_id where m.room_id=${id} and m.status='JOINED' order by m.id`,
 db<(Row<'auction_pool'>&{player:Row<'football_players'>})[]>`select a.*,row_to_json(p) as player from public.auction_pool a join public.football_players p on p.id=a.player_id where a.room_id=${id} order by a.queue_order`
 ]);
 const settings=settingsSchema.parse({numberOfTeams:room.number_of_teams,startingBudgetCr:Number(room.starting_budget_units)/2,minSquadSize:room.minimum_squad_size,maxSquadSize:room.maximum_squad_size,minimumBasePriceCr:Number(room.minimum_base_price_units)/2,playerTimerSeconds:room.player_timer_seconds});
 return {id:room.id,code:room.code,hostUserId:room.host_user_id,auctionName:room.name,status:'COMPLETED',createdAt:new Date(room.created_at).getTime(),settings,
 teams:teams.map(t=>({id:t.id,userId:t.user_id,managerUsername:t.username??undefined,name:t.team_name,logoUrl:t.team_logo_url??undefined,startingBudgetUnits:Number(t.starting_budget_units),spentUnits:Number(t.spent_units),playerIds:pool.filter(p=>p.status==='SOLD'&&p.winning_team_id===t.id).map(p=>p.player_id)})),
 players:pool.map(a=>{const p=a.player;const category=p.position==='GK'?'GK':['CB','LB','RB','LWB','RWB'].includes(p.position)?'DEF':['CDM','CM','CAM','LM','RM'].includes(p.position)?'MID':'ATT';return {id:p.id,externalId:p.external_id??undefined,name:p.name,ovr:p.overall,position:category,subPosition:p.position,secondaryPositions:p.secondary_positions?.join(',')??'',club:p.club??undefined,nationality:p.nationality??undefined,photoUrl:p.image_url??undefined,age:p.age??undefined,stats:Object.fromEntries(['pace','shooting','passing','dribbling','defending','physical'].flatMap(k=>{const v=p[k as keyof typeof p];return typeof v==='number'?[[k,v]]:[];})),basePriceUnits:Number(a.base_price_units),potId:a.pot_id??'default',status:a.status as Room['players'][number]['status'],round:1};}),
 purchases:pool.filter(p=>p.status==='SOLD').map(p=>({id:p.id,playerId:p.player_id,teamId:p.winning_team_id!,priceUnits:Number(p.final_price_units),at:new Date(p.auctioned_at??room.completed_at??room.created_at).getTime(),durationMs:0,bidCount:0})),bids:[],active:null,playerQueue:[],sequence:1,nextPlayerAt:null,receipts:{}};
}
