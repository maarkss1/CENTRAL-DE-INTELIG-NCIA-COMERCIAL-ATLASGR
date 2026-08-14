import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichCompany } from '@/features/prospecting/services/enrichment.service';
import { AppError } from '@/shared/middlewares/errorHandler';
import { prisma } from '@/lib/prisma';

// PC-010: mesma classe de bug do PC-005, numa camada mais funda — enrichCompany lançava `Error`
// genérico para "empresa não encontrada", o que o errorHandler global tratava como 500 e mascarava
// a mensagem em produção.
vi.mock('@/lib/prisma', () => ({
    prisma: {
        company: {
            findFirst: vi.fn(),
            update: vi.fn(),
        },
    },
}));

describe('enrichCompany', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lança AppError 404 quando a empresa não existe', async () => {
        vi.mocked(prisma.company.findFirst).mockResolvedValue(null as never);

        await expect(enrichCompany('org-1', 'empresa-inexistente')).rejects.toMatchObject({
            constructor: AppError,
            statusCode: 404,
            message: 'Company not found',
        });
    });
});
