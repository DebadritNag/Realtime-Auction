/** Read-only setup diagnostics. Never creates tournaments or alters auction data. */
import {connectDatabase} from '../src/repositories/postgres.js';
import {readCompletedAuction} from '../src/modules/manager-mode/auction-snapshot.repository.js';
import {PostgresManagerTournamentRepository,PostgresManagerIdentityRepository} from '../src/modules/manager-mode/postgres-manager.repository.js';
import {ManagerModeService} from '../src/modules/manager-mode/manager.service.js';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required.');
const db=connectDatabase(process.env.DATABASE_URL);
const logger={info:(data:object)=>console.log(JSON.stringify(data)),error:(data:object)=>console.error(JSON.stringify(data))};
try{
 const rows=await db<{id:string;host_user_id:string}[]>`select id,host_user_id from public.auction_rooms where status='COMPLETED' order by created_at desc limit 3`;
 const service=new ManagerModeService(new PostgresManagerTournamentRepository(db),id=>readCompletedAuction(db,id,logger),new PostgresManagerIdentityRepository(db),undefined,undefined,logger);
 for(const row of rows){try{const result=await service.preview(row.id,row.host_user_id);console.log(JSON.stringify({auctionId:row.id,status:'OK',teams:result.room.teams.length,owned:result.room.purchases.length,unowned:result.room.players.length-result.room.purchases.length,external:result.importReport.validPlayers}));}catch(error){const e=error as {code?:string;details?:object};console.error(JSON.stringify({auctionId:row.id,status:'FAILED',code:e.code,details:e.details}));process.exitCode=1;}}
 const indexes=await db<{indexname:string;indexdef:string}[]>`select indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('manager_notifications','manager_tournament_events','manager_tournament_members') order by indexname`;console.log(JSON.stringify({event:'setup_read_only_audit',auctionsChecked:rows.length,indexes}));
}catch(error){console.error(JSON.stringify({event:'setup_diagnostic_failed',code:(error as {code?:string}).code}));process.exitCode=1;}finally{await db.end();}
