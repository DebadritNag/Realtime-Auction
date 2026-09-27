import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import postgres from 'postgres';
const url=process.env.DATABASE_URL;if(!url)throw Error('DATABASE_URL required');
const version='20260927073550';
const db=postgres(url,{ssl:'require',prepare:false,max:1,connect_timeout:15});
try{
 const [current]=await db`select to_regclass('public.manager_secret_heroes') as present`;
 if(!current.present)await db.unsafe(readFileSync(resolve('../supabase/migrations/'+version+'_manager_secret_heroes.sql'),'utf8'));
 const [verified]=await db`select count(*)::int as n from pg_trigger where tgname in ('manager_hero_ownership_guard','manager_hero_claim_guard') and not tgisinternal`;
 if(verified.n!==2)throw Error('Secret Hero trigger verification failed');
 const result=spawnSync(process.env.SUPABASE_CLI??(process.platform==='win32'?'supabase.exe':'supabase'),['migration','repair',version,'--status','applied','--db-url',url,'--workdir',resolve('..')],{encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw Error('Schema applied, but migration-history registration failed. Run migration repair for '+version+'.');
 console.log('Secret Hero schema verified; migration '+version+' registered. Private pool and permanent ownership rules applied.');
}catch(error){console.error('Secret Hero migration failed:',error.code??error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[DATABASE_URL]'));process.exitCode=1;}finally{await db.end();}

