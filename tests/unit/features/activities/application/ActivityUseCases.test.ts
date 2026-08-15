import { describe, it, expect, vi } from 'vitest';
import { ActivityUseCases } from '@/features/activities/application/ActivityUseCases';
import type { ActivityRepository } from '@/features/activities/domain/Activity';

// A rota /api/activities (server.ts) resolve ActivityController -> ActivityUseCases via DI (ver
// shared/di/setup.ts) — é ESTE caminho, não o serviço legado activity.service.ts, que a API
// realmente executa. O guard contra owner fabricado (ownerGuard.ts) precisa valer aqui também,
// não só no serviço legado, senão a proteção fica furada para quem chama a rota HTTP de verdade.

function buildFakeRepository(): ActivityRepository {
    return {
        findAllWithFilters: vi.fn(),
        findAllPaginated: vi.fn(),
        findRange: vi.fn(),
        createWithTimeline: vi.fn().mockResolvedValue({ id: '1' }),
        updateWithTimeline: vi.fn().mockResolvedValue({ id: '1' }),
        delete: vi.fn(),
    } as unknown as ActivityRepository;
}

describe('ActivityUseCases.createActivity — owner fabricado', () => {
    it('rejeita "Enxame de IA Atlas" antes de chegar no repositório', async () => {
        const repo = buildFakeRepository();
        const useCases = new ActivityUseCases(repo);

        await expect(
            useCases.createActivity('org-1', {
                type: 'Ligação',
                owner: 'Enxame de IA Atlas',
                date: '2026-08-15T10:00:00Z',
                status: 'Pendente',
                leadId: 'lead-1',
            } as never)
        ).rejects.toThrow(/não é um responsável real/);

        expect(repo.createWithTimeline).not.toHaveBeenCalled();
    });

    it('aceita um owner real normalmente', async () => {
        const repo = buildFakeRepository();
        const useCases = new ActivityUseCases(repo);

        await useCases.createActivity('org-1', {
            type: 'Ligação',
            owner: 'Maria Vendedora',
            date: '2026-08-15T10:00:00Z',
            status: 'Pendente',
            leadId: 'lead-1',
        } as never);

        expect(repo.createWithTimeline).toHaveBeenCalled();
    });
});

describe('ActivityUseCases.updateActivity — owner fabricado', () => {
    it('rejeita troca de owner para um nome de preenchimento', async () => {
        const repo = buildFakeRepository();
        const useCases = new ActivityUseCases(repo);

        await expect(useCases.updateActivity('org-1', 'act-1', { owner: 'Vendedor 1' } as never)).rejects.toThrow(/não é um responsável real/);
        expect(repo.updateWithTimeline).not.toHaveBeenCalled();
    });

    it('update sem mexer no owner não é afetado pelo guard', async () => {
        const repo = buildFakeRepository();
        const useCases = new ActivityUseCases(repo);

        await useCases.updateActivity('org-1', 'act-1', { status: 'Concluída' } as never);

        expect(repo.updateWithTimeline).toHaveBeenCalled();
    });
});
