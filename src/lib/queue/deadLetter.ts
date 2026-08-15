import { prisma } from '../prisma.js';
import { logger } from '../logger.js';

/**
 * Dead-letter uniforme para as filas BullMQ deste domínio (Onda 7 — "idempotência e dead-letter
 * uniformes nas filas que são sua propriedade").
 *
 * BullMQ já mantém jobs falhados no Redis (`getFailedCount`/`getJobs('failed')`), mas com uma
 * retenção limitada (`removeOnFail`) e sem nenhuma trilha consultável fora do Redis — um job que
 * esgotou todas as tentativas simplesmente some depois do TTL, sem deixar rastro para auditoria ou
 * para um operador decidir se vale reprocessar manualmente. Reaproveita o `AuditLog` (já
 * persistente, sob RLS quando há tenant conhecido) em vez de um modelo novo — mesmo padrão já
 * usado por `automation-history.service.ts` para o histórico de execução de automações.
 *
 * Chame isto só na FALHA FINAL (quando `attemptsMade >= opts.attempts`), nunca a cada tentativa —
 * senão o AuditLog cresce a cada retry intermediário, que já tem sinal suficiente no log estruturado.
 */

const SENSITIVE_KEY = /(authorization|api[-_]?key|token|secret|password|webhook|cookie)/i;
const MAX_STRING_LENGTH = 500;

function sanitize(value: unknown, depth = 0): unknown {
    if (depth > 4) return '[TRUNCATED_DEPTH]';
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .slice(0, 100)
                .map(([key, entry]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitize(entry, depth + 1)]),
        );
    }
    return String(value).slice(0, MAX_STRING_LENGTH);
}

function sanitizeError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [REDACTED]')
        .replace(/\b(?:gsk|sk)[_-][A-Za-z0-9_-]{12,}\b/gi, '[REDACTED]')
        .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"',\s}]+/gi, '$1=[REDACTED]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_STRING_LENGTH);
}

export interface DeadLetterInput {
    /** Nome da fila BullMQ (ex.: `LEADS_QUEUE_NAME`). */
    queue: string;
    jobId: string | null | undefined;
    jobName: string;
    /** Tenant do job, quando conhecido — nem todo job tem um (ex.: tick global do Bitrix). */
    organizationId?: string | null;
    attemptsMade: number;
    error: unknown;
    /** Payload do job, sanitizado antes de persistir (nunca segredo/token cru). */
    data?: unknown;
}

/** Nunca lança: registrar a falha na dead-letter é observabilidade, não pode virar uma segunda falha. */
export async function recordDeadLetter(input: DeadLetterInput): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                action: 'QUEUE_DEAD_LETTER',
                entity: 'Queue',
                entityId: input.jobId ?? null,
                tenantId: input.organizationId ?? null,
                details: JSON.stringify({
                    queue: input.queue,
                    jobName: input.jobName,
                    attemptsMade: input.attemptsMade,
                    error: sanitizeError(input.error),
                    data: input.data !== undefined ? sanitize(input.data) : undefined,
                    timestamp: new Date().toISOString(),
                }),
            },
        });
    } catch (err) {
        logger.error({ err, queue: input.queue, jobId: input.jobId }, 'Falha ao registrar job na dead-letter (AuditLog indisponível)');
    }
}

/** `true` quando esta foi a última tentativa configurada para o job (falha final, não um retry intermediário). */
export function isFinalAttempt(attemptsMade: number, attemptsConfigured: number | undefined): boolean {
    return attemptsMade >= (attemptsConfigured ?? 1);
}
