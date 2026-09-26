import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import postgres from 'postgres';
const url=process.env.DATABASE_URL;if(!url)throw Error('DATABASE_URL required');
const cli=process.env.SUPABASE_CLI??(process.platform==='win32'?'supabase.exe':'supabase');
const version='20260926025720';
const db=postgres(url,{ssl:'require',prepare:false,max:1,connect_timeout:15});
function run(args){const result=spawnSync(cli,args,{encoding:'utf8',windowsHide:true});if(result.status!==0){const secrets=[url,new URL(url).password,decodeURIComponent(new URL(url).password)].filter(Boolean);let diagnostic=String(result.stderr||result.error?.code||'CLI error');for(const secret of secrets)diagnostic=diagnostic.split(secret).join('[REDACTED]');throw Error(diagnostic.replace(/postgres(?:ql)?:\/\/\S+/g,'[DATABASE_URL]'));}}
try{
 const tables=['manager_team_sheets','manager_match_lineups','manager_player_contracts'];
 const found=await db`select tablename from pg_tables where schemaname='public' and tablename in ${db(tables)}`;
 if(found.length!==0&&found.length!==tables.length)throw Error('Partial squad schema found; inspect before migration.');
 if(!found.length){const file=resolve('../supabase/migrations/'+version+'_manager_squad_features.sql'),wrapped=resolve('scripts/squad-schema-apply.sql');try{writeFileSync(wrapped,'do $migration$ begin execute $schema$'+readFileSync(file,'utf8')+'$schema$; end; $migration$;');run(['db','query','--db-url',url,'--file',wrapped]);}finally{try{unlinkSync(wrapped);}catch{}}}
 run(['migration','repair',version,'--status','applied','--db-url',url,'--workdir',resolve('..')]);
 console.log('Squad schema verified; only migration '+version+' recorded as applied.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{await db.end();}
