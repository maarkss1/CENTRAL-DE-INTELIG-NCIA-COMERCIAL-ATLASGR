/**
 * Calibração do Fit Score contra outcomes reais (won/lost) — auditoria encontrou que
 * `computeFitScore` (fitScore.ts) nunca olhava para resultado comercial real para se calibrar.
 * Este módulo NÃO reescreve a fórmula (pesos hardcoded continuam existindo como estão) — só mede,
 * por faixa/tier de temperatura, a taxa de conversão real observada, seguindo o mesmo modelo de
 * honestidade amostral de `crmEconomicCalibration.ts` (market-intelligence): nunca inventa um
 * número de confiança quando a amostra é pequena, devolve um nível de qualidade explícito
 * (INSUFICIENTE/BAIXA/MEDIA/ALTA) por faixa.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClosedLeadFitOutcome } from '../../../../../../src/features/prospecting/services/enrichment/fitScoreCalibration.js';

const findMany = vi.fn();
vi.mock('../../../../../../src/lib/prisma.js', () => ({
    prisma: { lead: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

const {
    calibrateFitScoreFromClosedLeads,
    fetchClosedLeadFitOutcomes,
    calibrateFitScoreForOrganization,
    FIT_SCORE_TIER_RANGES,
} = await import('../../../../../../src/features/prospecting/services/enrichment/fitScoreCalibration.js');

afterEach(() => {
    vi.clearAllMocks();
});

/** Gera N outcomes na faixa pedida, espalhados por `months` meses civis distintos (a partir de
 * jan/2026), com a proporção de vitórias pedida — para controlar sampleSize/distinctMonths/
 * winRate de forma determinística nos testes. */
function buildOutcomes(count: number, options: { won: number; score: number; months?: number }): ClosedLeadFitOutcome[] {
    const months = options.months ?? Math.min(count, 4);
    return Array.from({ length: count }, (_, i) => ({
        leadId: `lead-${options.score}-${i}`,
        score: options.score,
        won: i < options.won,
        closedAt: new Date(Date.UTC(2026, i % months, 15)),
    }));
}

describe('calibrateFitScoreFromClosedLeads — bucketing por faixa de temperatura', () => {
    it('usa as mesmas faixas de computeFitScore (Frio 0-44, Morno 45-74, Quente 75-100)', () => {
        expect(FIT_SCORE_TIER_RANGES).toEqual({ Frio: [0, 44], Morno: [45, 74], Quente: [75, 100] });
    });

    it('roteia um score no limite exato de cada faixa para o tier correto', () => {
        const samples: ClosedLeadFitOutcome[] = [
            { leadId: '1', score: 44, won: true, closedAt: new Date('2026-01-01') },
            { leadId: '2', score: 45, won: true, closedAt: new Date('2026-01-01') },
            { leadId: '3', score: 74, won: true, closedAt: new Date('2026-01-01') },
            { leadId: '4', score: 75, won: true, closedAt: new Date('2026-01-01') },
        ];
        const result = calibrateFitScoreFromClosedLeads(samples);
        const byTier = Object.fromEntries(result.tiers.map((t) => [t.tier, t.sampleSize]));
        // score 44 -> Frio, 45 -> Morno, 74 -> Morno, 75 -> Quente
        expect(byTier.Frio).toBe(1);
        expect(byTier.Morno).toBe(2);
        expect(byTier.Quente).toBe(1);
    });
});

describe('calibrateFitScoreFromClosedLeads — amostra suficiente calcula win rate real', () => {
    it('calcula a taxa de conversão real observada quando a faixa tem >=10 fechamentos em >=2 meses (BAIXA)', () => {
        // 12 fechamentos na faixa Quente, 9 ganhos -> 75% de win rate real, espalhados em 4 meses.
        const outcomes = buildOutcomes(12, { won: 9, score: 90, months: 4 });
        const result = calibrateFitScoreFromClosedLeads(outcomes);
        const quente = result.tiers.find((t) => t.tier === 'Quente')!;

        expect(quente.sampleSize).toBe(12);
        expect(quente.wonCount).toBe(9);
        expect(quente.lostCount).toBe(3);
        expect(quente.observedWinRatePct).toBe(75);
        expect(quente.quality).not.toBe('INSUFICIENTE');
        expect(quente.blockers).toEqual([]);
    });

    it('sobe a qualidade para MEDIA com >=20 fechamentos em >=3 meses', () => {
        const outcomes = buildOutcomes(24, { won: 12, score: 60, months: 3 });
        const result = calibrateFitScoreFromClosedLeads(outcomes);
        const morno = result.tiers.find((t) => t.tier === 'Morno')!;

        expect(morno.quality).toBe('MEDIA');
        expect(morno.observedWinRatePct).toBe(50);
    });

    it('sobe a qualidade para ALTA com >=50 fechamentos em >=4 meses', () => {
        const outcomes = buildOutcomes(60, { won: 30, score: 10, months: 4 });
        const result = calibrateFitScoreFromClosedLeads(outcomes);
        const frio = result.tiers.find((t) => t.tier === 'Frio')!;

        expect(frio.quality).toBe('ALTA');
        expect(frio.observedWinRatePct).toBe(50);
    });

    it('nunca vira ALTA/MEDIA só por volume — volume alto concentrado em 1 mês continua INSUFICIENTE', () => {
        // 60 fechamentos, mas todos no mesmo mês -> nunca deveria virar ALTA/MEDIA (precisam de
        // cobertura temporal real, não só volume).
        const outcomes = buildOutcomes(60, { won: 30, score: 10, months: 1 });
        const result = calibrateFitScoreFromClosedLeads(outcomes);
        const frio = result.tiers.find((t) => t.tier === 'Frio')!;

        expect(frio.distinctMonthsWithClosedSample).toBe(1);
        expect(frio.quality).toBe('INSUFICIENTE');
        expect(frio.observedWinRatePct).toBeNull();
    });
});

describe('calibrateFitScoreFromClosedLeads — amostra insuficiente nunca fabrica um número', () => {
    it('devolve observedWinRatePct null e quality INSUFICIENTE com poucos fechamentos', () => {
        const outcomes = buildOutcomes(3, { won: 3, score: 90, months: 1 });
        const result = calibrateFitScoreFromClosedLeads(outcomes);
        const quente = result.tiers.find((t) => t.tier === 'Quente')!;

        expect(quente.sampleSize).toBe(3);
        expect(quente.observedWinRatePct).toBeNull();
        expect(quente.quality).toBe('INSUFICIENTE');
        expect(quente.blockers.length).toBeGreaterThan(0);
        expect(quente.blockers.some((b) => b.includes('Amostra insuficiente'))).toBe(true);
    });

    it('nunca reporta 100%/0% fabricado para uma faixa sem nenhum fechamento real', () => {
        const result = calibrateFitScoreFromClosedLeads([]);
        for (const tier of result.tiers) {
            expect(tier.sampleSize).toBe(0);
            expect(tier.observedWinRatePct).toBeNull();
            expect(tier.quality).toBe('INSUFICIENTE');
        }
        expect(result.totalClosedSample).toBe(0);
        expect(result.fromClosedAt).toBeNull();
        expect(result.toClosedAt).toBeNull();
    });

    it('sinaliza cobertura temporal insuficiente mesmo com volume alto concentrado em 1 mês', () => {
        const outcomes = buildOutcomes(15, { won: 10, score: 90, months: 1 });
        const result = calibrateFitScoreFromClosedLeads(outcomes);
        const quente = result.tiers.find((t) => t.tier === 'Quente')!;

        expect(quente.sampleSize).toBe(15);
        expect(quente.distinctMonthsWithClosedSample).toBe(1);
        expect(quente.quality).toBe('INSUFICIENTE');
        expect(quente.observedWinRatePct).toBeNull();
        expect(quente.blockers.some((b) => b.includes('Cobertura temporal insuficiente'))).toBe(true);
    });

    it('cada faixa é avaliada de forma independente (uma faixa robusta não empresta confiança para outra pequena)', () => {
        const robust = buildOutcomes(60, { won: 45, score: 90, months: 4 }); // Quente, ALTA
        const thin = buildOutcomes(2, { won: 1, score: 10, months: 1 }); // Frio, INSUFICIENTE
        const result = calibrateFitScoreFromClosedLeads([...robust, ...thin]);

        const quente = result.tiers.find((t) => t.tier === 'Quente')!;
        const frio = result.tiers.find((t) => t.tier === 'Frio')!;

        expect(quente.quality).toBe('ALTA');
        expect(quente.observedWinRatePct).toBe(75);
        expect(frio.quality).toBe('INSUFICIENTE');
        expect(frio.observedWinRatePct).toBeNull();
    });
});

describe('fetchClosedLeadFitOutcomes — associação real de outcome a fit score', () => {
    it('busca só leads fechados (won/lost) do tenant com companyId e closedAt reais', async () => {
        findMany.mockResolvedValueOnce([]);
        await fetchClosedLeadFitOutcomes('org-1');

        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                organizationId: 'org-1',
                deletedAt: null,
                companyId: { not: null },
                closedAt: { not: null },
                status: { in: ['Negocios_Ganhos', 'Negocios_Perdidos'] },
            }),
        }));
    });

    it('recalcula o fit score a partir da Company (nunca lê Lead.score, que pode ter sido sobrescrito pela qualificação do SDR)', async () => {
        findMany.mockResolvedValueOnce([
            {
                id: 'lead-1',
                status: 'Negocios_Ganhos',
                closedAt: new Date('2026-03-10'),
                company: {
                    situacaoCadastral: 'ATIVA',
                    capitalSocial: 500_000,
                    employeeCount: 80,
                    segment: null,
                    city: 'Rio de Janeiro',
                    state: 'RJ',
                    technologies: [],
                },
            },
            {
                id: 'lead-2',
                status: 'Negocios_Perdidos',
                closedAt: new Date('2026-03-20'),
                company: {
                    situacaoCadastral: 'BAIXADA',
                    capitalSocial: 1_000,
                    employeeCount: 2,
                    segment: null,
                    city: null,
                    state: null,
                    technologies: [],
                },
            },
        ]);

        const outcomes = await fetchClosedLeadFitOutcomes('org-1');

        expect(outcomes).toHaveLength(2);
        expect(outcomes[0]).toMatchObject({ leadId: 'lead-1', won: true });
        expect(outcomes[1]).toMatchObject({ leadId: 'lead-2', won: false });
        // CNPJ ativo + capital alto + porte grande + RJ (região de risco) deve pontuar bem mais
        // que CNPJ baixado + capital mínimo — sem fixar o número exato da fórmula aqui (isso já é
        // coberto por fitScore.test.ts), só a ordenação relativa esperada.
        expect(outcomes[0].score).toBeGreaterThan(outcomes[1].score);
    });

    it('ignora leads fechados sem Company associada (nunca inventa um score para dado que não existe)', async () => {
        findMany.mockResolvedValueOnce([
            { id: 'lead-orphan', status: 'Negocios_Ganhos', closedAt: new Date('2026-01-01'), company: null },
        ]);
        const outcomes = await fetchClosedLeadFitOutcomes('org-1');
        expect(outcomes).toEqual([]);
    });

    it('devolve vazio sem consultar o banco quando organizationId está ausente (nunca vaza dado cross-tenant)', async () => {
        const outcomes = await fetchClosedLeadFitOutcomes('');
        expect(outcomes).toEqual([]);
        expect(findMany).not.toHaveBeenCalled();
    });
});

describe('calibrateFitScoreForOrganization — orquestração busca + calibra', () => {
    it('encadeia fetchClosedLeadFitOutcomes com calibrateFitScoreFromClosedLeads', async () => {
        findMany.mockResolvedValueOnce([
            {
                id: 'lead-1',
                status: 'Negocios_Ganhos',
                closedAt: new Date('2026-05-01'),
                company: {
                    situacaoCadastral: 'ATIVA',
                    capitalSocial: 500_000,
                    employeeCount: 80,
                    segment: null,
                    city: null,
                    state: null,
                    technologies: [],
                },
            },
        ]);

        const result = await calibrateFitScoreForOrganization('org-1');
        expect(result.totalClosedSample).toBe(1);
        expect(result.tiers.reduce((sum, t) => sum + t.sampleSize, 0)).toBe(1);
    });
});
