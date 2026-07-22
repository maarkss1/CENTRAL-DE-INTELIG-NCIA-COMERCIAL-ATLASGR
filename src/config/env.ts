import { z } from 'zod';
import 'dotenv/config';
import { logger } from '../lib/logger.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  REDIS_URL: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  MEILI_MASTER_KEY: z.string().optional(),
  MEILI_HOST: z.string().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  logger.error({ errors: _env.error.format() }, '❌ Erro de Validação nas Variáveis de Ambiente');
  process.exit(1);
}

export const env = _env.data;
