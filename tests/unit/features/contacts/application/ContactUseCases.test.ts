import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactUseCases } from '@/features/contacts/application/ContactUseCases';
import { AppError } from '@/shared/middlewares/errorHandler';
import type { ContactRepository } from '@/features/contacts/domain/Contact';

// PC-005: enrichContact lançava `Error` genérico para "não encontrado"/"sem empresa vinculada" —
// o errorHandler global tratava isso como 500 e mascarava a mensagem em produção. Este teste
// prova que a regressão (voltar a usar `throw new Error(...)`) seria pega automaticamente.
vi.mock('@/features/prospecting/services/enrichment.service', () => ({
    enrichCompany: vi.fn(),
}));

function makeRepository(overrides: Partial<ContactRepository> = {}): ContactRepository {
    return {
        findById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findAllWithFilters: vi.fn(),
        ...overrides,
    } as unknown as ContactRepository;
}

describe('ContactUseCases.enrichContact', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lança AppError 404 quando o contato não existe', async () => {
        const repository = makeRepository({ findById: vi.fn().mockResolvedValue(null) });
        const useCases = new ContactUseCases(repository);

        await expect(useCases.enrichContact('org-1', 'contato-inexistente')).rejects.toMatchObject({
            constructor: AppError,
            statusCode: 404,
            message: 'Contact not found',
        });
    });

    it('lança AppError 400 quando o contato não tem empresa vinculada', async () => {
        const repository = makeRepository({
            findById: vi.fn().mockResolvedValue({ id: 'contact-1', companyId: null }),
        });
        const useCases = new ContactUseCases(repository);

        await expect(useCases.enrichContact('org-1', 'contact-1')).rejects.toMatchObject({
            constructor: AppError,
            statusCode: 400,
            message: 'Contato sem empresa vinculada — não é possível enriquecer',
        });
    });
});
