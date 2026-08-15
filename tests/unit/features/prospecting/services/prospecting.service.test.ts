import { describe, it, expect, vi, beforeEach } from 'vitest';

// findExistingCompany (dedupe por CNPJ) roda via withRlsContext, não prisma.$queryRaw direto —
// ver tests/unit/features/prospecting/services/prospecting.service.dedupe.test.ts para a
// cobertura desse caminho. Nenhum input deste arquivo passa `cnpj`, então esse branch nunca é
// exercitado aqui; o mock existe só para o import de withRlsContext resolver.
const txQueryRaw = vi.fn();
vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        company: { findFirst: vi.fn(), create: vi.fn() },
        contact: { create: vi.fn() },
        lead: { findFirst: vi.fn(), create: vi.fn() },
    },
    withRlsContext: (fn: (tx: { $queryRaw: typeof txQueryRaw }) => unknown) => fn({ $queryRaw: txQueryRaw }),
}));

vi.mock('../../../../../src/features/prospecting/services/enrichment.service', () => ({
    enrichCompany: vi.fn(),
}));

vi.mock('../../../../../src/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from '../../../../../src/lib/prisma.js';
import { enrichCompany } from '../../../../../src/features/prospecting/services/enrichment.service';
import { promoteToCrm, type PromoteInput } from '../../../../../src/features/prospecting/services/prospecting.service';

const companyMock = prisma.company as unknown as { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
const leadMock = prisma.lead as unknown as { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
const mockEnrichCompany = vi.mocked(enrichCompany);

const baseInput: PromoteInput = {
    tradeName: 'Transportadora Exemplo',
    source: 'Descoberta',
    organizationId: 'org-1',
};

beforeEach(() => {
    vi.clearAllMocks();
    companyMock.findFirst.mockResolvedValue(null);
    leadMock.findFirst.mockResolvedValue(null);
});

describe('promoteToCrm', () => {
    it('cria Company + Lead de verdade quando tudo dá certo', async () => {
        companyMock.create.mockResolvedValue({ id: 'comp-1', cnpj: null });
        mockEnrichCompany.mockResolvedValue(undefined as never);
        leadMock.create.mockResolvedValue({
            id: 'lead-1',
            status: 'Novo_Lead',
            company: { id: 'comp-1', status: 'Ativo' },
            contact: null,
        });

        const result = await promoteToCrm(baseInput);

        expect(companyMock.create).toHaveBeenCalledTimes(1);
        expect(leadMock.create).toHaveBeenCalledTimes(1);
        expect(result.lead.id).toBe('lead-1');
    });

    // Regressão: promoteToCrm já teve um catch geral que, em qualquer falha (banco fora do ar,
    // erro de validação, enriquecimento quebrando), devolvia uma Company/Lead inteiramente
    // fabricados com HTTP 201 de sucesso — o usuário achava que tinha criado um lead real que
    // nunca foi persistido. Uma falha real de escrita tem que subir como erro, não virar sucesso
    // fake.
    it('propaga o erro real em vez de devolver um lead fabricado quando a escrita falha', async () => {
        companyMock.create.mockRejectedValue(new Error('conexão com o banco perdida'));

        await expect(promoteToCrm(baseInput)).rejects.toThrow('conexão com o banco perdida');
        expect(leadMock.create).not.toHaveBeenCalled();
    });

    it('não deixa uma falha no enriquecimento derrubar a criação do lead', async () => {
        companyMock.create.mockResolvedValue({ id: 'comp-1', cnpj: null });
        mockEnrichCompany.mockRejectedValue(new Error('Apollo indisponível'));
        leadMock.create.mockResolvedValue({
            id: 'lead-1',
            status: 'Novo_Lead',
            company: { id: 'comp-1', status: 'Ativo' },
            contact: null,
        });

        const result = await promoteToCrm(baseInput);

        expect(result.lead.id).toBe('lead-1');
        expect(result.enrichment).toBeNull();
    });
});
