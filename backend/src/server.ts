import { z } from 'zod';
import { buildApp } from './app.js';
import { readEnvironment } from './config/env.js';
import { JwtAuthService, StaticTokenAuthService } from './modules/auth-context/auth.service.js';
import { FileRoomRepository } from './repositories/file.js';
import { MemoryRoomRepository } from './repositories/memory.js';
import { CatalogPlayerRepository, demoPlayers } from './modules/players/player.service.js';
import {connectDatabase,PostgresRoomRepository,PostgresPlayerRepository} from './repositories/postgres.js';
import {SupabaseAuthService} from './modules/auth-context/supabase-auth.service.js';
const env = readEnvironment();
const database = env.STORAGE === 'postgres' ? connectDatabase(z.string().min(1).parse(env.DATABASE_URL)) : undefined;
const authService = env.AUTH_MODE === 'supabase'
  ? new SupabaseAuthService(z.string().url().parse(env.SUPABASE_URL),z.string().min(1).parse(env.SUPABASE_ANON_KEY))
  : env.AUTH_MODE === 'development'
  ? new StaticTokenAuthService(new Map(Object.entries(z.record(z.object({ userId: z.string().min(1).max(200), username: z.string().max(100).optional() }).strict())
    .parse(JSON.parse(env.DEV_AUTH_TOKENS ?? '{}')))))
  : new JwtAuthService({ secret: env.JWT_SECRET, jwksUrl: env.JWT_JWKS_URL,
      issuer: z.string().min(1).parse(env.JWT_ISSUER), audience: z.string().min(1).parse(env.JWT_AUDIENCE) });
const { app } = await buildApp({
  database, authService, origins: env.origins, logLevel: env.LOG_LEVEL,
  repository: database ? new PostgresRoomRepository(database) : env.STORAGE === 'file' ? new FileRoomRepository(env.DATA_DIR) : new MemoryRoomRepository(),
  playerRepository: database ? new PostgresPlayerRepository(database) : env.PLAYER_CATALOG_PATH ? await CatalogPlayerRepository.fromFile(env.PLAYER_CATALOG_PATH) : new CatalogPlayerRepository(demoPlayers),
});
if (database) app.addHook('onClose', async () => { await database.end(); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  void app.close().then(() => { process.exitCode = 0; }).catch(() => { process.exitCode = 1; });
});
try { await app.listen({ port: env.PORT, host: env.HOST }); }
catch { app.log.fatal('Server failed to start'); process.exitCode = 1; await app.close(); }
