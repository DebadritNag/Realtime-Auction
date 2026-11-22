import {SafeDialogueProvider,LLMNegotiationDialogueProvider,GroqNegotiationDialogueProvider} from './modules/manager-mode/negotiation/dialogue.provider.js';
import { loadManagerAuction } from './modules/manager-mode/auction-snapshot.repository.js';
import { archiveCompletedAuction } from './modules/manager-mode/completed-auction-archive.js';
import { MemoryManagerRepository } from './modules/manager-mode/manager.repository.js';
import { PostgresManagerRepository, PostgresManagerIdentityRepository } from './modules/manager-mode/postgres-manager.repository.js';
import { z } from 'zod';
import { buildApp } from './app.js';
import { readEnvironment } from './config/env.js';
import { JwtAuthService, StaticTokenAuthService } from './modules/auth-context/auth.service.js';
import { FileRoomRepository } from './repositories/file.js';
import { MemoryRoomRepository } from './repositories/memory.js';
import { PostgresLiveRoomRepository } from './repositories/postgres-live.js';
import type { RoomRepository } from './repositories/interfaces.js';
import { CatalogPlayerRepository } from './modules/players/player.service.js';
import { connectDatabase } from './repositories/postgres.js';
import { resolveFc26Config } from './modules/fc26/fc26.config.js';
import { PostgresRetentionLedger } from './modules/retention/retention.ledger.js';
import { MemoryFc26Catalog, PostgresFc26Catalog, type Fc26Catalog } from './modules/fc26/fc26.catalog.js';

const env = readEnvironment();

const authService =
  env.AUTH_MODE === 'development'
    ? new StaticTokenAuthService(
        new Map(
          Object.entries(
            z.record(
              z.object({
                userId: z.string().min(1).max(200),
                username: z.string().max(100).optional(),
              }).strict()
            ).parse(JSON.parse(env.DEV_AUTH_TOKENS ?? '{}'))
          )
        )
      )
    : new JwtAuthService({
        secret:   env.JWT_SECRET,
        jwksUrl:  env.JWT_JWKS_URL || (env.SUPABASE_URL ? env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/.well-known/jwks.json' : undefined),
        issuer:   z.string().min(1).parse(env.JWT_ISSUER || (env.SUPABASE_URL ? env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1' : undefined)),
        audience: z.string().min(1).parse(env.JWT_AUDIENCE || 'authenticated'),
      });

// ── Manager Mode persistence ──────────────────────────────────────────────────
// Uses Postgres (DATABASE_URL) whenever available so tournaments survive restarts.
// Falls back to in-memory only when DATABASE_URL is absent (local dev without DB).
const managerDb = env.DATABASE_URL ? connectDatabase(env.DATABASE_URL) : null;
const managerRepository = managerDb
  ? new PostgresManagerRepository(managerDb)
  : new MemoryManagerRepository();
const managerIdentities = managerDb
  ? new PostgresManagerIdentityRepository(managerDb)
  : undefined;

if (managerDb) {
  // Warm the connection and verify the Manager Mode table is reachable
  managerDb`SELECT id FROM public.manager_tournaments LIMIT 1`
    .then(() => console.log('[manager-mode] persistence=postgres initialized=true'))
    .catch(err => console.error('[manager-mode] persistence initialization failed:', 'Connection or schema unavailable'));
} else {
  console.warn('[manager-mode] DATABASE_URL not set — using in-memory repository (data lost on restart)');
}

// -- FC26 CSV database -----------------------------------------------------
// Non-fatal boot import. Falls back to an in-memory catalog when the FC26 schema is not installed.
const fc26Config = resolveFc26Config(env);
let fc26: Fc26Catalog = managerDb ? new PostgresFc26Catalog(managerDb, fc26Config) : new MemoryFc26Catalog(fc26Config);
const importFc26 = async (catalog: Fc26Catalog) => {
  const report = await catalog.importAll();
  await catalog.stats();
  console.log(`[fc26] imported=${report.imported} skippedDuplicates=${report.skippedDuplicates} invalidRows=${report.invalidRows.length} missingFiles=${report.missingFiles.length}`);
};
try { await importFc26(fc26); }
catch (error) {
  const code = (error as { code?: string }).code;
  console.warn(`[fc26] ${code === 'FC26_SCHEMA_MISSING' ? 'schema missing; apply migration 20261001090000 (backend/scripts/apply-fc26-schema.mjs)' : 'database import failed'}; using in-memory catalog`);
  fc26 = new MemoryFc26Catalog(fc26Config);
  try { await importFc26(fc26); } catch { console.warn('[fc26] in-memory import failed; FC26 source unavailable'); }
}
const liveRepository=env.STORAGE==='postgres'&&managerDb?new PostgresLiveRoomRepository(managerDb):null;
if(liveRepository){
  try{await liveRepository.assertReady();console.log('[auction] storage=postgres');}
  catch(error){
    const missing=(error as {code?:string}).code==='42P01';
    console.error(missing?'[auction] FATAL: table public.live_room_snapshots is missing; apply migration 20261003090000_live_room_snapshots.sql before starting.':'[auction] FATAL: live room storage is unreachable.');
    process.exit(1);
  }
}
const auctionRepository:RoomRepository=liveRepository??(env.STORAGE==='file'?new FileRoomRepository(env.DATA_DIR):new MemoryRoomRepository());
const auctionSource=(id:string)=>loadManagerAuction(managerDb,auctionRepository,id,app.log);
const retentionLedger = managerDb ? new PostgresRetentionLedger(managerDb) : undefined;
const { app } = await buildApp({
  retentionLedger,
  managerAuctionSource: auctionSource,
  managerPrepareAuction: managerDb ? async(id,user)=>{const room=await auctionRepository.findById(id);if(room)await archiveCompletedAuction(managerDb,room,user);} : undefined,
  database: managerDb??undefined,
  authService,
  negotiationDialogue:new SafeDialogueProvider(env.NEGOTIATION_DIALOGUE_PROVIDER==='groq'&&env.GROQ_API_KEY?new GroqNegotiationDialogueProvider(env.GROQ_API_KEY,env.GROQ_MODEL):env.NEGOTIATION_DIALOGUE_PROVIDER==='custom'&&env.NEGOTIATION_DIALOGUE_URL&&env.NEGOTIATION_DIALOGUE_API_KEY?new LLMNegotiationDialogueProvider(env.NEGOTIATION_DIALOGUE_URL,env.NEGOTIATION_DIALOGUE_API_KEY):undefined,{provider:env.NEGOTIATION_DIALOGUE_PROVIDER,model:env.NEGOTIATION_DIALOGUE_PROVIDER==='groq'?env.GROQ_MODEL:'none',log:entry=>app.log.info(entry,'Negotiation dialogue')}),
  managerRepository,
  managerIdentities,
  origins: env.origins,
  logLevel: env.LOG_LEVEL,
  repository: auctionRepository,
  playerRepository: await CatalogPlayerRepository.fromDefaultPool(),
  fc26,
});

retentionLedger?.setLogger(app.log);
if(managerRepository instanceof PostgresManagerRepository)managerRepository.setLogger(app.log);
if(liveRepository&&env.LIVE_ROOM_LOBBY_TTL_DAYS>0){
  // Only LOBBY rooms untouched for the TTL are deleted. The first run is delayed, never at startup.
  const purge=()=>{liveRepository.purgeStale(env.LIVE_ROOM_LOBBY_TTL_DAYS).then(n=>{if(n>0)app.log.info({purged:n},'Purged abandoned lobby rooms');}).catch(()=>app.log.warn('Lobby cleanup failed'));};
  const first=setTimeout(purge,60_000);first.unref();
  const every=setInterval(purge,6*60*60_000);every.unref();
  app.addHook('onClose',async()=>{clearTimeout(first);clearInterval(every);});
}
if(managerDb)app.addHook('onClose',async()=>{await managerDb.end();});

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close()
      .then(() => { process.exitCode = 0; })
      .catch(() => { process.exitCode = 1; });
  });

// PORT: Render/Railway inject $PORT at runtime.
// HOST: must be 0.0.0.0 on Render so the platform can route traffic in.
const port = Number(process.env.PORT ?? env.PORT);
const host = process.env.HOST ?? env.HOST;   // env.HOST defaults to '0.0.0.0'

try {
  await app.listen({ port, host });
} catch {
  app.log.fatal('Server failed to start');
  process.exitCode = 1;
  await app.close();
}
