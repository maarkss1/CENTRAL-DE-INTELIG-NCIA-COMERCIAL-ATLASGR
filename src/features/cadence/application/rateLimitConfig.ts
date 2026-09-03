import { DEFAULT_RATE_LIMIT_POLICY, type CadenceRateLimitPolicy } from '../domain/rateLimit.js';

/**
 * Política de rate limit de cadência configurável por env var — nunca hardcoded sem nome no ponto
 * de uso (requisito da auditoria transversal, Agente 17). Lida uma vez por chamada (custo
 * irrelevante, só 3 leituras de `process.env`); um valor ausente ou inválido (não numérico, <= 0)
 * cai silenciosamente no default documentado em `domain/rateLimit.ts` — nunca desliga o limite por
 * causa de uma env var malformada.
 *
 * - `CADENCE_RATE_LIMIT_MAX_TOUCHES_PER_CONTACT` (default 3)
 * - `CADENCE_RATE_LIMIT_CONTACT_WINDOW_HOURS` (default 24)
 * - `CADENCE_RATE_LIMIT_MAX_EMAIL_RECIPIENTS_PER_DOMAIN_PER_DAY` (default 20)
 * - `CADENCE_RATE_LIMIT_MIN_MINUTES_BETWEEN_CHANNEL_TOUCHES` (default 30)
 */
export function loadCadenceRateLimitPolicy(
  env: NodeJS.ProcessEnv = process.env,
): CadenceRateLimitPolicy {
  return {
    maxTouchesPerContactWindow: envPositiveInt(
      env.CADENCE_RATE_LIMIT_MAX_TOUCHES_PER_CONTACT,
      DEFAULT_RATE_LIMIT_POLICY.maxTouchesPerContactWindow,
    ),
    contactWindowHours: envPositiveInt(
      env.CADENCE_RATE_LIMIT_CONTACT_WINDOW_HOURS,
      DEFAULT_RATE_LIMIT_POLICY.contactWindowHours,
    ),
    maxEmailRecipientsPerDomainPerDay: envPositiveInt(
      env.CADENCE_RATE_LIMIT_MAX_EMAIL_RECIPIENTS_PER_DOMAIN_PER_DAY,
      DEFAULT_RATE_LIMIT_POLICY.maxEmailRecipientsPerDomainPerDay,
    ),
    minMinutesBetweenChannelTouches: envPositiveInt(
      env.CADENCE_RATE_LIMIT_MIN_MINUTES_BETWEEN_CHANNEL_TOUCHES,
      DEFAULT_RATE_LIMIT_POLICY.minMinutesBetweenChannelTouches,
    ),
  };
}

function envPositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
