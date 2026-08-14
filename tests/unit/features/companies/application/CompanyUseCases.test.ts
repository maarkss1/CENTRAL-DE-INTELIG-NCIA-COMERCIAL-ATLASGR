import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompanyUseCases } from '@/features/companies/application/CompanyUseCases';
import { AppError } from '@/shared/middlewares/errorHandler';
import type { CompanyRepository } from '@/features/companies/domain/Company';

// PC-005: enrichCompany lançava `Error` genérico para "não encontrada" — o errorHandler global
// tratava isso como 500 e mascarava a mensagem em produção. Este teste prova que a regressão
// (voltar a usar `throw new Error(...)`) seria pega automaticamente.
vi.mock('@/features/prospecting/services/enrichment.service', () => ({
    enrichCompany: vi.fn(),
}));

vi.mock('@/lib/queue/enrichment.queue', () => ({
    enrichmentQueue: { add: vi.fn() },
}));

function makeRepository(overrides: Partial<CompanyRepository> = {}): CompanyRepository {
    return {
        findById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findAllWithFilters: vi.fn(),
        ...overrides,
    } as unknown as CompanyRepository;
}

describe('CompanyUseCases.enrichCompany', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lança AppError 404 quando a empresa não existe', async () => {
        const repository = makeRepository({ findById: vi.fn().mockResolvedValue(null) });
        const useCases = new CompanyUseCases(repository);

        await expect(useCases.enrichCompany('org-1', 'empresa-inexistente')).rejects.toMatchObject({
            constructor: AppError,
            statusCode: 404,
            message: 'Company not found',
        });
    });
});
