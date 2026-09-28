import type {Fixture,Tournament} from '../manager.types.js';
import {requireThat} from '../../../domain/errors.js';
import {visiblePlayers} from '../heroes/hero.engine.js';

export function scorerDataComplete(t:Tournament,f:Fixture){
 return f.status==='COMPLETED'&&[f.homeTeamId,f.awayTeamId].every(teamId=>
  (t.squadData?.lineups.find(l=>l.fixtureId===f.id&&l.teamId===teamId)?.scorers??[]).reduce((sum,g)=>sum+g.goals,0)===(teamId===f.homeTeamId?f.homeScore:f.awayScore));
}
/** Used only when no immutable squad capture exists. Reconstruct ownership from the ledger. */
export function historicalEligiblePlayers(t:Tournament,f:Fixture,teamId:string):string[]{
 const ownership=new Map<string,string|null>();
 for(const tx of [...t.transactions].sort((a,b)=>a.at-b.at))if(tx.at<=(f.completedAt??0))ownership.set(tx.playerId,tx.toTeamId);
 return t.players.filter(p=>ownership.get(p.id)===teamId).map(p=>p.id);
}
export interface GoldenBootRow {rank:number;playerId:string;name:string;position:string;imageUrl:string;teamId:string|null;teamName:string;teamLogoUrl:string;scoringTeams:{teamId:string;teamName:string;goals:number}[];matchesPlayed:number;goals:number;goalsPerMatch:number}
export interface GoldenBootState {seasonId:string;rows:GoldenBootRow[];completedFixtures:number;missingScorerFixtures:number;missingLineupFixtures:number;}
export function goldenBoot(t:Tournament,userId:string,seasonId:string):GoldenBootState {
 const viewer=t.teams.find(team=>team.managerUserId===userId);requireThat(viewer,'NOT_TOURNAMENT_MEMBER','Membership required.',403);
 requireThat(t.seasonData?.seasons.some(s=>s.id===seasonId),'SEASON_NOT_FOUND','Season not found.',404);
 const fixtures=t.fixtures.filter(f=>f.seasonId===seasonId&&f.status==='COMPLETED'),ids=new Set(fixtures.map(f=>f.id));
 const players=new Map(visiblePlayers(t,viewer.id).map(p=>[p.id,p]));
 const stats=new Map<string,{goals:number;appearances:Set<string>;teams:Map<string,number>}>();
 const get=(id:string)=>{let row=stats.get(id);if(!row){row={goals:0,appearances:new Set(),teams:new Map()};stats.set(id,row);}return row;};
 for(const lineup of t.squadData?.lineups??[]){if(!ids.has(lineup.fixtureId))continue;
  if(lineup.lineupAvailable)for(const id of lineup.starters)get(id).appearances.add(lineup.fixtureId);
  for(const goal of lineup.scorers){const row=get(goal.playerId);row.goals+=goal.goals;row.teams.set(lineup.teamId,(row.teams.get(lineup.teamId)??0)+goal.goals);}
 }
 const historical=seasonId!==t.seasonData!.currentSeasonId||t.seasonData!.seasons.find(s=>s.id===seasonId)?.status!=='ACTIVE';
 const rows:GoldenBootRow[]=[...stats].filter(([,s])=>s.goals>0).map(([id,s])=>{
  const player=players.get(id),scoringTeams=[...s.teams].map(([teamId,goals])=>({teamId,teamName:t.teams.find(x=>x.id===teamId)?.name??'Former team',goals}));
  const teamId=historical?scoringTeams.at(-1)?.teamId??null:player?player.currentTeamId:scoringTeams.at(-1)?.teamId??null,team=t.teams.find(x=>x.id===teamId);
  return {rank:0,playerId:id,name:player?.name??'Unrevealed Hero',position:player?.position??'?',imageUrl:player?.imageUrl??'',teamId,teamName:team?.name??'Free agent',teamLogoUrl:team?.logoUrl??'',scoringTeams,matchesPlayed:s.appearances.size,goals:s.goals,goalsPerMatch:s.appearances.size?s.goals/s.appearances.size:0};
 }).sort((a,b)=>b.goals-a.goals||b.goalsPerMatch-a.goalsPerMatch||a.matchesPlayed-b.matchesPlayed||a.name.localeCompare(b.name)||a.playerId.localeCompare(b.playerId));
 rows.forEach((row,i)=>{const prev=rows[i-1];row.rank=prev&&prev.goals===row.goals&&prev.goalsPerMatch===row.goalsPerMatch&&prev.matchesPlayed===row.matchesPlayed?prev.rank:i+1;});
 return {seasonId,rows,completedFixtures:fixtures.length,missingScorerFixtures:fixtures.filter(f=>!scorerDataComplete(t,f)).length,missingLineupFixtures:fixtures.filter(f=>[f.homeTeamId,f.awayTeamId].some(teamId=>!t.squadData?.lineups.some(l=>l.fixtureId===f.id&&l.teamId===teamId&&l.lineupAvailable))).length};
}
