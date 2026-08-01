/**
 * Prova que os GATILHOS estão de fato ligados: não basta o motor funcionar se ninguém o chama.
 * Aqui o motor é mockado e verificamos que o fluxo real de conclusão de atividade o aciona — e,
 * igualmente importante, que ele NÃO é acionado nos outros casos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handleMock = vi.fn().mockResolvedValue(0);

vi.mock('@/features/automations/automation.engine', () => ({
    automationEngine: { handle: (e: unknown) => handleMock(e) },
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        activity: { findFirst: vi.fn(), update: vi.fn() },
        timelineEvent: { create: vi.fn() },
    },
}));

import { prisma } from '@/lib/prisma';
import { activityService } from '@/features/activities/services/activity.service';

const activity = prisma.activity as unknown as Record<string, ReturnType<typeof vi.fn>>;
const timeline = prisma.timelineEvent as unknown as Record<string, ReturnType<typeof vi.fn>>;

const ORG = 'org-1';

const atual = {
    id: 'act-1',
    type: 'Reuniao',
    status: 'Pendente',
    owner: 'Marcelo',
    leadId: 'lead-9',
    organizationId: ORG,
};

beforeEach(() => {
    vi.clearAllMocks();
    handleMock.mockResolvedValue(0);
    activity.findFirst.mockResolvedValue(atual);
    activity.update.mockResolvedValue({ ...atual, status: 'Concluida' });
    timeline.create.mockResolvedValue({});
});

describe('Gatilho: atividade concluída', () => {
    it('aciona o motor quando a atividade passa para Concluída', async () => {
        await activityService.update(ORG, 'act-1', { status: 'Concluída' });

        // O disparo é sem await; damos um tick para o microtask rodar.
        await Promise.resolve();

        expect(handleMock).toHaveBeenCalledTimes(1);
        const evento = handleMock.mock.calls[0][0];
        expect(evento).toMatchObject({
            organizationId: ORG,
            trigger: 'Atividade concluída',
            entity: 'Activity',
            entityId: 'act-1',
        });
        // O tipo vai no rótulo de exibição, não no identificador do enum do Prisma.
        expect(evento.data.type).toBe('Reunião');
        expect(evento.data.leadId).toBe('lead-9');
    });

    it('não aciona o motor em mudança para outro status', async () => {
        await activityService.update(ORG, 'act-1', { status: 'Cancelada' });
        await Promise.resolve();
        expect(handleMock).not.toHaveBeenCalled();
    });

    it('não aciona o motor quando o status não muda', async () => {
        await activityService.update(ORG, 'act-1', { observations: 'só uma nota' });
        await Promise.resolve();
        expect(handleMock).not.toHaveBeenCalled();
    });

    it('falha do motor não derruba a conclusão da atividade', async () => {
        handleMock.mockRejectedValue(new Error('motor quebrado'));

        await expect(activityService.update(ORG, 'act-1', { status: 'Concluída' }))
            .resolves.toBeDefined();
    });
});
