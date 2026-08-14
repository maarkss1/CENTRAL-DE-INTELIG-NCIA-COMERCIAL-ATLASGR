import { prisma } from '../../lib/prisma.js';

export type AutomationExecutionStatus = 'success' | 'failed';

export interface AutomationExecutionHistoryInput {
    automationId: string;
    automationName: string;
    organizationId: string;
    correlationId: string;
    trigger: string;
    entity: string;
    entityId: string;
    action: string;
    actionConfig: unknown;
    status: AutomationExecutionStatus;
    startedAt: Date;
    finishedAt: Date;
    retryCount?: number;
    error?: unknown;
}

const SENSITIVE_KEY = /(authorization|api[-_]?key|token|secret|password|webhook|cookie)/i;
const MAX_STRING_LENGTH = 500;

function sanitizeValue(value: unknown, depth = 0): unknown {
    if (depth > 5) return '[TRUNCATED_DEPTH]';
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .slice(0, 100)
                .map(([key, entry]) => [
                    key,
                    SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeValue(entry, depth + 1),
                ]),
        );
    }
    return String(value).slice(0, MAX_STRING_LENGTH);
}

export function sanitizeAutomationError(error: unknown): string | null {
    if (error == null) return null;
    const raw = error instanceof Error ? error.message : String(error);
    return raw
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [REDACTED]')
        .replace(/\b(?:gsk|sk)[_-][A-Za-z0-9_-]{12,}\b/gi, '[REDACTED]')
        .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"',\s}]+/gi, '$1=[REDACTED]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_STRING_LENGTH) || null;
}

export const automationHistoryService = {
    async record(input: AutomationExecutionHistoryInput): Promise<void> {
        const details = {
            version: 1,
            correlationId: input.correlationId,
            automationName: input.automationName,
            trigger: input.trigger,
            entity: input.entity,
            entityId: input.entityId,
            action: input.action,
            actionConfigSnapshot: sanitizeValue(input.actionConfig),
            status: input.status,
            retryCount: input.retryCount ?? 0,
            error: sanitizeAutomationError(input.error),
            startedAt: input.startedAt.toISOString(),
            finishedAt: input.finishedAt.toISOString(),
            durationMs: Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime()),
        };

        await prisma.auditLog.create({
            data: {
                action: 'AUTOMATION_EXECUTION',
                entity: 'Automation',
                entityId: input.automationId,
                tenantId: input.organizationId,
                details: JSON.stringify(details),
            },
        });
    },
};
