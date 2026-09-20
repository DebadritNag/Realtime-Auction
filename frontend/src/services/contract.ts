import type { Player,Team,AuctionRoom,RoomSettings,AISuggestion } from '@/types';
import type { PlayerDTO,RoomStateDTO,SettingsDTO,RecommendationDTO } from '@/types/backend';
export function mapPlayer(p:PlayerDTO,s:RoomStateDTO):Player{
 const purchase=s.soldPlayers.find(sale=>sale.playerId===p.id);
 const stat=(short:string,long:string)=>p.stats[short]??p.stats[long]??null;
 return {id:p.id,name:p.name,ovr:p.ovr,position:p.position==='FWD'?'ATT':p.position,
 club:p.club??'',nationality:p.nationality??'',flagEmoji:'',age:p.age??null,preferredFoot:p.preferredFoot??null,
 basePrice:p.basePriceCr,stats:{pac:stat('pac','pace'),sho:stat('sho','shooting'),pas:stat('pas','passing'),dri:stat('dri','dribbling'),def:stat('def','defending'),phy:stat('phy','physical')},
 pot:p.potId,photoUrl:p.photoUrl,status:({WAITING:'waiting',ACTIVE:'live',SOLD:'sold',UNSOLD:'unsold',SKIPPED:'skipped'} as const)[p.status],
 soldPrice:purchase?.priceCr,soldToTeamId:purchase?.teamId,soldToTeamName:s.teams.find(t=>t.id===purchase?.teamId)?.name};
}
export function mapTeams(s:RoomStateDTO):Team[]{
 const players=s.players.map(p=>mapPlayer(p,s));
 return s.teams.map((t,i)=>{
  const squad=players.filter(p=>t.playerIds.includes(p.id));
  return {id:t.id,name:t.name,shortName:t.name.split(/\s+/).map(x=>x[0]).join('').slice(0,4).toUpperCase(),
   logo:t.logoEmoji??'⚽',accentColor:['#00ff87','#38bdf8','#f59e0b','#a78bfa'][i%4],managerId:t.userId,
   managerUsername:t.userId===s.currentUserTeam.userId?'You':'Manager '+(i+1),isCurrentUser:t.id===s.currentUserTeam.id,
   budgetTotal:t.startingBudgetCr,budgetSpent:t.spentCr,budgetRemaining:t.remainingBudgetCr,squadCount:t.playersOwned,squad,
   positions:{gk:squad.filter(p=>p.position==='GK').length,def:squad.filter(p=>p.position==='DEF').length,mid:squad.filter(p=>p.position==='MID').length,att:squad.filter(p=>p.position==='ATT').length,total:squad.length},
   ready:false,connected:s.connectedUsers.includes(t.userId)};
 });
}
export function mapSettings(s:SettingsDTO,name:string):RoomSettings{
 return {auctionName:name,numberOfTeams:s.numberOfTeams,startingBudget:s.startingBudgetCr,minSquadSize:s.minSquadSize,maxSquadSize:s.maxSquadSize,
 playerTimerSeconds:s.playerTimerSeconds,antiSnipingEnabled:s.antiSnipingEnabled,antiSnipingThresholdSeconds:s.antiSnipingThresholdSeconds,
 timerResetDurationSeconds:s.antiSnipingResetSeconds,minPlayerBasePrice:s.minimumBasePriceCr,playerPoolSource:'default'};
}
export function settingsToDTO(s:Partial<RoomSettings>):Partial<SettingsDTO>{
 return Object.fromEntries(Object.entries({numberOfTeams:s.numberOfTeams,startingBudgetCr:s.startingBudget,minSquadSize:s.minSquadSize,maxSquadSize:s.maxSquadSize,
 playerTimerSeconds:s.playerTimerSeconds,antiSnipingEnabled:s.antiSnipingEnabled,antiSnipingThresholdSeconds:s.antiSnipingThresholdSeconds,
 antiSnipingResetSeconds:s.timerResetDurationSeconds,minimumBasePriceCr:s.minPlayerBasePrice}).filter(([,v])=>v!==undefined));
}
export function mapRoom(s:RoomStateDTO):AuctionRoom{
 return {roomCode:s.roomCode,name:s.room.auctionName,hostId:s.host.userId,hostUsername:s.teams.find(t=>t.userId===s.host.userId)?.name??'Host',
 status:s.status==='RUNNING'?'LIVE':s.status,settings:mapSettings(s.settings,s.room.auctionName),teams:mapTeams(s),createdAt:new Date(s.room.createdAt).toISOString(),
 participants:s.teams.map(t=>({userId:t.userId,username:t.name,teamId:t.id,teamName:t.name,isHost:t.userId===s.host.userId,connected:s.connectedUsers.includes(t.userId),ready:false}))};
}
export const mapRecommendation=(r:RecommendationDTO):AISuggestion=>({recommendedRange:[r.recommendedMinCr,r.recommendedMaxCr],suggestedCeiling:r.suggestedCeilingCr,
 reasons:r.reasons,warnings:r.warnings,riskLevel:r.budgetRisk==='LOW'?'LOW RISK':r.budgetRisk==='HIGH'?'HIGH RISK':'BALANCED'});
