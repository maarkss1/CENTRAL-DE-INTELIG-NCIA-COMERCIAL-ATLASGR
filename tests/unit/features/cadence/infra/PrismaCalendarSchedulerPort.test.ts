import { afterEach, describe, expect, it, vi } from 'vitest';

const cadenceRunFindFirst = vi.fn().mockResolvedValue(null);
const cadenceCalendarEventCreate = vi.fn().mockResolvedValue({});

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        cadenceRun: { findFirst: (...args: unknown[]) => cadenceRunFindFirst(...args) },
        cadenceCalendarEvent: { create: (...args: unknown[]) => cadenceCalendarEventCreate(...args) },
    },
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../../src/features/integrations/google/google.service.js', () => ({
    createCalendarEvent: vi.fn().mockResolvedValue('real-google-event-id'),
}));

const { prismaCalendarSchedulerPort } = await import('../../../../../src/features/cadence/infra/PrismaCalendarSchedulerPort');

const draft = {
    organizationId: 'org-1',
    leadId: 'lead-1',
    start: new Date('2026-08-20T14:00:00Z'),
    end: new Date('2026-08-20T15:00:00Z'),
    attendeeEmails: ['contato@exemplo.com', 'vendedor@atlasgr.com.br'],
    ownerUserId: 'user-1',
    title: 'Reunião comercial — Empresa Exemplo',
    confirmationEvidenceType: 'manual-verified' as const,
    confirmationEvidenceRef: 'note-1',
};

afterEach(() => {
    vi.clearAllMocks();
});

describe('prismaCalendarSchedulerPort', () => {
    it('devolve um googleEventId sintético (stub de transporte — nenhuma chamada real ao Google)', async () => {
        const result = await prismaCalendarSchedulerPort.createEvent(draft);

        expect(result.googleEventId).toBe('real-google-event-id');
    });

    it('grava o CadenceCalendarEvent com os campos do draft mapeados para o enum do banco', async () => {
        await prismaCalendarSchedulerPort.createEvent(draft);

        expect(cadenceCalendarEventCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: 'org-1',
                leadId: 'lead-1',
                confirmationEvidenceType: 'ManualVerified',
                confirmationEvidenceRef: 'note-1',
                scheduledStart: draft.start,
                scheduledEnd: draft.end,
                ownerUserId: 'user-1',
                googleEventId: 'real-google-event-id',
            }),
        });
    });

    it('sem CadenceRun ativo para o lead: cadenceRunId gravado como null', async () => {
        cadenceRunFindFirst.mockResolvedValueOnce(null);

        await prismaCalendarSchedulerPort.createEvent(draft);

        expect(cadenceCalendarEventCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ cadenceRunId: null }),
        });
    });

    it('com CadenceRun ativo para o lead: vincula o cadenceRunId encontrado', async () => {
        cadenceRunFindFirst.mockResolvedValueOnce({ id: 'run-1' });

        await prismaCalendarSchedulerPort.createEvent(draft);

        expect(cadenceRunFindFirst).toHaveBeenCalledWith({
            where: { organizationId: 'org-1', leadId: 'lead-1', status: 'Active' },
            select: { id: true },
        });
        expect(cadenceCalendarEventCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ cadenceRunId: 'run-1' }),
        });
    });
});
