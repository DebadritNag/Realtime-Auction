import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import postgres from 'postgres';
const url=process.env.DATABASE_URL;if(!url)throw Error('DATABASE_URL required');
const version='20260926185656';
const db=postgres(url,{ssl:'require',prepare:false,max:1,connect_timeout:15});
try{
 const current=await db`select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.manager_team_sheets'::regclass and conname='manager_team_sheets_formation_check'`;
 if(!current.length)throw Error('Existing formation constraint was not found; inspect the schema before proceeding.');
 if(!current[0].definition.includes('5-4-1 Diamond'))await db.unsafe(readFileSync(resolve('../supabase/migrations/'+version+'_manager_formation_library.sql'),'utf8'));
 const verified=await db`select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.manager_team_sheets'::regclass and conname='manager_team_sheets_formation_check'`;
 if(!verified[0]?.definition.includes('5-4-1 Diamond'))throw Error('Formation constraint verification failed');
 const result=spawnSync(process.env.SUPABASE_CLI??(process.platform==='win32'?'supabase.exe':'supabase'),['migration','repair',version,'--status','applied','--db-url',url,'--workdir',resolve('..')],{encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw Error('Schema applied, but migration-history registration failed. Run migration repair for '+version+'.');
 console.log('Formation constraint verified; migration '+version+' registered. Existing sheets retained.');
}catch(error){console.error('Formation migration failed:',error.code??error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[DATABASE_URL]'));process.exitCode=1;}finally{await db.end();}
