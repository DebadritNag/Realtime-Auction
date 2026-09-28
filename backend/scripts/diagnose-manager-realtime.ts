/** Read-only production diagnostics. Never prints rows, dialogue, credentials or URLs. */
import {connectDatabase} from '../src/repositories/postgres.js';
import {PostgresManagerTournamentRepository} from '../src/modules/manager-mode/postgres-manager.repository.js';
import {ManagerModeService} from '../src/modules/manager-mode/manager.service.js';
import {realtimeManagerState} from '../src/modules/manager-mode/realtime-state.js';
const db=connectDatabase(process.env.DATABASE_URL!);
try{
 const [row]=await db<{id:string}[]>`select id from public.manager_tournaments order by updated_at desc limit 1`;
 if(row){
  let reads=0;const repo=new PostgresManagerTournamentRepository(db,{info(data){if((data as {event?:string}).event==='manager_state_db'){reads++;console.log(JSON.stringify(data));}}});
  const start=performance.now();const loaded=await Promise.all(Array.from({length:8},()=>repo.find(row.id)));const t=loaded[0]!;
  const service=new ManagerModeService(repo,async()=>null),build=performance.now();let fullBytes=0,compactBytes=0;
  for(const team of t.teams){const state=service.view(t,team.managerUserId);fullBytes+=Buffer.byteLength(JSON.stringify(state));compactBytes+=Buffer.byteLength(JSON.stringify(realtimeManagerState(state)));if(team===t.teams[0])console.log(JSON.stringify({event:'snapshot_fields',sizes:Object.fromEntries(Object.entries(state).map(([key,value])=>[key,Buffer.byteLength(JSON.stringify(value)??'')]))}));}
  console.log(JSON.stringify({event:'manager_diagnostics',tournamentId:row.id,concurrentRequests:8,databaseLoads:reads,readMs:Math.round(build-start),viewAndSerializeMs:Math.round(performance.now()-build),managers:t.teams.length,fullBytes,compactBytes}));
  const indexes=await db<{tablename:string;indexname:string}[]>`select tablename,indexname from pg_indexes where schemaname='public' and tablename in ('manager_fixtures','manager_tournament_events','manager_notifications','manager_negotiation_sessions','manager_negotiation_messages','manager_transfer_transactions') order by tablename,indexname`;
  console.log(JSON.stringify({event:'manager_indexes',indexes}));
  for(const table of ['manager_tournament_events','manager_notifications','manager_fixtures'] as const){
   const plan=await db.unsafe('explain (analyze, buffers, format json) select * from public.'+table+' where tournament_id=$1',[row.id]);
   const result=plan[0]!['QUERY PLAN'][0];
   console.log(JSON.stringify({event:'manager_query_plan',table,node:result.Plan['Node Type'],rows:result.Plan['Actual Rows'],executionMs:result['Execution Time'],planningMs:result['Planning Time']}));
  }
 }else console.log('No Manager Mode tournaments to inspect.');
}catch(e){console.error(JSON.stringify({event:'manager_diagnostics_failed',code:(e as {code?:string}).code??'UNKNOWN'}));process.exitCode=1;}
finally{await db.end();}
