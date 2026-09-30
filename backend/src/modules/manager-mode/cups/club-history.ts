import type {Tournament} from '../manager.types.js';
import {standings} from '../fixture.service.js';
import {trophyRecords} from './cup.engine.js';
export function clubHistory(t:Tournament){
 const trophies=trophyRecords(t);
 return t.teams.map(team=>{
  const incoming=t.transactions.filter(x=>x.toTeamId===team.id),outgoing=t.transactions.filter(x=>x.fromTeamId===team.id);
  const spent=incoming.reduce((n,x)=>n+x.amountUnits,0),income=outgoing.filter(x=>x.type==='RELEASE'||x.type==='BUYOUT').reduce((n,x)=>n+x.amountUnits,0);
  const fixtures=[...t.fixtures,...(t.cupData?.competitions??[]).flatMap(c=>c.fixtures)],record=standings(t.teams,fixtures).find(r=>r.teamId===team.id)!;
  return {teamId:team.id,trophies:trophies.filter(x=>x.teamId===team.id),record,playersBought:incoming.filter(x=>x.type!=='TRADE').length,playersSold:outgoing.filter(x=>x.type==='RELEASE'||x.type==='BUYOUT').length,playersTraded:outgoing.filter(x=>x.type==='TRADE').length,transferSpendingUnits:spent,transferIncomeUnits:income,netSpendUnits:spent-income,bonusUnits:(t.seasonData?.bonuses??[]).filter(x=>x.teamId===team.id).reduce((n,x)=>n+x.amountUnits,0),currentBudgetUnits:team.transferBudgetUnits,seasons:(t.seasonData?.seasons??[]).map(s=>{
   const c=t.cupData?.competitions.find(c=>c.seasonId===s.id);return {seasonId:s.id,number:s.number,leaguePosition:s.finalStandings.find(x=>x.teamId===team.id)?.position??null,leagueWinner:s.championTeamId===team.id,cupFinish:c?.finishes[team.id]??(c?.qualified.some(x=>x.teamId===team.id)?'In progress':c?.settings.enabled?'Not qualified':'Not entered'),bonusUnits:t.seasonData!.bonuses.find(b=>b.seasonId===s.id&&b.teamId===team.id)?.amountUnits??0};
  })};
 });
}
export type ClubHistory=ReturnType<typeof clubHistory>;
