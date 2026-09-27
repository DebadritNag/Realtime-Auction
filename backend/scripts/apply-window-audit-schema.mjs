import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import postgres from 'postgres';
const url=process.env.DATABASE_URL;if(!url)throw Error('DATABASE_URL required');
const version='20260927071218';
const db=postgres(url,{ssl:'require',prepare:false,max:1,connect_timeout:15});
try{
 const [current]=await db`select to_regclass('public.manager_transfer_window_team_snapshots') as present`;
 if(!current.present)await db.unsafe(readFileSync(resolve('../supabase/migrations/'+version+'_manager_window_audits.sql'),'utf8'));
 const [verified]=await db`select count(*)::int as n from pg_trigger where tgname in ('assign_transfer_window','capture_window_budgets','frozen_window','frozen_window_budget','window_identity') and not tgisinternal`;
 if(verified.n!==10)throw Error('Window audit trigger verification failed');
 const result=spawnSync(process.env.SUPABASE_CLI??(process.platform==='win32'?'supabase.exe':'supabase'),['migration','repair',version,'--status','applied','--db-url',url,'--workdir',resolve('..')],{encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw Error('Schema applied, but migration-history registration failed. Run migration repair for '+version+'.');
 console.log('Window audit schema verified; migration '+version+' registered. Legacy history retained without fabricated snapshots.');
}catch(error){console.error('Window audit migration failed:',error.code??error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[DATABASE_URL]'));process.exitCode=1;}finally{await db.end();}

