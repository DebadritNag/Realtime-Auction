import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import postgres from 'postgres';
const url=process.env.DATABASE_URL;if(!url)throw Error('DATABASE_URL required');
const cli=process.env.SUPABASE_CLI??(process.platform==='win32'?'supabase.exe':'supabase');
const db=postgres(url,{ssl:'require',prepare:false,max:1,connect_timeout:15});
function run(args){const result=spawnSync(cli,args,{encoding:'utf8',windowsHide:true});if(result.status!==0){const secrets=[url,new URL(url).password,decodeURIComponent(new URL(url).password)].filter(Boolean);let diagnostic=String(result.stderr||result.error?.code||'CLI error');for(const secret of secrets)diagnostic=diagnostic.split(secret).join('[REDACTED]');throw Error(diagnostic.replace(/postgres(?:ql)?:\/\/\S+/g,'[DATABASE_URL]'));}}
function apply(file){const wrapped=resolve('scripts/season-schema-apply.sql');try{writeFileSync(wrapped,'do $migration$ begin execute $schema$'+readFileSync(resolve('../supabase/migrations/'+file),'utf8')+'$schema$; end; $migration$;');run(['db','query','--db-url',url,'--file',wrapped]);}finally{try{unlinkSync(wrapped);}catch{}}}
function record(version){run(['migration','repair',version,'--status','applied','--db-url',url,'--workdir',resolve('..')]);}
try{
 const tables=['manager_seasons','manager_season_settings','manager_season_bonuses'];
 const found=await db`select tablename from pg_tables where schemaname='public' and tablename in ${db(tables)}`;
 if(found.length!==0&&found.length!==tables.length)throw Error('Partial season schema found; inspect before migration.');
 if(!found.length)apply('20260925162642_manager_seasons_sales.sql');
 record('20260925162642');
 const pairing=await db`select indexdef from pg_indexes where schemaname='public' and indexname='mf_unique_pairing_per_matchday'`;
 if(!pairing[0]?.indexdef.includes('season_id'))apply('20260925164617_manager_fixture_season_pairing.sql');
 record('20260925164617');
 console.log('Season schema and season-scoped fixture pairing verified; both migrations recorded.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{await db.end();}
