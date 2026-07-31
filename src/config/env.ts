import { z } from 'zod';
import 'dotenv/config';
import { logger } from '../lib/logger.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  REDIS_URL: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  MEILI_MASTER_KEY: z.string().optional(),
  MEILI_HOST: z.string().optional(),
  PROSPECTING_PROVIDER_MODE: z.enum(['free', 'hybrid']).default('free'),
  CNPJ_PROVIDER: z.enum(['brasilapi']).default('brasilapi'),
  ALLOW_DEV_AUTH_BYPASS: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  JSON_BODY_LIMIT: z.string().default('2mb'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  EXPOSE_METRICS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  ENABLE_SEARCH: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  logger.error({ errors: _env.error.format() }, '❌ Erro de Validação nas Variáveis de Ambiente');
  process.exit(1);
}

export const env = _env.data;
