import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {source} from './seasons.test.js';
import {MemoryManagerRepository} from '../src/modules/manager-mode/manager.repository.js';
import {ManagerModeService} from '../src/modules/manager-mode/manager.service.js';
import {goldenBoot,scorerDataComplete} from '../src/modules/manager-mode/squad/golden-boot.js';
import {buildApp} from '../src/app.js';
import {StaticTokenAuthService} from '../src/modules/auth-context/auth.service.js';
import {realtimeManagerState} from '../src/modules/manager-mode/realtime-state.js';

async function setup(){
 const room=source(),repo=new MemoryManagerRepository(),service=new ManagerModeService(repo,async()=>room),created=await service.create(room.id,'user0',{name:'Golden Boot safety'});
 const act=(a:Parameters<typeof service.mutate>[3],user='user0',request=randomUUID())=>service.mutate(created.id,user,request,a);
 for(let i=1;i<8;i++)await act({type:'INVITATION',accept:true},'user'+i);const state=await act({type:'GENERATE_FIXTURES'});
 const fixture=state.fixtures[0]!,scorer=state.players.find(p=>p.currentTeamId===fixture.homeTeamId)!,away=state.players.find(p=>p.currentTeamId===fixture.awayTeamId)!;
 return {repo,service,state,fixture,scorer,away,act};
}
it('reads existing Matchday 1–4 scorers without rewriting or duplicating records',async()=>{
 const f=await setup();
 await f.repo.mutate(f.state.id,t=>{
  t.squadData??={sheets:[],contracts:[],lineups:[]};
  for(let day=1;day<=4;day++){
   const fixture=t.fixtures.find(x=>x.matchday===day)!;
   Object.assign(fixture,{homeScore:day,awayScore:0,status:'COMPLETED',completedAt:10000+day});
   const player=t.players.find(p=>p.currentTeamId===fixture.homeTeamId)!;
   t.squadData.lineups.push({fixtureId:fixture.id,teamId:fixture.homeTeamId,starters:[player.id],bench:[],eligiblePlayerIds:[player.id],scorers:[{playerId:player.id,goals:day}],capturedAt:10000+day,lineupAvailable:true});
  }
  // Another completed match has no scorer capture; only this match needs backfill.
  const missing=t.fixtures.find(x=>x.status!=='COMPLETED')!;
  Object.assign(missing,{homeScore:1,awayScore:0,status:'COMPLETED',completedAt:10010});
 });
 const before=(await f.repo.find(f.state.id))!;
 for(let refresh=0;refresh<3;refresh++){
  const state=realtimeManagerState(await f.service.state(f.state.id,'user0'));
  expect(state.squadData?.lineups).toEqual(before.squadData!.lineups);
  for(const capture of before.squadData!.lineups){
   expect(state.fixtures.find(x=>x.id===capture.fixtureId)).toMatchObject({matchday:before.fixtures.find(x=>x.id===capture.fixtureId)!.matchday,seasonId:before.seasonData!.currentSeasonId});
   expect(scorerDataComplete(before,before.fixtures.find(x=>x.id===capture.fixtureId)!)).toBe(true);
  }
  const stats=goldenBoot((await f.repo.find(f.state.id))!,'user0',before.seasonData!.currentSeasonId);
  expect(stats.rows.reduce((sum,row)=>sum+row.goals,0)).toBe(10);
  expect(stats.missingScorerFixtures).toBe(1);
 }
 expect(await f.repo.find(f.state.id)).toEqual(before);
});
it('backfills legacy results atomically without altering progress or inventing appearances; exact totals and host permissions enforced',async()=>{
 const f=await setup();await f.act({type:'WINDOW',open:true});
 await f.repo.mutate(f.state.id,t=>{Object.assign(t.fixtures[0]!,{homeScore:2,awayScore:0,status:'COMPLETED',completedAt:10000});});
 const before=(await f.repo.find(f.state.id))!,table=(await f.service.state(f.state.id,'user0')).standings;
 expect(goldenBoot(before,'user0',before.seasonData!.currentSeasonId).missingScorerFixtures).toBe(1);
 const action={type:'UPDATE_FIXTURE_SCORERS',fixtureId:f.fixture.id,expectedHomeScore:2,expectedAwayScore:0,scorers:{[f.fixture.homeTeamId]:[{playerId:f.scorer.id,goals:2}]}} satisfies Parameters<typeof f.act>[0];
 await expect(f.act(action,'user1')).rejects.toMatchObject({code:'HOST_ONLY'});
 await expect(f.act({...action,expectedHomeScore:1})).rejects.toMatchObject({code:'STALE_FIXTURE_SCORE'});
 await expect(f.act({...action,scorers:{}})).rejects.toMatchObject({code:'SCORER_COUNT_MISMATCH'});
 await expect(f.act({...action,scorers:{[f.fixture.homeTeamId]:[{playerId:f.away.id,goals:2}]}})).rejects.toMatchObject({code:'INVALID_SCORER'});
 expect(await f.repo.find(f.state.id)).toEqual(before);
 const request=randomUUID();await f.act(action,'user0',request);await f.act(action,'user0',request);
 const after=(await f.repo.find(f.state.id))!;
 for(const key of ['fixtures','teams','players','transactions','transferWindows','seasonData','trades','buyouts','negotiation'] as const)expect(after[key]).toEqual(before[key]);
 expect((await f.service.state(f.state.id,'user0')).standings).toEqual(table);expect(after.transferWindowOpen).toBe(true);
 expect(scorerDataComplete(after,after.fixtures[0]!)).toBe(true);
 expect(goldenBoot(after,'user0',after.seasonData!.currentSeasonId).rows[0]).toMatchObject({playerId:f.scorer.id,goals:2,matchesPlayed:0,goalsPerMatch:0});
});
it('correcting scores replaces goal counts and preserves lineup captures, ranking and season history',async()=>{
 const f=await setup();await f.repo.mutate(f.state.id,t=>{t.squadData={sheets:[],contracts:[],lineups:[{fixtureId:f.fixture.id,teamId:f.fixture.homeTeamId,starters:[f.scorer.id],bench:[],eligiblePlayerIds:[f.scorer.id],scorers:[],capturedAt:1,lineupAvailable:true}]};});
 await f.act({type:'SCORE',fixtureId:f.fixture.id,homeScore:3,awayScore:0,scorers:{[f.fixture.homeTeamId]:[{playerId:f.scorer.id,goals:3}]}});
 await f.act({type:'SCORE',fixtureId:f.fixture.id,homeScore:2,awayScore:0,scorers:{[f.fixture.homeTeamId]:[{playerId:f.scorer.id,goals:1},{playerId:f.scorer.id,goals:1}]}});
 let t=(await f.repo.find(f.state.id))!;const season=t.seasonData!.currentSeasonId;
 expect(goldenBoot(t,'user0',season).rows[0]).toMatchObject({goals:2,matchesPlayed:1,goalsPerMatch:2,rank:1});
 await f.act({type:'END_CURRENT_SEASON',confirmation:'END SEASON'});const closed=(await f.repo.find(f.state.id))!;
 await f.act({type:'UPDATE_FIXTURE_SCORERS',fixtureId:f.fixture.id,expectedHomeScore:2,expectedAwayScore:0,scorers:{[f.fixture.homeTeamId]:[{playerId:f.scorer.id,goals:2}]}});
 t=(await f.repo.find(f.state.id))!;expect(t.seasonData).toEqual(closed.seasonData);expect(t.fixtures).toEqual(closed.fixtures);expect(t.teams).toEqual(closed.teams);
 await f.act({type:'START_NEXT_SEASON'});t=(await f.repo.find(f.state.id))!;
 expect(goldenBoot(t,'user0',t.seasonData!.currentSeasonId).rows).toEqual([]);expect(goldenBoot(t,'user0',season).rows[0]?.goals).toBe(2);
 await expect(f.act({type:'SCORE',fixtureId:f.fixture.id,homeScore:0,awayScore:0,scorers:{}})).rejects.toMatchObject({code:'HISTORICAL_SEASON'});
});
it('preserves historical scoring-team identity after transfers and uses ledger eligibility without a lineup',async()=>{
 const f=await setup();await f.repo.mutate(f.state.id,t=>{
  Object.assign(t.fixtures[0]!,{homeScore:1,awayScore:0,status:'COMPLETED',completedAt:10000});
  const p=t.players.find(p=>p.id===f.scorer.id)!;p.currentTeamId=f.fixture.awayTeamId;
  t.transactions.push({id:randomUUID(),playerId:p.id,fromTeamId:f.fixture.homeTeamId,toTeamId:f.fixture.awayTeamId,type:'TRADE',amountUnits:0,tradeId:null,at:20000});
 });
 await f.act({type:'UPDATE_FIXTURE_SCORERS',fixtureId:f.fixture.id,expectedHomeScore:1,expectedAwayScore:0,scorers:{[f.fixture.homeTeamId]:[{playerId:f.scorer.id,goals:1}]}});
 let t=(await f.repo.find(f.state.id))!;const season=t.seasonData!.currentSeasonId;
 expect(goldenBoot(t,'user0',season).rows[0]).toMatchObject({teamId:f.fixture.awayTeamId,scoringTeams:[{teamId:f.fixture.homeTeamId,goals:1}]});
 await f.act({type:'END_CURRENT_SEASON',confirmation:'END SEASON'});await f.act({type:'START_NEXT_SEASON'});t=(await f.repo.find(f.state.id))!;
 expect(goldenBoot(t,'user0',season).rows[0]?.teamId).toBe(f.fixture.homeTeamId);
});
it('protects HTTP stats and scorer actions and publishes committed scorer updates over WebSocket',async()=>{
 const f=await setup();
 await f.repo.mutate(f.state.id,t=>{Object.assign(t.fixtures[0]!,{homeScore:1,awayScore:0,status:'COMPLETED',completedAt:10000});});
 const {app}=await buildApp({managerRepository:f.repo,authService:new StaticTokenAuthService(new Map([['host',{userId:'user0'}],['other',{userId:'user1'}],['outsider',{userId:'outsider'}]])),logger:false,timersEnabled:false});
 try{
  await app.ready();const url=`/api/manager-mode/${f.state.id}`,stats=`${url}/seasons/${f.state.seasonData!.currentSeasonId}/stats/golden-boot`;
  expect((await app.inject({url:stats,headers:{authorization:'Bearer outsider'}})).statusCode).toBe(403);
  expect((await app.inject({url:`${url}/fixtures/${f.fixture.id}/scorers`,headers:{authorization:'Bearer other'}})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:url+'/actions',headers:{authorization:'Bearer host'},payload:{requestId:randomUUID(),action:{type:'SCORE',fixtureId:f.fixture.id,homeScore:1,awayScore:0}}})).json().error.code).toBe('SCORERS_REQUIRED');
  const socket=await app.injectWS('/ws?token=other',{headers:{origin:'http://localhost:3000'}});
  const event=new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('No stats event')),3000);socket.on('message',(raw:Buffer)=>{if(JSON.parse(raw.toString()).type==='PLAYER_STATS_UPDATED'){clearTimeout(timeout);resolve();}});});
  const saved=await app.inject({method:'POST',url:url+'/actions',headers:{authorization:'Bearer host'},payload:{requestId:randomUUID(),action:{type:'UPDATE_FIXTURE_SCORERS',fixtureId:f.fixture.id,expectedHomeScore:1,expectedAwayScore:0,scorers:{[f.fixture.homeTeamId]:[{playerId:f.scorer.id,goals:1}]}}}});
  expect(saved.statusCode).toBe(200);await event;
  expect((await app.inject({url:stats,headers:{authorization:'Bearer other'}})).json().rows[0]).toMatchObject({goals:1,matchesPlayed:0});socket.terminate();
 }finally{await app.close();}
});
