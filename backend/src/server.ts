import {SafeDialogueProvider,LLMNegotiationDialogueProvider,GroqNegotiationDialogueProvider} from './modules/manager-mode/negotiation/dialogue.provider.js';
import { readCompletedAuction } from './modules/manager-mode/auction-snapshot.repository.js';
import { archiveCompletedAuction } from './modules/manager-mode/completed-auction-archive.js';
import { MemoryManagerRepository } from './modules/manager-mode/manager.repository.js';
import { PostgresManagerRepository, PostgresManagerIdentityRepository } from './modules/manager-mode/postgres-manager.repository.js';
import { z } from 'zod';
import { buildApp } from './app.js';
import { readEnvironment } from './config/env.js';
import { JwtAuthService, StaticTokenAuthService } from './modules/auth-context/auth.service.js';
import { FileRoomRepository } from './repositories/file.js';
import { MemoryRoomRepository } from './repositories/memory.js';
import { CatalogPlayerRepository } from './modules/players/player.service.js';
import { connectDatabase } from './repositories/postgres.js';

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

const auctionRepository=env.STORAGE==='file'?new FileRoomRepository(env.DATA_DIR):new MemoryRoomRepository();
const auctionSource=async(id:string)=>managerDb ? (await readCompletedAuction(managerDb,id)) ?? (await auctionRepository.listRecoverable()).find(r=>r.id===id)??null : (await auctionRepository.listRecoverable()).find(r=>r.id===id)??null;
const { app } = await buildApp({
  managerAuctionSource: auctionSource,
  managerPrepareAuction: managerDb ? async(id,user)=>{const room=(await auctionRepository.listRecoverable()).find(r=>r.id===id);if(room)await archiveCompletedAuction(managerDb,room,user);} : undefined,
  database: managerDb??undefined,
  authService,
  negotiationDialogue:new SafeDialogueProvider(env.NEGOTIATION_DIALOGUE_PROVIDER==='groq'&&env.GROQ_API_KEY?new GroqNegotiationDialogueProvider(env.GROQ_API_KEY,env.GROQ_MODEL):env.NEGOTIATION_DIALOGUE_PROVIDER==='custom'&&env.NEGOTIATION_DIALOGUE_URL&&env.NEGOTIATION_DIALOGUE_API_KEY?new LLMNegotiationDialogueProvider(env.NEGOTIATION_DIALOGUE_URL,env.NEGOTIATION_DIALOGUE_API_KEY):undefined,{provider:env.NEGOTIATION_DIALOGUE_PROVIDER,model:env.NEGOTIATION_DIALOGUE_PROVIDER==='groq'?env.GROQ_MODEL:'none',log:entry=>app.log.info(entry,'Negotiation dialogue')}),
  managerRepository,
  managerIdentities,
  origins: env.origins,
  logLevel: env.LOG_LEVEL,
  repository: auctionRepository,
  playerRepository: await CatalogPlayerRepository.fromDefaultPool(),
});

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
