import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        cadenceSequence: {
            findFirst: vi.fn(),
            update: vi.fn(),
        },
    },
}));

import { prisma } from '@/lib/prisma';
import { PrismaCadenceSequenceRepository } from '@/features/cadence/infra/PrismaCadenceSequenceRepository';

type Mocked<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };
const mockedPrisma = prisma as unknown as {
    cadenceSequence: Mocked<{ findFirst: unknown; update: unknown }>;
};

const repo = new PrismaCadenceSequenceRepository();
const ORG = 'org-1';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('PrismaCadenceSequenceRepository.findById', () => {
    it('busca por id + organizationId, excluindo sequências já excluídas (deletedAt)', async () => {
        const row = { id: 'seq-1', organizationId: ORG, active: true };
        mockedPrisma.cadenceSequence.findFirst.mockResolvedValue(row);

        const result = await repo.findById(ORG, 'seq-1');

        expect(result).toEqual(row);
        expect(mockedPrisma.cadenceSequence.findFirst).toHaveBeenCalledWith({
            where: { id: 'seq-1', organizationId: ORG, deletedAt: null },
        });
    });

    it('devolve null quando a sequência não existe (ou é de outra organização, ou já foi excluída)', async () => {
        mockedPrisma.cadenceSequence.findFirst.mockResolvedValue(null);

        const result = await repo.findById(ORG, 'seq-inexistente');

        expect(result).toBeNull();
    });
});

describe('PrismaCadenceSequenceRepository.setActive', () => {
    it('atualiza o campo active por id (a posse pela organização já foi verificada por findById antes)', async () => {
        const updated = { id: 'seq-1', organizationId: ORG, active: false };
        mockedPrisma.cadenceSequence.update.mockResolvedValue(updated);

        const result = await repo.setActive(ORG, 'seq-1', false);

        expect(result).toEqual(updated);
        expect(mockedPrisma.cadenceSequence.update).toHaveBeenCalledWith({
            where: { id: 'seq-1' },
            data: { active: false },
        });
    });
});
