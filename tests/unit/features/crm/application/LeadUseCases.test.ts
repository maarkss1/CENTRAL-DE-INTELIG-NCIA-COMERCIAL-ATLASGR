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

// Achado da auditoria (PR #328): mudar a etapa de um lead no Kanban não propagava nada para o
// Bitrix24 até a próxima exportação manual. `pushLeadToBitrix` é mockado aqui — os testes provam
// só QUANDO `LeadUseCases` decide disparar a re-sincronização (via `syncStatusChangeToBitrix`),
// não o comportamento de `pushLeadToBitrix` em si (já coberto em outro lugar).
const pushLeadToBitrixMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/features/integrations/bitrix/bitrix.service.js', () => ({
    pushLeadToBitrix: (...args: unknown[]) => pushLeadToBitrixMock(...args),
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

describe('LeadUseCases — sync automático com Bitrix na mudança de etapa', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('updateLead dispara pushLeadToBitrix quando status muda e o lead já tem bitrixLeadId', async () => {
        const repository = makeRepository({
            update: vi.fn().mockResolvedValue({ id: 'lead-1', status: 'Reunião Agendada', bitrixLeadId: 'bx-1' }),
        });
        const useCases = new LeadUseCases(repository);

        await useCases.updateLead('org-1', 'lead-1', { status: 'Reunião Agendada' });
        // Fire-and-forget: dá um tick pro `.then()` da promise interna rodar antes de checar.
        await new Promise((r) => setTimeout(r, 0));

        expect(pushLeadToBitrixMock).toHaveBeenCalledWith('org-1', 'lead-1');
    });

    it('updateLead NÃO dispara pushLeadToBitrix quando o lead nunca foi exportado (bitrixLeadId nulo)', async () => {
        const repository = makeRepository({
            update: vi.fn().mockResolvedValue({ id: 'lead-1', status: 'Reunião Agendada', bitrixLeadId: null }),
        });
        const useCases = new LeadUseCases(repository);

        await useCases.updateLead('org-1', 'lead-1', { status: 'Reunião Agendada' });
        await new Promise((r) => setTimeout(r, 0));

        expect(pushLeadToBitrixMock).not.toHaveBeenCalled();
    });

    it('updateLead NÃO dispara pushLeadToBitrix quando a atualização não muda o status', async () => {
        const repository = makeRepository({
            update: vi.fn().mockResolvedValue({ id: 'lead-1', bitrixLeadId: 'bx-1' }),
        });
        const useCases = new LeadUseCases(repository);

        await useCases.updateLead('org-1', 'lead-1', { owner: 'user-2' });
        await new Promise((r) => setTimeout(r, 0));

        expect(pushLeadToBitrixMock).not.toHaveBeenCalled();
    });

    it('updateLeadStatus (drag do Kanban) dispara pushLeadToBitrix quando o lead já tem bitrixLeadId', async () => {
        const repository = makeRepository({
            updateStatus: vi.fn().mockResolvedValue({ id: 'lead-1', status: 'Qualificação (SDR)', bitrixLeadId: 'bx-2' }),
        });
        const useCases = new LeadUseCases(repository);

        await useCases.updateLeadStatus('org-1', 'lead-1', 'Qualificação (SDR)');
        await new Promise((r) => setTimeout(r, 0));

        expect(pushLeadToBitrixMock).toHaveBeenCalledWith('org-1', 'lead-1');
    });
});
