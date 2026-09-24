import { z } from 'zod';

const envSchema = z.object({
  NEGOTIATION_DIALOGUE_PROVIDER:z.enum(['template','groq','custom']).default('template'),
  GROQ_API_KEY:z.string().optional(),
  GROQ_MODEL:z.string().regex(/^[a-zA-Z0-9_./:-]{1,120}$/).default('openai/gpt-oss-20b'),
  NEGOTIATION_DIALOGUE_URL:z.string().url().optional(),
  NEGOTIATION_DIALOGUE_API_KEY:z.string().optional(),
  // ---- Server
  PORT:             z.coerce.number().int().min(1).max(65535).default(4000),
  HOST:             z.string().default('0.0.0.0'),       // 0.0.0.0 required for Render/Railway
  NODE_ENV:         z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_ORIGIN:  z.string().default('http://localhost:3000'),
  LOG_LEVEL:        z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),

  // ---- Live auction storage; Manager Mode uses DATABASE_URL.
  STORAGE:  z.enum(['memory', 'file']).default('file'),
  DATA_DIR: z.string().default('./data'),

  // ---- Authentication (jwt or development only)
  AUTH_MODE:       z.enum(['jwt', 'development']).default('jwt'),
  JWT_SECRET:      z.string().optional(),
  JWT_JWKS_URL:    z.string().url().optional(),
  JWT_ISSUER:      z.string().optional(),
  JWT_AUDIENCE:    z.string().optional(),
  DEV_AUTH_TOKENS: z.string().optional(),

  // ---- Supabase (used by Fastify for server-side DB calls)
  SUPABASE_URL:              z.string().url().optional(),
  SUPABASE_ANON_KEY:         z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  DATABASE_URL:              z.string().optional(),

});

export type Env = ReturnType<typeof readEnvironment>;

export function readEnvironment(input: NodeJS.ProcessEnv = process.env) {
  const env = envSchema.parse(input);

  if (env.AUTH_MODE === 'development' && env.NODE_ENV === 'production')
    throw new Error('Development authentication is forbidden in production.');

  if (env.NODE_ENV === 'production' && !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in production.');

  if (env.NODE_ENV === 'production' && !env.DATABASE_URL)
    throw new Error('DATABASE_URL is required in production.');

  if(env.NODE_ENV==='production'&&env.NEGOTIATION_DIALOGUE_URL&&!env.NEGOTIATION_DIALOGUE_URL.startsWith('https://')) throw new Error('Production dialogue endpoint requires HTTPS.');
  const origins = env.FRONTEND_ORIGIN.split(',')
    .map((v) => v.trim().replace(/\/+$/, '')); // strip accidental trailing slashes
  for (const origin of origins)
    if (new URL(origin).origin !== origin)
      throw new Error(`FRONTEND_ORIGIN must contain exact origins (no path). Bad value: "${origin}"`);

  if (env.NODE_ENV === 'production' && env.JWT_JWKS_URL && !env.JWT_JWKS_URL.startsWith('https://'))
    throw new Error('Production JWKS requires HTTPS.');

  return { ...env, origins };
}
