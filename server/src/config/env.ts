/**
 * Environment configuration.
 *
 * Validated at boot with zod so a missing secret fails immediately and loudly,
 * rather than at 2am when the first token needs signing.
 */
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().default('postgresql://pfos:pfos@localhost:5432/pfos?schema=public'),

  JWT_ACCESS_SECRET: z.string().min(32, 'Use at least 32 characters').default('change-me-to-a-64-character-hex-string-before-running-anything-development-access'),
  JWT_REFRESH_SECRET: z.string().min(32, 'Use at least 32 characters').default('change-me-to-a-different-64-character-hex-string-entirely-ok-development-refresh'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),

  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().default(10),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
