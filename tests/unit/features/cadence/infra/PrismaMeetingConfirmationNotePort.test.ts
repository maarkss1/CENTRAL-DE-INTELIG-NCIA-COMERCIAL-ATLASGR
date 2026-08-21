import { afterEach, describe, expect, it, vi } from 'vitest';

const noteCreate = vi.fn().mockResolvedValue({ id: 'note-1' });

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        note: { create: (...args: unknown[]) => noteCreate(...args) },
    },
}));

const { prismaMeetingConfirmationNotePort } = await import('../../../../../src/features/cadence/infra/PrismaMeetingConfirmationNotePort');

afterEach(() => {
    vi.clearAllMocks();
});

describe('prismaMeetingConfirmationNotePort', () => {
    it('cria a Note com o leadId, o autor e um resumo do horário confirmado', async () => {
        const result = await prismaMeetingConfirmationNotePort.createConfirmationNote({
            organizationId: 'org-1',
            leadId: 'lead-1',
            authorUserId: 'user-1',
            scheduledStart: new Date('2026-08-20T14:00:00Z'),
            scheduledEnd: new Date('2026-08-20T15:00:00Z'),
        });

        expect(result).toEqual({ id: 'note-1' });
        expect(noteCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                leadId: 'lead-1',
                author: 'user-1',
                content: expect.stringContaining('Reunião comercial confirmada manualmente'),
            }),
            select: { id: true },
        });
    });
});
