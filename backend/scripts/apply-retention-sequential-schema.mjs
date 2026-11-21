import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import postgres from 'postgres';
// Dry run (default) only prints the current schema. Pass --apply to install the migration.
const db=postgres(process.env.DATABASE_URL,{ssl:'require',prepare:false,max:1,connect_timeout:15});
const version='20261002090000';
const tables=['auction_retentions','auction_retention_turns'];
try{
 const columns=await db`select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in ${db(tables)} order by table_name,ordinal_position`;
 const constraints=await db`select conrelid::regclass::text as table_name,conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid::regclass::text in ('public.auction_retentions','public.auction_retention_turns') order by 1,2`;
 console.log('Existing columns:',JSON.stringify(columns));
 console.log('Existing constraints:',JSON.stringify(constraints));
 if(process.argv.includes('--apply')){
  await db.unsafe(readFileSync(resolve('../supabase/migrations/'+version+'_retention_sequential.sql'),'utf8'));
  const security=await db`select c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT') as anon_read,has_table_privilege('authenticated',c.oid,'INSERT') as client_write from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('auction_retentions','auction_retention_turns')`;
  if(security.length!==2||security.some(r=>!r.relrowsecurity||r.anon_read||r.client_write))throw Error('Retention tables security verification failed');
  const registered=spawnSync(process.env.SUPABASE_CLI??(process.platform==='win32'?'supabase.exe':'supabase'),['migration','repair',version,'--status','applied','--db-url',process.env.DATABASE_URL,'--workdir',resolve('..')],{encoding:'utf8',windowsHide:true});
  if(registered.status!==0)throw Error('Schema verified, but register migration '+version+' as applied using migration repair.');
  console.log('PASS: sequential retention schema installed and registered. RLS enabled on auction_retentions and auction_retention_turns; browser access revoked. Existing records were not modified.');
 }else console.log('Dry run only. Re-run with --apply to install migration '+version+'.');
}catch(e){console.error({code:e.code??'RETENTION_SCHEMA_ERROR',message:e.code?'Database operation failed; credentials were not logged.':e.message});process.exitCode=1;}finally{await db.end();}
