import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import postgres from 'postgres';
const db=postgres(process.env.DATABASE_URL,{ssl:'require',prepare:false,max:1,connect_timeout:15});
const version='20260930090313';
try{
 const tables=await db`select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in ('manager_cup_competitions','manager_trophies','manager_seasons','manager_tournament_teams') order by table_name,ordinal_position`;
 console.log('Existing schema:',JSON.stringify(tables));
 if(process.argv.includes('--apply')){
  await db.unsafe(readFileSync(resolve('../supabase/migrations/'+version+'_manager_cups_trophies.sql'),'utf8'));
  const security=await db`select c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT') as anon_read,has_table_privilege('authenticated',c.oid,'INSERT') as client_write from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('manager_cup_competitions','manager_trophies')`;
  if(security.length!==2||security.some(r=>!r.relrowsecurity||r.anon_read||r.client_write))throw Error('Cup table security verification failed');
  const registered=spawnSync(process.env.SUPABASE_CLI??(process.platform==='win32'?'supabase.exe':'supabase'),['migration','repair',version,'--status','applied','--db-url',process.env.DATABASE_URL,'--workdir',resolve('..')],{encoding:'utf8',windowsHide:true});
  if(registered.status!==0)throw Error('Tables verified, but register migration '+version+' as applied using migration repair.');
  console.log('PASS: additive Cup schema installed and registered. RLS enabled; browser access revoked. Existing records were not modified.');
 }
}catch(e){console.error({code:e.code??'CUP_SCHEMA_ERROR',message:e.code?'Database operation failed; credentials were not logged.':e.message});process.exitCode=1;}finally{await db.end();}
