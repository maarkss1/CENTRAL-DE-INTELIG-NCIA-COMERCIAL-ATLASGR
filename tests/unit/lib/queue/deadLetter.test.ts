import { describe, it, expect, vi, beforeEach } from 'vitest';

const auditLogCreateMock = vi.fn();
vi.mock('../../../../src/lib/prisma.js', () => ({
    prisma: { auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) } },
}));

vi.mock('../../../../src/lib/logger.js', () => ({
    logger: { error: vi.fn() },
}));

const { recordDeadLetter, isFinalAttempt } = await import('../../../../src/lib/queue/deadLetter.js');

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

    it('assume 1 tentativa quando `attempts` não foi configurado no job', () => {
        expect(isFinalAttempt(1, undefined)).toBe(true);
    });
});

describe('recordDeadLetter', () => {
    it('persiste a falha no AuditLog com a fila, tentativas e erro sanitizado', async () => {
        await recordDeadLetter({
            queue: 'leads-enrichment',
            jobId: 'job-1',
            jobName: 'qualify-lead',
            organizationId: 'org-1',
            attemptsMade: 3,
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
        expect(details.attemptsMade).toBe(3);
        expect(details.error).toContain('[REDACTED]');
        expect(details.error).not.toContain('sk-abcdefghijklmnop');
        expect(details.data).toEqual({ leadId: 'lead-1' });
    });

    it('nunca lança — falha ao persistir a dead-letter não pode virar uma segunda falha', async () => {
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
