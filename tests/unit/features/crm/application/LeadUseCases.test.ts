import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeadUseCases } from '@/features/crm/application/LeadUseCases';
import { AppError } from '@/shared/middlewares/errorHandler';
import type { LeadRepository } from '@/features/crm/domain/Lead';

// PC-005: enrichLead lançava `Error` genérico para "não encontrado"/"sem empresa vinculada" —
// o errorHandler global tratava isso como 500 e mascarava a mensagem em produção. Este teste
// prova que a regressão (voltar a usar `throw new Error(...)`) seria pega automaticamente.
vi.mock('@/features/prospecting/services/enrichment.service', () => ({
    enrichCompany: vi.fn(),
}));

function makeRepository(overrides: Partial<LeadRepository> = {}): LeadRepository {
    return {
        findById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findAllWithFilters: vi.fn(),
        updateStatus: vi.fn(),
        findAllForExport: vi.fn(),
        ...overrides,
    } as unknown as LeadRepository;
}

describe('LeadUseCases.enrichLead', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lança AppError 404 quando o lead não existe', async () => {
        const repository = makeRepository({ findById: vi.fn().mockResolvedValue(null) });
        const useCases = new LeadUseCases(repository);

        await expect(useCases.enrichLead('org-1', 'lead-inexistente')).rejects.toMatchObject({
            constructor: AppError,
            statusCode: 404,
            message: 'Lead not found',
        });
    });

    it('lança AppError 400 quando o lead não tem empresa vinculada', async () => {
        const repository = makeRepository({
            findById: vi.fn().mockResolvedValue({ id: 'lead-1', companyId: null }),
        });
        const useCases = new LeadUseCases(repository);

        await expect(useCases.enrichLead('org-1', 'lead-1')).rejects.toMatchObject({
            constructor: AppError,
            statusCode: 400,
            message: 'Lead sem empresa vinculada — não é possível enriquecer',
        });
    });
});
