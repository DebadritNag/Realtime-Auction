import postgres from 'postgres';
const db=postgres(process.env.DATABASE_URL,{ssl:'require',prepare:false,max:1,connect_timeout:15});
try {
 console.log(JSON.stringify(await db`select to_regclass('public.manager_secret_heroes') as heroes`));
 console.log(JSON.stringify(await db`select table_name,column_name,is_nullable from information_schema.columns where table_schema='public' and table_name in ('manager_secret_heroes','manager_tournament_players') and column_name in ('overall','identity','display_order')`));
 console.log(JSON.stringify(await db`select c.conname, pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_class t on t.oid=c.conrelid where t.relname in ('manager_tournament_players','manager_transfer_transactions','manager_tournament_events') and c.contype='c'`));
}catch(e){console.error({code:e.code});process.exitCode=1;}finally{await db.end();}
