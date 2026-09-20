import type {FastifyInstance} from 'fastify';
import type {Sql} from 'postgres';
import {z} from 'zod';
import type {RoomManager} from '../rooms/room.manager.js';
import {toCr} from '../../domain/money.js';
export function registerProfileRoutes(app:FastifyInstance,manager:RoomManager,sql?:Sql){
 app.get('/api/profile',async req=>{
  if(!sql)return {username:req.auth.username??'',displayName:req.auth.username??'',avatarUrl:'',defaultTeamName:'',defaultTeamLogo:'⚽'};
  const rows=await sql`select username,display_name,avatar_url,default_team_name,default_team_logo_url from public.profiles where id=${req.auth.userId}`;
  const p=rows[0];return {username:p?.username??req.auth.username??'',displayName:p?.display_name??p?.username??'',avatarUrl:p?.avatar_url??'',defaultTeamName:p?.default_team_name??'',defaultTeamLogo:p?.default_team_logo_url??'⚽'};
 });
 app.patch('/api/profile',async req=>{
  const input=z.object({displayName:z.string().trim().min(1).max(60),defaultTeamName:z.string().trim().min(2).max(60),defaultTeamLogo:z.string().min(1).max(32)}).strict().parse(req.body);
  if(sql)await sql`update public.profiles set display_name=${input.displayName},default_team_name=${input.defaultTeamName},default_team_logo_url=${input.defaultTeamLogo} where id=${req.auth.userId}`;
  return input;
 });
 const roomsFor=async(id:string)=>(await manager.repository.listRecoverable()).filter(r=>r.teams.some(t=>t.userId===id));
 app.get('/api/profile/stats',async req=>{
  const rooms=await roomsFor(req.auth.userId);
  const purchases=rooms.flatMap(room=>room.purchases.filter(p=>room.teams.find(t=>t.id===p.teamId)?.userId===req.auth.userId).map(p=>({...p,room})));
  const spend=purchases.reduce((sum,p)=>sum+p.priceUnits,0);
  const highest=[...purchases].sort((a,b)=>b.priceUnits-a.priceUnits)[0];
  return {auctionsPlayed:rooms.filter(r=>r.status==='COMPLETED').length,auctionsWon:null,playersPurchased:purchases.length,
   totalSpend:toCr(spend),averagePurchase:purchases.length?toCr(spend)/purchases.length:0,roomsHosted:rooms.filter(r=>r.hostUserId===req.auth.userId).length,
   highestPurchase:highest?{playerName:highest.room.players.find(p=>p.id===highest.playerId)?.name??'',price:toCr(highest.priceUnits),auctionName:highest.room.auctionName,date:new Date(highest.at).toISOString().slice(0,10)}:null};
 });
 app.get('/api/profile/history',async req=>(await roomsFor(req.auth.userId)).map(room=>{
  const team=room.teams.find(t=>t.userId===req.auth.userId)!;
  return {id:room.id,auctionName:room.auctionName,roomCode:room.code,date:new Date(room.createdAt).toISOString().slice(0,10),teamUsed:team.name,playersPurchased:team.playerIds.length,moneySpent:toCr(team.spentUnits),status:room.status==='COMPLETED'?'COMPLETED':room.status==='CLOSED'?'ABANDONED':'ACTIVE'};
 }));
 app.get('/api/profile/achievements',async req=>{
  if(!sql)return [];
  const rows=await sql`select a.id,a.name,a.description,a.icon_key,u.unlocked_at from public.achievements a left join public.user_achievements u on u.achievement_id=a.id and u.user_id=${req.auth.userId} where a.active=true order by a.name`;
  return rows.map(r=>({id:r.id,title:r.name,description:r.description,icon:r.icon_key??'🏆',unlocked:!!r.unlocked_at,unlockedAt:r.unlocked_at??undefined}));
 });
}
