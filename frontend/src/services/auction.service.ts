import type { AuctionAnalytics } from '@/types';
import type { RoomStateDTO,ResultsDTO,TeamDTO,PlayerDTO,RecommendationDTO } from '@/types/backend';
import { api } from './api';
import { roomService,validRoomCode } from './room.service';
import { mapTeams,mapPlayer } from './contract';
export const auctionService={
 async getPlayerPool(code:string){const s=await roomService.getState(code);return s.players.map(p=>mapPlayer(p,s));},
 async getTeams(code:string){return mapTeams(await roomService.getState(code));},
 async getTeamSquad(code:string,id:string){
  const [s,details]=await Promise.all([roomService.getState(code),api.get<TeamDTO & {players:PlayerDTO[]}>('/rooms/'+validRoomCode(code)+'/teams/'+encodeURIComponent(id))]);
  const team=mapTeams({...s,teams:[details],players:details.players})[0];return {team,squad:team.squad};
 },
 recommendation:(code:string)=>api.get<RecommendationDTO>('/rooms/'+validRoomCode(code)+'/recommendation'),
 async getResultsAnalytics(code:string):Promise<AuctionAnalytics>{
  const [r,s]=await Promise.all([api.get<ResultsDTO>('/rooms/'+validRoomCode(code)+'/results'),roomService.getState(code)]);
  const player=(id:string)=>s.players.find(p=>p.id===id);
  const expensive=r.mostExpensivePurchase;const war=r.longestBiddingWar;
  const biggest=[...r.teams].sort((a,b)=>b.spentCr-a.spentCr)[0];
  return {roomCode:code,auctionName:s.room.auctionName,provisional:r.provisional,totalTeams:r.teams.length,
   playersSold:r.playersSold,totalSpend:r.totalSpendCr,unsoldPlayers:r.unsoldCount,averageSale:r.averageSaleCr,
   mostExpensivePlayer:expensive&&player(expensive.playerId)?{player:mapPlayer(player(expensive.playerId)!,s),price:expensive.priceCr,boughtByTeam:s.teams.find(t=>t.id===expensive.teamId)?.name??''}:null,
   biggestSpenderTeam:biggest?{teamName:biggest.name,totalSpent:biggest.spentCr}:null,
   longestBiddingWar:war&&player(war.playerId)?{player:mapPlayer(player(war.playerId)!,s),totalBids:war.bidCount,finalPrice:s.soldPlayers.find(p=>p.playerId===war.playerId)?.priceCr??0}:null,
   mostPlayersPurchased:r.mostPlayersPurchased?{teamName:r.mostPlayersPurchased.name,count:r.mostPlayersPurchased.playersOwned}:null,
   highestRemainingBudget:r.highestRemainingBudget?{teamName:r.highestRemainingBudget.name,budget:r.highestRemainingBudget.remainingBudgetCr}:null,
   transfers:s.soldPlayers.flatMap(p=>player(p.playerId)?[{player:mapPlayer(player(p.playerId)!,s),teamName:s.teams.find(t=>t.id===p.teamId)?.name??'',price:p.priceCr,timestamp:p.at}]:[]),
   unsoldList:s.unsoldPlayers.map(p=>mapPlayer(p,s))};
 },
};
