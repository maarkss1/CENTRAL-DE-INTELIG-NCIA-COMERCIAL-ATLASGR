import { describe, it, expect } from 'vitest';
import { checkEligibility, isDealOpen, agingInStageDays, STAGE_AGING_CRITICAL_DAYS } from '../application/pipelineEligibility';
import type { DealRow } from '../domain/CommercialIntelligence';

const NOW = new Date('2026-08-10T00:00:00Z');

function baseDeal(overrides: Partial<DealRow> = {}): DealRow {
    return {
        id: 'deal-1',
        title: 'Negócio teste',
        amount: 10_000,
        owner: 'vendedor@atlasgr.com.br',
        source: 'Indicação',
        companyId: 'company-1',
        companyName: 'Empresa Teste',
        companyCnpj: '00.000.000/0001-00',
        contactId: 'contact-1',
        createdAt: new Date('2026-07-01T00:00:00Z'),
        updatedAt: new Date('2026-08-01T00:00:00Z'),
        closedAt: null,
        expectedCloseAt: new Date('2026-08-20T00:00:00Z'),
        lastInteraction: new Date('2026-08-05T00:00:00Z'),
        nextAction: new Date('2026-08-12T00:00:00Z'),
        lossReason: null,
        lossObservation: null,
        status: 'Nova_Oportunidade',
        bitrixLeadId: null,
        bitrixDealId: null,
        bitrixSyncStatus: null,
        bitrixSyncError: null,
        bitrixSyncedAt: null,
        pipelineId: 'pipeline-1',
        pipelineStageId: 'stage-1',
        stageName: 'Nova Oportunidade',
        stageSortOrder: 0,
        stageProbability: 15,
        stageIsWon: false,
        stageIsLost: false,
        productSkus: [],
        icp: null,
        ...overrides,
    } as DealRow;
}

describe('pipelineEligibility', () => {
    it('isDealOpen: false quando a etapa marca ganho ou perda', () => {
        expect(isDealOpen(baseDeal())).toBe(true);
        expect(isDealOpen(baseDeal({ stageIsWon: true }))).toBe(false);
        expect(isDealOpen(baseDeal({ stageIsLost: true }))).toBe(false);
        expect(isDealOpen(baseDeal({ closedAt: NOW }))).toBe(false);
    });

    it('checkEligibility: aprova um negócio com todos os critérios preenchidos e sem aging crítico', () => {
        const result = checkEligibility(baseDeal(), NOW, 5);
        expect(result.eligible).toBe(true);
        expect(result.reasons).toEqual([]);
    });

    it('checkEligibility: reprova negócio fechado', () => {
        const result = checkEligibility(baseDeal({ stageIsWon: true }), NOW, 5);
        expect(result.eligible).toBe(false);
        expect(result.reasons).toContain('Negócio já fechado');
    });

    it('checkEligibility: reprova valor inválido (<=0)', () => {
        const result = checkEligibility(baseDeal({ amount: 0 }), NOW, 5);
        expect(result.eligible).toBe(false);
        expect(result.reasons).toContain('Sem valor válido');
    });

    it('checkEligibility: reprova sem data prevista, sem responsável e sem próxima ação', () => {
        const result = checkEligibility(baseDeal({ expectedCloseAt: null, owner: null, nextAction: null }), NOW, 5);
        expect(result.eligible).toBe(false);
        expect(result.reasons).toEqual(
            expect.arrayContaining(['Sem data prevista de fechamento', 'Sem responsável', 'Sem próxima ação registrada'])
        );
    });

    it('checkEligibility: reprova quando o aging medido excede o limiar crítico', () => {
        const result = checkEligibility(baseDeal(), NOW, STAGE_AGING_CRITICAL_DAYS + 1);
        expect(result.eligible).toBe(false);
        expect(result.reasons.some((r) => r.includes('aging crítico'))).toBe(true);
    });

    it('agingInStageDays: usa a medição real quando disponível', () => {
        expect(agingInStageDays(baseDeal(), NOW, 12)).toBe(12);
    });

    it('agingInStageDays: cai para updatedAt como aproximação quando não há histórico medido', () => {
        const deal = baseDeal({ updatedAt: new Date('2026-08-05T00:00:00Z') });
        expect(agingInStageDays(deal, NOW, null)).toBe(5);
    });
});
