/**
 * Cobre `deactivateCadenceSequence` (`application/sequenceService.ts`) — o use case do achado
 * "fora de escopo" do Piloto 016 (`CadenceSequence.active`/`deletedAt` já existiam no schema e já
 * eram filtrados em toda leitura, mas nenhuma rota escrevia neles). Mocka o repositório (porta),
 * não o Prisma diretamente — `PrismaCadenceSequenceRepository.test.ts` cobre o adaptador real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deactivateCadenceSequence } from '@/features/cadence/application/sequenceService';
import type {
    CadenceSequenceRepository,
    CadenceSequenceRow,
} from '@/features/cadence/application/sequenceService';

const ORG = 'org-1';

function buildSequence(overrides: Partial<CadenceSequenceRow> = {}): CadenceSequenceRow {
    return {
        id: 'seq-1',
        organizationId: ORG,
        name: 'Sequência de teste',
        description: null,
        touches: [{ order: 1, channel: 'email', delayHoursFromPrevious: 0 }],
        active: true,
        createdBy: 'user-1',
        createdAt: new Date('2026-08-01T09:00:00Z'),
        updatedAt: new Date('2026-08-01T09:00:00Z'),
        deletedAt: null,
        ...overrides,
    };
}

describe('deactivateCadenceSequence', () => {
    let repo: { [K in keyof CadenceSequenceRepository]: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        repo = {
            findById: vi.fn(),
            setActive: vi.fn(),
        };
    });

    it('devolve null quando a sequência não existe nesta organização — a rota decide o 404, não este use case', async () => {
        repo.findById.mockResolvedValue(null);

        const result = await deactivateCadenceSequence(
            repo as unknown as CadenceSequenceRepository,
            ORG,
            'seq-inexistente',
        );

        expect(result).toBeNull();
        expect(repo.setActive).not.toHaveBeenCalled();
    });

    it('desativa (active: false) uma sequência ativa encontrada', async () => {
        const active = buildSequence({ active: true });
        const deactivated = buildSequence({ active: false });
        repo.findById.mockResolvedValue(active);
        repo.setActive.mockResolvedValue(deactivated);

        const result = await deactivateCadenceSequence(
            repo as unknown as CadenceSequenceRepository,
            ORG,
            'seq-1',
        );

        expect(repo.setActive).toHaveBeenCalledWith(ORG, 'seq-1', false);
        expect(result).toEqual(deactivated);
    });

    it('é idempotente: uma sequência já encerrada é devolvida inalterada, sem chamar setActive de novo', async () => {
        const alreadyInactive = buildSequence({ active: false });
        repo.findById.mockResolvedValue(alreadyInactive);

        const result = await deactivateCadenceSequence(
            repo as unknown as CadenceSequenceRepository,
            ORG,
            'seq-1',
        );

        expect(result).toEqual(alreadyInactive);
        expect(repo.setActive).not.toHaveBeenCalled();
    });

    it('busca sempre pela organização do ator, nunca globalmente por id', async () => {
        repo.findById.mockResolvedValue(null);

        await deactivateCadenceSequence(repo as unknown as CadenceSequenceRepository, 'org-2', 'seq-1');

        expect(repo.findById).toHaveBeenCalledWith('org-2', 'seq-1');
    });
});
