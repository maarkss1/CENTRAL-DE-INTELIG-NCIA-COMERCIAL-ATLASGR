import { createHash } from 'node:crypto';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';

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
    queue: string;
    jobId: string | null | undefined;
    jobName: string;
    organizationId?: string | null;
    attemptsMade: number;
    error: unknown;
    data?: unknown;
    /** Correlation/request id propagado pelo produtor quando disponível. */
    correlationId?: string | null;
}

export interface QueueFailureState {
    attempts: number;
    lastError: string;
    failedAt: string;
    correlationId: string | null;
    /** Chave estável para reprocessamento manual idempotente do mesmo failure state. */
    reprocessKey: string;
}

export function buildFailureState(input: Pick<DeadLetterInput, 'queue' | 'jobId' | 'jobName' | 'attemptsMade' | 'error' | 'correlationId'>): QueueFailureState {
    const lastError = sanitizeError(input.error);
    const correlationId = input.correlationId ?? null;
    const stableIdentity = `${input.queue}:${input.jobId ?? input.jobName}:${correlationId ?? 'no-correlation'}`;
    return {
        attempts: input.attemptsMade,
        lastError,
        failedAt: new Date().toISOString(),
        correlationId,
        reprocessKey: createHash('sha256').update(stableIdentity).digest('hex'),
    };
}

/** Nunca lança: failure-state não pode transformar a falha original numa segunda falha. */
export async function recordDeadLetter(input: DeadLetterInput): Promise<void> {
    const failure = buildFailureState(input);
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
                    attempts: failure.attempts,
                    attemptsMade: failure.attempts, // compatibilidade com leitores antigos
                    lastError: failure.lastError,
                    error: failure.lastError, // compatibilidade com leitores antigos
                    failedAt: failure.failedAt,
                    correlationId: failure.correlationId,
                    reprocessKey: failure.reprocessKey,
                    data: input.data !== undefined ? sanitize(input.data) : undefined,
                }),
            },
        });
    } catch (err) {
        logger.error({ err, queue: input.queue, jobId: input.jobId }, 'Falha ao registrar job na dead-letter');
    }
}

export function isFinalAttempt(attemptsMade: number, attemptsConfigured: number | undefined): boolean {
    return attemptsMade >= (attemptsConfigured ?? 1);
}
