import { describe, it, expect, vi, beforeEach } from 'vitest';

const auditLogCreateMock = vi.fn();
vi.mock('../../../../src/lib/prisma.js', () => ({
    prisma: { auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) } },
}));

vi.mock('../../../../src/lib/logger.js', () => ({
    logger: { error: vi.fn() },
}));

const { recordDeadLetter, isFinalAttempt, buildFailureState } = await import('../../../../src/lib/queue/deadLetter.js');

beforeEach(() => {
    vi.clearAllMocks();
    auditLogCreateMock.mockResolvedValue({ id: 'audit-1' });
});

describe('isFinalAttempt', () => {
    it('é falso enquanto ainda há tentativas configuradas pela frente', () => {
        expect(isFinalAttempt(1, 3)).toBe(false);
        expect(isFinalAttempt(2, 3)).toBe(false);
    });

    it('é verdadeiro quando as tentativas configuradas se esgotaram', () => {
        expect(isFinalAttempt(3, 3)).toBe(true);
        expect(isFinalAttempt(4, 3)).toBe(true);
    });

    it('assume 1 tentativa quando attempts não foi configurado', () => {
        expect(isFinalAttempt(1, undefined)).toBe(true);
    });
});

describe('failure state', () => {
    it('gera contrato comum com attempts, lastError, failedAt, correlationId e chave idempotente', () => {
        const first = buildFailureState({
            queue: 'q',
            jobId: 'job-1',
            jobName: 'run',
            attemptsMade: 3,
            error: new Error('token=sk-abcdefghijklmnop expirado'),
            correlationId: 'corr-1',
        });
        const second = buildFailureState({
            queue: 'q',
            jobId: 'job-1',
            jobName: 'run',
            attemptsMade: 3,
            error: new Error('outro erro'),
            correlationId: 'corr-1',
        });

        expect(first.attempts).toBe(3);
        expect(first.lastError).toContain('[REDACTED]');
        expect(first.lastError).not.toContain('sk-abcdefghijklmnop');
        expect(first.failedAt).toEqual(expect.any(String));
        expect(first.correlationId).toBe('corr-1');
        expect(first.reprocessKey).toBe(second.reprocessKey);
    });
});

describe('recordDeadLetter', () => {
    it('persiste a falha normalizada e mantém campos legados compatíveis', async () => {
        await recordDeadLetter({
            queue: 'leads-enrichment',
            jobId: 'job-1',
            jobName: 'qualify-lead',
            organizationId: 'org-1',
            attemptsMade: 3,
            correlationId: 'corr-1',
            error: new Error('token=sk-abcdefghijklmnop expirado'),
            data: { leadId: 'lead-1' },
        });

        expect(auditLogCreateMock).toHaveBeenCalledTimes(1);
        const data = auditLogCreateMock.mock.calls[0][0].data;
        expect(data.action).toBe('QUEUE_DEAD_LETTER');
        expect(data.entity).toBe('Queue');
        expect(data.entityId).toBe('job-1');
        expect(data.tenantId).toBe('org-1');

        const details = JSON.parse(data.details);
        expect(details.queue).toBe('leads-enrichment');
        expect(details.attempts).toBe(3);
        expect(details.attemptsMade).toBe(3);
        expect(details.lastError).toContain('[REDACTED]');
        expect(details.error).toBe(details.lastError);
        expect(details.failedAt).toEqual(expect.any(String));
        expect(details.correlationId).toBe('corr-1');
        expect(details.reprocessKey).toMatch(/^[a-f0-9]{64}$/);
        expect(details.data).toEqual({ leadId: 'lead-1' });
    });

    it('nunca lança se AuditLog estiver indisponível', async () => {
        auditLogCreateMock.mockRejectedValue(new Error('AuditLog indisponível'));
        await expect(recordDeadLetter({
            queue: 'search-indexing', jobId: 'job-2', jobName: 'add', attemptsMade: 1, error: new Error('x'),
        })).resolves.toBeUndefined();
    });

    it('redige chaves sensíveis dentro do payload do job', async () => {
        await recordDeadLetter({
            queue: 'enrichment-queue',
            jobId: 'job-3',
            jobName: 'enrich',
            attemptsMade: 3,
            error: new Error('falhou'),
            data: { companyId: 'c1', apiKey: 'segredo-real' },
        });

        const details = JSON.parse(auditLogCreateMock.mock.calls[0][0].data.details);
        expect(details.data.apiKey).toBe('[REDACTED]');
        expect(details.data.companyId).toBe('c1');
    });
});
