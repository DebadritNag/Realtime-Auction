import {randomInt,randomUUID} from 'node:crypto';
import {requireThat} from '../../../domain/errors.js';
import type {Tournament} from '../manager.types.js';
import {generateFixtures,standings} from '../fixture.service.js';
import {currentSeason,seasonFixtures} from '../seasons/season.engine.js';
import {recordMatch} from '../squad/squad.engine.js';
import type {CupAction,CupCompetition,CupSettings,CupTie,Trophy} from './cup.types.js';

export const defaultCupSettings:CupSettings={enabled:false,name:'Manager Mode Cup',qualifiedTeams:6,groupStage:true,groupMeetings:1,semiFinalLegs:2,finalLegs:1,thirdPlace:false};
export const currentCup=(t:Tournament)=>t.cupData?.competitions.find(c=>c.seasonId===t.seasonData?.currentSeasonId);
export function trophyRecords(t:Tournament):Trophy[]{
 const saved=t.cupData?.trophies??[];
 return [...saved,...(t.seasonData?.seasons??[]).filter(s=>s.championTeamId&&!saved.some(x=>x.seasonId===s.id&&x.type==='LEAGUE_SHIELD')).map(s=>({id:'league-'+s.id,seasonId:s.id,teamId:s.championTeamId!,type:'LEAGUE_SHIELD' as const,competitionId:null,name:'League Shield',wonAt:s.completedAt}))];
}
function award(t:Tournament,record:Omit<Trophy,'id'>){
 t.cupData??={competitions:[],trophies:[]};
 if(!t.cupData.trophies.some(x=>x.seasonId===record.seasonId&&x.type===record.type))t.cupData.trophies.push({id:randomUUID(),...record});
}
function addTie(c:CupCompetition,stage:CupTie['stage'],teamIds:[string,string],legs:number){
 const tie:CupTie={id:randomUUID(),stage,teamIds,winnerTeamId:null,penaltyWinnerTeamId:null};c.ties.push(tie);
 for(let leg=1;leg<=legs;leg++)c.fixtures.push({id:randomUUID(),seasonId:c.seasonId,stage,tieId:tie.id,leg,matchday:leg,homeTeamId:teamIds[(leg-1)%2]!,awayTeamId:teamIds[leg%2]!,homeScore:null,awayScore:null,status:'SCHEDULED',scheduledAt:null,completedAt:null});
}
export function cupGroupStandings(t:Tournament,c:CupCompetition){return c.groups.map(g=>({name:g.name,rows:standings(t.teams.filter(x=>g.teamIds.includes(x.id)),c.fixtures.filter(f=>f.group===g.name))}));}
export function cupAggregate(c:CupCompetition,tie:CupTie){return tie.teamIds.map(id=>c.fixtures.filter(f=>f.tieId===tie.id&&f.status==='COMPLETED').reduce((n,f)=>n+(f.homeTeamId===id?f.homeScore!:f.awayScore!),0));}
function progress(t:Tournament,c:CupCompetition,now:number){
 if(c.status==='GROUP_STAGE'&&c.fixtures.filter(f=>f.stage==='GROUP').every(f=>f.status==='COMPLETED')){
  const [a,b]=cupGroupStandings(t,c);addTie(c,'SEMI_FINAL',[a!.rows[0]!.teamId,b!.rows[1]!.teamId],c.settings.semiFinalLegs);addTie(c,'SEMI_FINAL',[b!.rows[0]!.teamId,a!.rows[1]!.teamId],c.settings.semiFinalLegs);c.status='SEMI_FINAL';
  for(const group of [a!,b!])for(const row of group.rows.slice(2))c.finishes[row.teamId]='Group stage';
 }
 for(const tie of c.ties){if(tie.winnerTeamId||!c.fixtures.filter(f=>f.tieId===tie.id).every(f=>f.status==='COMPLETED'))continue;const [a,b]=cupAggregate(c,tie);tie.winnerTeamId=a!==b?tie.teamIds[a!>b!?0:1]:tie.penaltyWinnerTeamId;}
 const semis=c.ties.filter(x=>x.stage==='SEMI_FINAL');
 if(c.status==='SEMI_FINAL'&&semis.length===2&&semis.every(x=>x.winnerTeamId)){
  addTie(c,'FINAL',[semis[0]!.winnerTeamId!,semis[1]!.winnerTeamId!],c.settings.finalLegs);
  const losers=semis.map(x=>x.teamIds.find(id=>id!==x.winnerTeamId)!);for(const id of losers)c.finishes[id]='Semi-finalist';
  if(c.settings.thirdPlace)addTie(c,'THIRD_PLACE',losers as [string,string],1);c.status='FINAL';
 }
 const final=c.ties.find(x=>x.stage==='FINAL'),third=c.ties.find(x=>x.stage==='THIRD_PLACE');
 if(final?.winnerTeamId){c.championTeamId=final.winnerTeamId;c.finishes[final.winnerTeamId]='Winner';c.finishes[final.teamIds.find(x=>x!==final.winnerTeamId)!]='Runner-up';award(t,{seasonId:c.seasonId,teamId:final.winnerTeamId,type:'CUP',competitionId:c.id,name:c.settings.name,wonAt:now});}
 if(third?.winnerTeamId){c.finishes[third.winnerTeamId]='3rd place';c.finishes[third.teamIds.find(x=>x!==third.winnerTeamId)!]='4th place';}
 if(final?.winnerTeamId&&(!third||third.winnerTeamId)){c.status='COMPLETED';c.completedAt??=now;}
}
/** Called only inside the existing serialized tournament mutation, never on reads. */
export function synchronizeCup(t:Tournament,now=Date.now()){
 const c=currentCup(t),season=currentSeason(t);
 if(t.cupData&&season.championTeamId)award(t,{seasonId:season.id,teamId:season.championTeamId,type:'LEAGUE_SHIELD',competitionId:null,name:'League Shield',wonAt:season.completedAt});
 if(!c?.settings.enabled||!['NOT_STARTED','WAITING_FOR_LEAGUE'].includes(c.status))return;
 c.status='WAITING_FOR_LEAGUE';
 const league=seasonFixtures(t);if(!league.length||league.some(f=>f.status!=='COMPLETED')||season.status!=='COMPLETED')return;
 c.qualified=structuredClone(season.finalStandings.slice(0,c.settings.qualifiedTeams));
 requireThat(c.qualified.length===c.settings.qualifiedTeams,'CUP_QUALIFICATION_INVALID','Final league standings do not contain enough teams.',409);
 c.status='DRAW_READY';
}
function drawCup(c:CupCompetition,now:number){
 c.drawnAt=now;
 if(!c.settings.groupStage){addTie(c,'SEMI_FINAL',[c.qualified[0]!.teamId,c.qualified[3]!.teamId],c.settings.semiFinalLegs);addTie(c,'SEMI_FINAL',[c.qualified[1]!.teamId,c.qualified[2]!.teamId],c.settings.semiFinalLegs);c.status='SEMI_FINAL';return;}
 c.groups=[{name:'A',teamIds:[]},{name:'B',teamIds:[]}];
 for(let pot=0;pot<c.qualified.length;pot+=2){const swap=randomInt(2);c.groups[0]!.teamIds.push(c.qualified[pot+swap]!.teamId);c.groups[1]!.teamIds.push(c.qualified[pot+1-swap]!.teamId);}
 for(const g of c.groups)c.fixtures.push(...generateFixtures(g.teamIds,c.settings.groupMeetings===2).map(f=>({...f,seasonId:c.seasonId,stage:'GROUP' as const,group:g.name,leg:1})));
 c.status='GROUP_STAGE';
}
export function cupAction(t:Tournament,user:string,a:CupAction,now=Date.now()){
 requireThat(t.hostUserId===user,'HOST_ONLY','Only the host can manage the Cup.',403);
 const season=currentSeason(t);let c=currentCup(t);
 requireThat(t.status==='ACTIVE'&&season.status!=='ARCHIVED','INVALID_STATE','Start Manager Mode before configuring or playing a Cup.',409);
 if(a.type==='CUP_SETTINGS'){
  requireThat(!c||!c.drawnAt,'CUP_DRAW_LOCKED','Cup settings and qualification are locked after the draw.',409);
  const s=a.settings;
  requireThat(!s.enabled||(s.qualifiedTeams<=t.teams.length&&s.qualifiedTeams>=4&&s.qualifiedTeams%2===0&&(s.groupStage||s.qualifiedTeams===4)),'INVALID_CUP_SETTINGS','Use an even number of qualifiers from 4 to the team count. Without groups, exactly 4 teams qualify.');
  requireThat(!s.enabled||!season.endedEarly,'LEAGUE_INCOMPLETE','A season ended early cannot start a Cup. Configure the next season instead.',409);
  t.cupData??={competitions:[],trophies:[]};
  if(c){c.settings=structuredClone(s);c.status='NOT_STARTED';c.qualified=[];}else{c={id:randomUUID(),seasonId:season.id,settings:structuredClone(s),status:'NOT_STARTED',qualified:[],groups:[],fixtures:[],ties:[],lineups:[],drawnAt:null,completedAt:null,championTeamId:null,finishes:{}};t.cupData.competitions.push(c);}
  synchronizeCup(t,now);return;
 }
 if(a.type==='CUP_DRAW'){
  requireThat(c?.settings.enabled&&!c.drawnAt&&['QUALIFIED','DRAW_READY'].includes(c.status),'CUP_DRAW_NOT_READY','Wait for league qualification; an existing draw cannot be regenerated.',409);
  drawCup(c,now);return;
 }
 requireThat(c?.settings.enabled&&['GROUP_STAGE','SEMI_FINAL','FINAL'].includes(c.status),'CUP_NOT_ACTIVE','There is no active Cup for this season.',409);
 if(a.type==='CUP_PENALTIES'){
  const tie=c.ties.find(x=>x.id===a.tieId);requireThat(tie&&!tie.winnerTeamId&&tie.teamIds.includes(a.winnerTeamId),'INVALID_PENALTY_WINNER','Choose a team from an unresolved tie.');
  const [h,v]=cupAggregate(c,tie);requireThat(c.fixtures.filter(f=>f.tieId===tie.id).every(f=>f.status==='COMPLETED')&&h===v,'PENALTIES_NOT_REQUIRED','Penalties are allowed only after all legs finish level.');tie.penaltyWinnerTeamId=a.winnerTeamId;
 }else{
  const f=c.fixtures.find(f=>f.id===a.fixtureId);requireThat(f,'CUP_FIXTURE_NOT_FOUND','Cup fixture not found.',404);
  requireThat(f.stage==='GROUP'?c.status==='GROUP_STAGE':!c.ties.find(x=>x.id===f.tieId)?.winnerTeamId,'CUP_RESULT_LOCKED','This round has advanced. Its results are locked.',409);
  const capture=f.status!=='COMPLETED';f.homeScore=a.homeScore;f.awayScore=a.awayScore;f.status='COMPLETED';f.completedAt??=now;
  // Reuse validation/capture while keeping Cup lineups out of league persistence and stats.
  const context={...t,squadData:{sheets:t.squadData?.sheets??[],contracts:[],lineups:c.lineups}};
  recordMatch(context,f,a.scorers,now,capture);c.lineups=context.squadData.lineups;
 }
 progress(t,c,now);
}
export function assertCupFinished(t:Tournament){const c=currentCup(t);requireThat(!c?.settings.enabled||c.status==='COMPLETED','CUP_PENDING','Complete the Cup before starting another season or ending Manager Mode. Disable an undrawn Cup in Host Control if it is not needed.',409);}
