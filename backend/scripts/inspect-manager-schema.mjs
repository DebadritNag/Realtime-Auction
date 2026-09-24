import postgres from 'postgres';
const db=postgres(process.env.DATABASE_URL,{ssl:'require',prepare:false,max:1,connect_timeout:10});
try {
 const constraints=await db`select c.conrelid::regclass::text as table_name,c.conname,pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_class r on r.oid=c.conrelid where r.relname like 'manager_%' order by 1,2`;
 const functions=await db`select proname,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('save_fixture_result','accept_manager_trade','change_player_ownership')`;
 const columns=await db`select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name like 'manager_%' order by table_name,ordinal_position`;
 const counts=await db`select (select count(*) from public.auction_rooms where status='COMPLETED') as completed_auctions,(select count(*) from public.manager_tournaments) as tournaments`;
 await import('node:fs/promises').then(fs=>fs.writeFile('scripts/manager-schema-inspection.json',JSON.stringify({constraints,functions,columns,counts},null,2)));
 console.log(JSON.stringify({tables:new Set(columns.map(c=>c.table_name)).size,functions:functions.map(f=>f.proname),counts}));
}catch(e){console.error(JSON.stringify({code:e.code??'CONNECTION_FAILED',message:'Schema inspection failed; credentials were not logged.'}));process.exitCode=1;}finally{await db.end();}
