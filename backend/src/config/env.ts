import { z } from 'zod';

const envSchema = z.object({
  // ---- Server
  PORT:             z.coerce.number().int().min(1).max(65535).default(3001),
  HOST:             z.string().default('127.0.0.1'),
  NODE_ENV:         z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_ORIGIN:  z.string().default('http://localhost:5173'),
  LOG_LEVEL:        z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),

  // ---- Storage
  STORAGE:  z.enum(['memory', 'file']).default('file'),
  DATA_DIR: z.string().default('./data'),

  // ---- Authentication
  AUTH_MODE:      z.enum(['jwt', 'development']).default('jwt'),
  JWT_SECRET:     z.string().optional(),
  JWT_JWKS_URL:   z.string().url().optional(),
  JWT_ISSUER:     z.string().optional(),
  JWT_AUDIENCE:   z.string().optional(),
  DEV_AUTH_TOKENS: z.string().optional(),

  // ---- Supabase
  SUPABASE_URL:              z.string().url().optional(),
  SUPABASE_ANON_KEY:         z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  DATABASE_URL:              z.string().optional(),

  // ---- Player catalog
  PLAYER_CATALOG_PATH: z.string().optional(),
});

export type Env = ReturnType<typeof readEnvironment>;

export function readEnvironment(input: NodeJS.ProcessEnv = process.env) {
  const env = envSchema.parse(input);

  if (env.AUTH_MODE === 'development' && env.NODE_ENV === 'production')
    throw new Error('Development authentication is forbidden in production.');

  if (env.NODE_ENV === 'production' && !env.PLAYER_CATALOG_PATH)
    throw new Error('Set PLAYER_CATALOG_PATH in production.');

  if (env.NODE_ENV === 'production' && !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in production.');

  if (env.NODE_ENV === 'production' && !env.DATABASE_URL)
    throw new Error('DATABASE_URL is required in production.');

  const origins = env.FRONTEND_ORIGIN.split(',').map(value => value.trim());
  for (const origin of origins)
    if (new URL(origin).origin !== origin)
      throw new Error('FRONTEND_ORIGIN must contain exact origins.');

  if (env.NODE_ENV === 'production' && env.JWT_JWKS_URL && !env.JWT_JWKS_URL.startsWith('https://'))
    throw new Error('Production JWKS requires HTTPS.');

  return { ...env, origins };
}
