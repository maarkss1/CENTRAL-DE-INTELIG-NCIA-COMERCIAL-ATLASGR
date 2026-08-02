import { z } from 'zod';
import 'dotenv/config';
import { logger } from '../lib/logger.js';

const envSchema = z.object({
  // Sem default: um deployment que esqueça de definir NODE_ENV deve falhar ao subir
  // em vez de silenciosamente assumir 'development' (e, com isso, habilitar bypasses
  // de autenticação e CORS permissivo destinados apenas a ambiente local).
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().default('3000'),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  REDIS_URL: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MEILI_MASTER_KEY: z.string().optional(),
  MEILI_HOST: z.string().optional(),
  PROSPECTING_PROVIDER_MODE: z.enum(['free', 'hybrid']).default('free'),
  CNPJ_PROVIDER: z.enum(['brasilapi']).default('brasilapi'),
  // Default seguro (fail-closed): o bypass de autenticação de desenvolvimento só
  // deve ficar ativo quando alguém define ALLOW_DEV_AUTH_BYPASS=true explicitamente.
  ALLOW_DEV_AUTH_BYPASS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  JSON_BODY_LIMIT: z.string().default('2mb'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  EXPOSE_METRICS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  ENABLE_SEARCH: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),

  // ── SDR de voz (Birth Voices Hub) ────────────────────────────────────────
  // Todas opcionais: sem elas a integração fica inerte (nenhuma ligação é disparada e o webhook
  // responde 503), em vez de impedir a aplicação inteira de subir.
  BIRTH_VOICES_URL: z.string().url().optional(),
  BIRTH_VOICES_API_KEY: z.string().optional(),
  BIRTH_VOICES_AGENT_ID: z.string().optional(),
  // Segredo compartilhado que valida a assinatura HMAC dos webhooks de resultado da ligação.
  BIRTH_VOICES_WEBHOOK_SECRET: z.string().optional(),
  // URL pública desta aplicação — é o endereço que mandamos ao Birth Voices Hub para ele nos
  // devolver o resultado da chamada, então precisa ser alcançável de fora.
  PUBLIC_BASE_URL: z.string().url().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  logger.error({ errors: _env.error.format() }, '❌ Erro de Validação nas Variáveis de Ambiente');
  process.exit(1);
}

// Trava de segurança: nunca subir em produção com o bypass de autenticação ativo,
// mesmo que alguma configuração/segredo tenha ativado a flag por engano.
if (_env.data.NODE_ENV === 'production' && _env.data.ALLOW_DEV_AUTH_BYPASS) {
  logger.error('❌ ALLOW_DEV_AUTH_BYPASS=true não é permitido com NODE_ENV=production. Abortando inicialização.');
  process.exit(1);
}

export const env = _env.data;
