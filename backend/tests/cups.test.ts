import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {source} from './seasons.test.js';
import {MemoryManagerRepository} from '../src/modules/manager-mode/manager.repository.js';
import {ManagerModeService} from '../src/modules/manager-mode/manager.service.js';
import {defaultCupSettings,cupGroupStandings,trophyRecords} from '../src/modules/manager-mode/cups/cup.engine.js';
import {clubHistory} from '../src/modules/manager-mode/cups/club-history.js';
import {goldenBoot} from '../src/modules/manager-mode/squad/golden-boot.js';
import type {CupCompetition} from '../src/modules/manager-mode/cups/cup.types.js';
import {buildApp} from '../src/app.js';
import {StaticTokenAuthService} from '../src/modules/auth-context/auth.service.js';

async function setup(){const room=source(),repo=new MemoryManagerRepository(),service=new ManagerModeService(repo,async()=>room);const state=await service.create(room.id,'user0',{name:'Cup test'});const act=(a:Parameters<typeof service.mutate>[3],user='user0',request=randomUUID())=>service.mutate(state.id,user,request,a);for(let i=1;i<8;i++)await act({type:'INVITATION',accept:true},'user'+i);await act({type:'GENERATE_FIXTURES'});return {repo,service,state,act,get:async()=>(await repo.find(state.id))!};}
async function finishLeague(f:Awaited<ReturnType<typeof setup>>){await f.repo.mutate(f.state.id,t=>{for(const fixture of t.fixtures.slice(1))Object.assign(fixture,{status:'COMPLETED',homeScore:0,awayScore:0,completedAt:Date.now()});});await f.act({type:'SCORE',fixtureId:f.state.fixtures[0]!.id,homeScore:0,awayScore:0,scorers:{}});}
it('is opt-in and preserves active Matchday progress when settings are saved; rejects permissions and unsupported settings',async()=>{
 const f=await setup();expect((await f.get()).cupData).toBeUndefined();const fixture=f.state.fixtures[0]!;
 await f.act({type:'SCORE',fixtureId:fixture.id,homeScore:1,awayScore:0,scorers:{[fixture.homeTeamId]:[{playerId:f.state.players.find(p=>p.currentTeamId===fixture.homeTeamId)!.id,goals:1}]}});
 const before=await f.get(),settings={...defaultCupSettings,enabled:true};
 await expect(f.act({type:'CUP_SETTINGS',settings},'user1')).rejects.toMatchObject({code:'HOST_ONLY'});
 for(const bad of [{qualifiedTeams:5},{qualifiedTeams:10},{groupStage:false}])await expect(f.act({type:'CUP_SETTINGS',settings:{...settings,...bad}})).rejects.toMatchObject({code:'INVALID_CUP_SETTINGS'});
 const s=await f.act({type:'CUP_SETTINGS',settings});expect(s.cupData!.competitions[0]).toMatchObject({status:'NOT_STARTED',qualified:[],fixtures:[]});
 const after=await f.get();for(const key of ['fixtures','squadData','teams','players','seasonData','transactions','transferWindows'] as const)expect(after[key]).toEqual(before[key]);
 expect(goldenBoot(after,'user0',after.seasonData!.currentSeasonId)).toEqual(goldenBoot(before,'user0',before.seasonData!.currentSeasonId));
 await expect(f.act({type:'END_CURRENT_SEASON',confirmation:'END SEASON'})).rejects.toMatchObject({code:'CUP_LEAGUE_PENDING'});
 await f.act({type:'CUP_SETTINGS',settings:{...settings,enabled:false}});expect((await f.get()).cupData!.competitions[0]!.settings.enabled).toBe(false);
});
it.each([4,6,8])('draws %i qualifiers from frozen same-season standings into separate pots exactly once',async n=>{
 const f=await setup();await f.act({type:'CUP_SETTINGS',settings:{...defaultCupSettings,enabled:true,qualifiedTeams:n,groupMeetings:2}});await finishLeague(f);
 const t=await f.get(),c=t.cupData!.competitions[0]!;expect(c.qualified).toEqual(t.seasonData!.seasons[0]!.finalStandings.slice(0,n));
 expect(c.groups.map(g=>g.teamIds.length)).toEqual([n/2,n/2]);for(let i=0;i<n;i+=2)expect(c.groups.every(g=>g.teamIds.filter(id=>[c.qualified[i]!.teamId,c.qualified[i+1]!.teamId].includes(id)).length===1)).toBe(true);
 expect(c.fixtures).toHaveLength(2*(n/2)*(n/2-1));expect(new Set(c.fixtures.map(f=>f.homeTeamId+':'+f.awayTeamId)).size).toBe(c.fixtures.length);
 await expect(f.act({type:'CUP_SETTINGS',settings:{...c.settings,enabled:false}})).rejects.toMatchObject({code:'CUP_DRAW_LOCKED'});
 await expect(f.act({type:'START_NEXT_SEASON'})).rejects.toMatchObject({code:'CUP_PENDING'});expect((await f.service.state(t.id,'user0')).cupData).toEqual(t.cupData);
});
it.each([1,2] as const)('plays a six-team Cup with %i-leg knockouts, penalties, third place and exactly-once trophies',async legs=>{
 const f=await setup();await f.act({type:'CUP_SETTINGS',settings:{...defaultCupSettings,enabled:true,semiFinalLegs:legs,finalLegs:legs,thirdPlace:true}});await finishLeague(f);
 const before=await f.get();let c=before.cupData!.competitions[0]!;
 for(const fixture of c.fixtures)await f.act({type:'CUP_SCORE',fixtureId:fixture.id,homeScore:0,awayScore:0,scorers:{}});
 c=(await f.get()).cupData!.competitions[0]!;expect(c.status).toBe('SEMI_FINAL');expect(cupGroupStandings(await f.get(),c).every(g=>g.rows.every(r=>r.played===2&&r.points===2))).toBe(true);
 await expect(f.act({type:'CUP_SCORE',fixtureId:c.fixtures[0]!.id,homeScore:0,awayScore:0,scorers:{}})).rejects.toMatchObject({code:'CUP_RESULT_LOCKED'});
 for(const tie of c.ties){await expect(f.act({type:'CUP_PENALTIES',tieId:tie.id,winnerTeamId:tie.teamIds[0]})).rejects.toMatchObject({code:'PENALTIES_NOT_REQUIRED'});for(const fixture of c.fixtures.filter(x=>x.tieId===tie.id))await f.act({type:'CUP_SCORE',fixtureId:fixture.id,homeScore:0,awayScore:0,scorers:{}});await f.act({type:'CUP_PENALTIES',tieId:tie.id,winnerTeamId:tie.teamIds[0]});}
 c=(await f.get()).cupData!.competitions[0]!;expect(c.status).toBe('FINAL');
 for(const tie of c.ties.filter(x=>x.stage!=='SEMI_FINAL')){for(const fixture of c.fixtures.filter(x=>x.tieId===tie.id)){const scorer=(await f.get()).players.find(p=>p.currentTeamId===tie.teamIds[0])!;await f.act({type:'CUP_SCORE',fixtureId:fixture.id,homeScore:fixture.homeTeamId===tie.teamIds[0]?1:0,awayScore:fixture.awayTeamId===tie.teamIds[0]?1:0,scorers:{[tie.teamIds[0]]:[{playerId:scorer.id,goals:1}]}});}}
 const done=await f.get();expect(done.cupData!.competitions[0]!.status).toBe('COMPLETED');expect(trophyRecords(done).filter(x=>x.type==='CUP')).toHaveLength(1);expect(trophyRecords(done).filter(x=>x.type==='LEAGUE_SHIELD')).toHaveLength(1);
 for(const key of ['fixtures','teams','players','seasonData','transactions','squadData'] as const)expect(done[key]).toEqual(before[key]);
 expect(goldenBoot(done,'user0',done.seasonData!.currentSeasonId).rows).toEqual([]);
 expect(Object.values(done.cupData!.competitions[0]!.finishes)).toContain('3rd place');expect(clubHistory(done).reduce((n,x)=>n+x.trophies.length,0)).toBe(2);
 const next=await f.act({type:'START_NEXT_SEASON'});expect(next.cupData).toEqual(done.cupData);expect(next.cupData!.competitions.some(c=>c.seasonId===next.seasonData!.currentSeasonId)).toBe(false);
});
it('supports direct semi-finals and idempotent scoring, without duplicating existing shields',async()=>{
 const f=await setup();await finishLeague(f);const old=await f.get(),s=old.seasonData!.seasons[0]!;
 expect(trophyRecords(old)).toHaveLength(1);expect(old.cupData).toBeUndefined();
 await f.act({type:'CUP_SETTINGS',settings:{...defaultCupSettings,enabled:true,qualifiedTeams:4,groupStage:false,semiFinalLegs:1,finalLegs:1}});
 const c=(await f.get()).cupData!.competitions[0]!;expect(c.groups).toEqual([]);expect(c.status).toBe('SEMI_FINAL');
 const fixture=c.fixtures[0]!,action={type:'CUP_SCORE' as const,fixtureId:fixture.id,homeScore:0,awayScore:0,scorers:{}},request=randomUUID();const outcomes=await Promise.all([f.act(action,'user0',request),f.act(action,'user0',request)]);expect(outcomes[0]!.sequence).toBe(outcomes[1]!.sequence);expect((await f.get()).cupData!.competitions[0]!.lineups).toHaveLength(2);
 expect(trophyRecords(await f.get()).filter(x=>x.type==='LEAGUE_SHIELD')).toHaveLength(1);expect((await f.get()).seasonData!.seasons[0]).toEqual(s);
});
it('protects Cup/history endpoints and publishes committed Cup changes to authenticated peers',async()=>{
 const f=await setup(),{app}=await buildApp({managerRepository:f.repo,authService:new StaticTokenAuthService(new Map([['host',{userId:'user0'}],['peer',{userId:'user1'}],['outsider',{userId:'outside'}]])),logger:false,timersEnabled:false});
 try{
  await app.ready();const base='/api/manager-mode/'+f.state.id;
  for(const path of ['/cups','/club-history']){expect((await app.inject({url:base+path,headers:{authorization:'Bearer outsider'}})).statusCode).toBe(403);expect((await app.inject({url:base+path,headers:{authorization:'Bearer peer'}})).statusCode).toBe(200);}
  const payload={requestId:randomUUID(),action:{type:'CUP_SETTINGS',settings:{...defaultCupSettings,enabled:true}}};
  expect((await app.inject({method:'POST',url:base+'/actions',headers:{authorization:'Bearer peer'},payload})).statusCode).toBe(403);
  const socket=await app.injectWS('/ws?token=peer',{headers:{origin:'http://localhost:3000'}});
  const received=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Missing Cup event')),3000);socket.on('message',(raw:Buffer)=>{if(JSON.parse(raw.toString()).type==='CUP_ENABLED'){clearTimeout(timer);resolve();}});});
  const saved=await app.inject({method:'POST',url:base+'/actions',headers:{authorization:'Bearer host'},payload});expect(saved.statusCode).toBe(200);await received;expect((await f.get()).cupData!.competitions[0]!.settings.enabled).toBe(true);socket.terminate();
 }finally{await app.close();}
});
