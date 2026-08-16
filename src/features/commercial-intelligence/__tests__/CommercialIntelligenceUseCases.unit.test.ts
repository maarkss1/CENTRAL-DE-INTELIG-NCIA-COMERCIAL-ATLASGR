import { describe, it, expect } from 'vitest';
import { CommercialIntelligenceUseCases } from '../application/CommercialIntelligenceUseCases';
import type {
    CommercialIntelligenceRepository, DealRow, StageDefinition, CommercialGoalDTO, GoalMetric,
} from '../domain/CommercialIntelligence';

const NOW = new Date('2026-08-15T12:00:00Z');
const PERIOD = '2026-08';

const STAGES: StageDefinition[] = [
    { id: 'stage-nova', name: 'Nova Oportunidade', code: 'nova', sortOrder: 0, probability: 15, isWon: false, isLost: false },
    { id: 'stage-proposta', name: 'Proposta Enviada', code: 'proposta', sortOrder: 1, probability: 45, isWon: false, isLost: false },
    { id: 'stage-ganho', name: 'Negócios Ganhos', code: 'ganho', sortOrder: 2, probability: 100, isWon: true, isLost: false },
    { id: 'stage-perdido', name: 'Negócios Perdidos', code: 'perdido', sortOrder: 3, probability: 0, isWon: false, isLost: true },
];

function deal(overrides: Partial<DealRow> & { id: string }): DealRow {
    return {
        title: overrides.id,
        amount: 0,
        owner: 'ana@atlasgr.com.br',
        source: 'Indicação',
        companyId: 'company-1',
        companyName: 'Empresa Teste',
        companyCnpj: '00.000.000/0001-00',
        contactId: 'contact-1',
        createdAt: new Date('2026-08-01T00:00:00Z'),
        updatedAt: new Date('2026-08-05T00:00:00Z'),
        closedAt: null,
        expectedCloseAt: new Date('2026-08-20T00:00:00Z'), // dentro dos próximos 30 dias de NOW
        lastInteraction: new Date('2026-08-13T00:00:00Z'), // 2 dias atrás de NOW
        nextAction: new Date('2026-08-18T00:00:00Z'), // 3 dias à frente de NOW
        lossReason: null,
        lossObservation: null,
        status: 'Nova_Oportunidade',
        bitrixLeadId: null,
        bitrixDealId: null,
        bitrixSyncStatus: null,
        bitrixSyncError: null,
        bitrixSyncedAt: null,
        pipelineId: 'pipeline-1',
        pipelineStageId: 'stage-nova',
        stageName: 'Nova Oportunidade',
        stageSortOrder: 0,
        stageProbability: 15,
        stageIsWon: false,
        stageIsLost: false,
        productSkus: [],
        icp: null,
        ...overrides,
    };
}

class FakeRepository implements CommercialIntelligenceRepository {
    goals = new Map<string, CommercialGoalDTO>();
    constructor(
        public deals: DealRow[] = [],
        public stages: StageDefinition[] = STAGES,
        public history: Array<{ leadId: string; stageId: string | null; stageName: string; enteredAt: Date; exitedAt: Date | null }> = [],
        public meetingsCount = 0,
        public timelineEventCount = 0,
        public duplicateGroups = 0,
        public bitrixConnected = false
    ) {}

    async findDeals(): Promise<DealRow[]> { return this.deals; }
    async findDealPipelineStages(): Promise<StageDefinition[]> { return this.stages; }
    async countCompletedMeetings(): Promise<number> { return this.meetingsCount; }
    async countTimelineEventsByType(): Promise<number> { return this.timelineEventCount; }
    async findStageHistory() { return this.history; }
    async countDuplicateCompanyGroupsAmongOpenDeals(): Promise<number> { return this.duplicateGroups; }
    async hasBitrixConnection(): Promise<boolean> { return this.bitrixConnected; }

    async getGoal(organizationId: string, period: string, metric: GoalMetric): Promise<CommercialGoalDTO | null> {
        return this.goals.get(`${organizationId}:${period}:${metric}`) ?? null;
    }

    async upsertGoal(organizationId: string, period: string, metric: GoalMetric, amount: number, currency: string, createdBy: string): Promise<CommercialGoalDTO> {
        const goal: CommercialGoalDTO = { period, metric, amount, currency, updatedAt: new Date().toISOString(), createdBy };
        this.goals.set(`${organizationId}:${period}:${metric}`, goal);
        return goal;
    }
}

const ORG = 'org-1';

describe('CommercialIntelligenceUseCases', () => {
    it('sem negócios: isEmpty=true e metas ausentes retornam "Não disponível" (null), nunca 0 fabricado', async () => {
        const useCases = new CommercialIntelligenceUseCases(new FakeRepository([]));
        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        expect(overview.isEmpty).toBe(true);
        expect(overview.goal).toBeNull();
        expect(overview.pctOfGoal).toBeNull();
        expect(overview.gapForecast).toBeNull();
        expect(overview.gapCommit).toBeNull();
        expect(overview.closedAmount).toBe(0);
    });

    it('Meta, Fechado, % da Meta: só conta Negócios Ganhos com closedAt no período', async () => {
        const won = deal({ id: 'won-1', amount: 80_000, stageIsWon: true, pipelineStageId: 'stage-ganho', closedAt: new Date('2026-08-05T00:00:00Z') });
        const wonOutsidePeriod = deal({ id: 'won-2', amount: 999_000, stageIsWon: true, pipelineStageId: 'stage-ganho', closedAt: new Date('2026-07-01T00:00:00Z') });
        const repo = new FakeRepository([won, wonOutsidePeriod]);
        await repo.upsertGoal(ORG, PERIOD, 'NEW_MRR', 300_000, 'BRL', 'user-1');
        const useCases = new CommercialIntelligenceUseCases(repo);

        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        expect(overview.closedAmount).toBe(80_000);
        expect(overview.closedCount).toBe(1);
        expect(overview.goal?.amount).toBe(300_000);
        expect(overview.pctOfGoal).toBeCloseTo((80_000 / 300_000) * 100, 2);
    });

    it('Commit/Best Case/Forecast/Gap: classifica por probabilidade final e soma corretamente', async () => {
        // sinais "bons" completos (+10 próxima ação, +5 interação recente, +5 data prevista próxima) = +20
        const commitDeal = deal({ id: 'commit-1', amount: 100_000, stageProbability: 50, pipelineStageId: 'stage-proposta' }); // 50+20=70 -> Commit
        const bestCaseDeal = deal({ id: 'bestcase-1', amount: 50_000, stageProbability: 30, pipelineStageId: 'stage-proposta' }); // 30+20=50 -> BestCase
        const pipelineDeal = deal({ id: 'pipeline-1', amount: 30_000, stageProbability: 0, pipelineStageId: 'stage-nova' }); // 0+20=20 -> Pipeline
        const repo = new FakeRepository([commitDeal, bestCaseDeal, pipelineDeal]);
        await repo.upsertGoal(ORG, PERIOD, 'NEW_MRR', 300_000, 'BRL', 'user-1');
        const useCases = new CommercialIntelligenceUseCases(repo);

        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        expect(overview.commitAmount).toBe(100_000);
        expect(overview.commitCount).toBe(1);
        expect(overview.bestCaseAmount).toBe(50_000);
        expect(overview.bestCaseCount).toBe(1);
        // forecast = fechado(0) + commit(100000) + bestcase(50000) + pipeline ponderado(30000 * 20% = 6000)
        expect(overview.forecastAmount).toBe(0 + 100_000 + 50_000 + 6_000);
        expect(overview.gapForecast).toBe(300_000 - overview.forecastAmount);
        expect(overview.gapCommit).toBe(300_000 - (0 + 100_000));
    });

    it('Pipeline Total inclui todo negócio aberto; Pipeline Elegível só os que passam nos critérios da seção 9', async () => {
        const eligible = deal({ id: 'eligible-1', amount: 40_000 });
        const noOwner = deal({ id: 'sem-owner', amount: 10_000, owner: null });
        const noNextAction = deal({ id: 'sem-next-action', amount: 20_000, nextAction: null });
        const wonDeal = deal({ id: 'ganho-1', amount: 999_000, stageIsWon: true, closedAt: new Date('2026-08-01') });
        const repo = new FakeRepository([eligible, noOwner, noNextAction, wonDeal]);
        const useCases = new CommercialIntelligenceUseCases(repo);

        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        expect(overview.pipelineTotal).toBe(40_000 + 10_000 + 20_000); // todos abertos, ganho não entra
        expect(overview.pipelineTotalCount).toBe(3);
        expect(overview.pipelineEligible).toBe(40_000); // só o elegível
        expect(overview.pipelineEligibleCount).toBe(1);
    });

    it('Coverage: null quando não há meta cadastrada (nunca divide por zero silenciosamente)', async () => {
        const repo = new FakeRepository([deal({ id: 'd1', amount: 10_000 })]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        expect(overview.coverageMonth.coverage).toBeNull();
        expect(overview.coverage90.coverage).toBeNull();
    });

    it('Pipeline Criado: só conta negócios com createdAt dentro do período (não os apenas movimentados)', async () => {
        const createdThisMonth = deal({ id: 'novo-1', amount: 25_000, createdAt: new Date('2026-08-03T00:00:00Z') });
        const createdLastMonth = deal({ id: 'antigo-1', amount: 999_000, createdAt: new Date('2026-07-10T00:00:00Z'), updatedAt: new Date('2026-08-10T00:00:00Z') });
        const repo = new FakeRepository([createdThisMonth, createdLastMonth]);
        const useCases = new CommercialIntelligenceUseCases(repo);

        const result = await useCases.pipelineCreation(ORG, { month: PERIOD }, NOW);
        expect(result.count).toBe(1);
        expect(result.amount).toBe(25_000);
        expect(result.averageTicket).toBe(25_000);
    });

    it('Win Rate: Ganhos / (Ganhos + Perdidos) — negócios abertos nunca entram no denominador', async () => {
        const won = deal({ id: 'ganho-1', amount: 10_000, stageIsWon: true, closedAt: new Date('2026-08-05') });
        const lost = deal({ id: 'perdido-1', amount: 5_000, stageIsLost: true, closedAt: new Date('2026-08-06'), lossReason: 'Preço muito alto' });
        const open = deal({ id: 'aberto-1', amount: 15_000 });
        const repo = new FakeRepository([won, lost, open]);
        const useCases = new CommercialIntelligenceUseCases(repo);

        const performance = await useCases.performance(ORG, { month: PERIOD }, NOW);
        expect(performance.winRate).toBe(50);
        expect(performance.wonCount).toBe(1);
        expect(performance.lostCount).toBe(1);
    });

    it('Ticket Médio: por grupo (criado/aberto/ganho/perdido), "Não disponível" quando o grupo é vazio', async () => {
        const won = deal({ id: 'ganho-1', amount: 10_000, stageIsWon: true, closedAt: new Date('2026-08-05') });
        const repo = new FakeRepository([won]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const performance = await useCases.performance(ORG, { month: PERIOD }, NOW);
        expect(performance.averageTicket.won).toBe(10_000);
        expect(performance.averageTicket.lost).toBeNull();
    });

    it('Sales Cycle: média e mediana em dias sobre negócios fechados no período', async () => {
        const closed1 = deal({ id: 'c1', amount: 1, stageIsWon: true, createdAt: new Date('2026-07-01T00:00:00Z'), closedAt: new Date('2026-08-01T00:00:00Z') }); // 31 dias
        const closed2 = deal({ id: 'c2', amount: 1, stageIsLost: true, createdAt: new Date('2026-07-11T00:00:00Z'), closedAt: new Date('2026-08-01T00:00:00Z') }); // 21 dias
        const repo = new FakeRepository([closed1, closed2]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const performance = await useCases.performance(ORG, { month: PERIOD }, NOW);
        expect(performance.salesCycle.sampleSize).toBe(2);
        expect(performance.salesCycle.meanDays).toBeCloseTo((31 + 21) / 2, 1);
        expect(performance.salesCycle.medianDays).toBeCloseTo((31 + 21) / 2, 1);
    });

    it('Conversão por etapa: funil cumulativo ordenado por sortOrder, primeira etapa sem conversionFromPrevious', async () => {
        const inNova = deal({ id: 'd1', amount: 1000, pipelineStageId: 'stage-nova', stageName: 'Nova Oportunidade' });
        const inProposta = deal({ id: 'd2', amount: 2000, pipelineStageId: 'stage-proposta', stageName: 'Proposta Enviada' });
        const repo = new FakeRepository([inNova, inProposta]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const performance = await useCases.performance(ORG, { month: PERIOD }, NOW);
        expect(performance.funnel[0].conversionFromPrevious).toBeNull();
        expect(performance.funnel[0].count).toBe(2); // cumulativo: Nova + Proposta (mais abaixo no funil)
        expect(performance.funnel[1].count).toBe(1); // só Proposta
    });

    it('Aging: agrupa negócios abertos em faixas fixas por idade desde a criação', async () => {
        const fresh = deal({ id: 'novo', amount: 1000, createdAt: new Date('2026-08-10T00:00:00Z') }); // 5 dias
        const old = deal({ id: 'velho', amount: 2000, createdAt: new Date('2026-04-01T00:00:00Z') }); // >90 dias
        const repo = new FakeRepository([fresh, old]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const aging = await useCases.aging(ORG, { month: PERIOD }, NOW);
        const bucket0to15 = aging.buckets.find((b) => b.label === '0–15 dias');
        const bucket90plus = aging.buckets.find((b) => b.label === '90+ dias');
        expect(bucket0to15?.count).toBe(1);
        expect(bucket90plus?.count).toBe(1);
    });

    it('Aging: respeita o filtro de owner (não mistura negócios de outro vendedor)', async () => {
        const ana = deal({ id: 'ana-1', amount: 1000, owner: 'ana@atlasgr.com.br', createdAt: new Date('2026-04-01T00:00:00Z') }); // >90 dias
        const bruno = deal({ id: 'bruno-1', amount: 2000, owner: 'bruno@atlasgr.com.br', createdAt: new Date('2026-04-01T00:00:00Z') }); // >90 dias
        const repo = new FakeRepository([ana, bruno]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const aging = await useCases.aging(ORG, { month: PERIOD, owner: 'ana@atlasgr.com.br' }, NOW);
        const bucket90plus = aging.buckets.find((b) => b.label === '90+ dias');
        expect(bucket90plus?.count).toBe(1);
        expect(bucket90plus?.amount).toBe(1000);
    });

    it('Qualidade do CRM: respeita o filtro de owner (não mistura negócios de outro vendedor)', async () => {
        const ana = deal({ id: 'ana-1', amount: 1000, owner: 'ana@atlasgr.com.br' });
        const bruno = deal({ id: 'bruno-1', amount: 2000, owner: 'bruno@atlasgr.com.br' });
        const repo = new FakeRepository([ana, bruno]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const quality = await useCases.crmQuality(ORG, { month: PERIOD, owner: 'ana@atlasgr.com.br' }, NOW);
        expect(quality.evaluatedCount).toBe(1);
        expect(quality.bitrixSync.totalOpen).toBe(1);
    });

    it('Motivos de perda: classifica lossReason numa taxonomia fixa e preserva a observação original', async () => {
        const lost = deal({ id: 'perdido-1', amount: 5_000, stageIsLost: true, closedAt: new Date('2026-08-05'), lossReason: 'Preço muito alto para o orçamento deles' });
        const repo = new FakeRepository([lost]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const losses = await useCases.losses(ORG, { month: PERIOD });
        expect(losses.totalCount).toBe(1);
        expect(losses.byReason[0].reason).toBe('Preço');
        expect(losses.sampleObservations[0].observation).toContain('Preço muito alto');
    });

    it('Filtro por responsável: restringe o cockpit a um único owner', async () => {
        const dealsA = deal({ id: 'a', amount: 10_000, owner: 'ana@atlasgr.com.br', stageIsWon: true, closedAt: new Date('2026-08-05') });
        const dealsB = deal({ id: 'b', amount: 20_000, owner: 'bruno@atlasgr.com.br', stageIsWon: true, closedAt: new Date('2026-08-05') });
        const repo = new FakeRepository([dealsA, dealsB]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const overview = await useCases.executiveOverview(ORG, { month: PERIOD, owner: 'ana@atlasgr.com.br' }, NOW);
        expect(overview.closedAmount).toBe(10_000);
    });

    it('drill-down: filtra por tier e devolve fatores de risco explicáveis', async () => {
        const commitDeal = deal({ id: 'commit-1', amount: 100_000, stageProbability: 50 });
        const repo = new FakeRepository([commitDeal]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const result = await useCases.dealsDrillDown(ORG, { month: PERIOD, tier: 'Commit' }, NOW);
        expect(result.total).toBe(1);
        expect(result.rows[0].id).toBe('commit-1');
        expect(result.rows[0].tier).toBe('Commit');
    });

    it('Qualidade do CRM: sem conexão Bitrix24, bitrixSync.connected é false mas os contadores continuam corretos', async () => {
        const notLinked = deal({ id: 'nl-1', amount: 1_000 });
        const linked = deal({ id: 'l-1', amount: 2_000, bitrixDealId: 'bx-deal-1', bitrixSyncStatus: 'synced' });
        const repo = new FakeRepository([notLinked, linked], STAGES, [], 0, 0, 0, false);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const quality = await useCases.crmQuality(ORG, { month: PERIOD }, NOW);
        expect(quality.bitrixSync.connected).toBe(false);
        expect(quality.bitrixSync.totalOpen).toBe(2);
        expect(quality.bitrixSync.linked).toBe(1);
        expect(quality.bitrixSync.notLinked).toBe(1);
    });

    it('Qualidade do CRM: com conexão Bitrix24, contabiliza vínculo, falhas e lista as falhas com o motivo', async () => {
        const linked = deal({ id: 'l-1', amount: 2_000, bitrixLeadId: 'bx-lead-1', bitrixSyncStatus: 'synced' });
        const notLinked = deal({ id: 'nl-1', amount: 1_000 });
        const failed = deal({ id: 'f-1', amount: 3_000, bitrixLeadId: 'bx-lead-2', bitrixSyncStatus: 'failed', bitrixSyncError: 'Token expirado' });
        const repo = new FakeRepository([linked, notLinked, failed], STAGES, [], 0, 0, 0, true);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const quality = await useCases.crmQuality(ORG, { month: PERIOD }, NOW);
        expect(quality.bitrixSync.connected).toBe(true);
        expect(quality.bitrixSync.totalOpen).toBe(3);
        expect(quality.bitrixSync.linked).toBe(2);
        expect(quality.bitrixSync.notLinked).toBe(1);
        expect(quality.bitrixSync.failed).toBe(1);
        expect(quality.bitrixSync.linkedRate).toBeCloseTo((2 / 3) * 100, 1);
        expect(quality.bitrixSync.failures).toHaveLength(1);
        expect(quality.bitrixSync.failures[0]).toMatchObject({ leadId: 'f-1', error: 'Token expirado' });
    });

    it('Leading Indicators: weeklySeries expõe as 4 semanas usadas no cálculo de movingAverage4w, mais antiga → mais recente', async () => {
        const repo = new FakeRepository([], STAGES, [], 0, 0, 0, false);
        // countCreated é o único indicador que não depende de countCompletedMeetings/countTimelineEventsByType
        // (fixos em 0 no FakeRepository) — usa `deals` diretamente, então dá pra construir uma série não-trivial.
        const oldDeal = deal({ id: 'w1', createdAt: new Date('2026-07-20T00:00:00Z') }); // semana mais antiga da janela de 4
        const recentDeal = deal({ id: 'w2', createdAt: new Date('2026-08-14T00:00:00Z') }); // semana mais recente
        repo.deals = [oldDeal, recentDeal];
        const useCases = new CommercialIntelligenceUseCases(repo);
        const report = await useCases.leadingIndicators(ORG, NOW);
        const pipelineCriado = report.indicators.find((i) => i.label === 'Pipeline criado');
        expect(pipelineCriado?.weeklySeries).toHaveLength(4);
        expect(pipelineCriado?.weeklySeries.reduce((s, v) => s + v, 0)).toBe(2);
        expect(pipelineCriado?.movingAverage4w).toBeCloseTo((pipelineCriado?.weeklySeries.reduce((s, v) => s + v, 0) ?? 0) / 4, 2);
    });

    it('Pipeline Creation Pace: dias úteis decorridos/total do mês e ritmo (%) batem com o esperado proporcional', async () => {
        // Agosto/2026 tem 21 dias úteis; até 2026-08-15 (sábado) já decorreram 10 (ver
        // businessDays.unit.test.ts para a conta detalhada dia a dia).
        const created = deal({ id: 'novo-1', amount: 50_000, createdAt: new Date('2026-08-03T00:00:00Z') });
        const won = deal({ id: 'ganho-1', amount: 10_000, stageIsWon: true, pipelineStageId: 'stage-ganho', closedAt: new Date('2026-08-05T00:00:00Z') });
        const lost = deal({ id: 'perdido-1', amount: 5_000, stageIsLost: true, pipelineStageId: 'stage-perdido', closedAt: new Date('2026-08-06T00:00:00Z'), lossReason: 'Preço' });
        const repo = new FakeRepository([created, won, lost]);
        await repo.upsertGoal(ORG, PERIOD, 'NEW_MRR', 300_000, 'BRL', 'user-1');
        const useCases = new CommercialIntelligenceUseCases(repo);

        const result = await useCases.pipelineCreation(ORG, { month: PERIOD }, NOW);
        expect(result.businessDaysTotal).toBe(21);
        expect(result.businessDaysElapsed).toBe(10);
        // winRate = 1/(1+1) = 50% -> pipelineNeeded = 300_000 / 0.5 = 600_000
        expect(result.pipelineNeeded).toBe(600_000);
        const expectedByNow = 600_000 * (10 / 21);
        expect(result.expectedByNow).toBeCloseTo(Math.round((expectedByNow + Number.EPSILON) * 100) / 100, 2);
        expect(result.pacePercent).toBeCloseTo((result.amount / (result.expectedByNow as number)) * 100, 1);
    });

    it('Pipeline Creation Pace: sem Pipeline Necessário calculável (sem meta), expectedByNow e pacePercent ficam "Não disponível" (null)', async () => {
        const created = deal({ id: 'novo-1', amount: 50_000, createdAt: new Date('2026-08-03T00:00:00Z') });
        const repo = new FakeRepository([created]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const result = await useCases.pipelineCreation(ORG, { month: PERIOD }, NOW);
        expect(result.pipelineNeeded).toBeNull();
        expect(result.expectedByNow).toBeNull();
        expect(result.pacePercent).toBeNull();
        // dias úteis continuam calculáveis independente da meta
        expect(result.businessDaysTotal).toBe(21);
        expect(result.businessDaysElapsed).toBe(10);
    });

    it('Proteção de Receita: monta 4 meses-calendário (M/M+1/M+2/M+3), cada um com a meta e o pipeline elegível do próprio mês', async () => {
        const eligibleAug = deal({ id: 'elig-aug', amount: 40_000, expectedCloseAt: new Date('2026-08-20T00:00:00Z') });
        const eligibleSep = deal({ id: 'elig-sep', amount: 60_000, expectedCloseAt: new Date('2026-09-15T00:00:00Z') });
        const eligibleOct = deal({ id: 'elig-oct', amount: 20_000, expectedCloseAt: new Date('2026-10-10T00:00:00Z') });
        // Sem negócio elegível em novembro (M+3) de propósito — cobertura daquele mês deve refletir pipeline 0.
        const repo = new FakeRepository([eligibleAug, eligibleSep, eligibleOct]);
        await repo.upsertGoal(ORG, '2026-08', 'NEW_MRR', 100_000, 'BRL', 'user-1');
        await repo.upsertGoal(ORG, '2026-09', 'NEW_MRR', 80_000, 'BRL', 'user-1');
        // 2026-10 e 2026-11 ficam sem meta cadastrada de propósito.
        const useCases = new CommercialIntelligenceUseCases(repo);

        const snapshots = await useCases.revenueProtection(ORG, { month: PERIOD }, NOW);
        expect(snapshots.map((s) => s.period)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
        expect(snapshots.map((s) => s.label)).toEqual(['M', 'M+1', 'M+2', 'M+3']);

        const [m, m1, m2, m3] = snapshots;
        expect(m.pipelineEligible).toBe(40_000);
        expect(m.remainingGoal).toBe(100_000);
        expect(m1.pipelineEligible).toBe(60_000);
        expect(m1.remainingGoal).toBe(80_000);
        expect(m2.pipelineEligible).toBe(20_000);
        expect(m2.goal).toBeNull();
        expect(m2.remainingGoal).toBe(0); // sem meta cadastrada
        expect(m2.coverage).toBeNull(); // sem meta -> nunca divide por zero
        expect(m3.pipelineEligible).toBe(0);
        expect(m3.goal).toBeNull();
    });

    it('Proteção de Receita: negócio fechado (ganho) dentro do mês M desconta da meta restante daquele mês', async () => {
        const wonInAugust = deal({ id: 'ganho-ago', amount: 30_000, stageIsWon: true, pipelineStageId: 'stage-ganho', closedAt: new Date('2026-08-05T00:00:00Z') });
        const eligibleAug = deal({ id: 'elig-aug', amount: 40_000, expectedCloseAt: new Date('2026-08-20T00:00:00Z') });
        const repo = new FakeRepository([wonInAugust, eligibleAug]);
        await repo.upsertGoal(ORG, '2026-08', 'NEW_MRR', 100_000, 'BRL', 'user-1');
        const useCases = new CommercialIntelligenceUseCases(repo);

        const [m] = await useCases.revenueProtection(ORG, { month: PERIOD }, NOW);
        expect(m.remainingGoal).toBe(70_000); // 100_000 - 30_000 já fechado
        expect(m.pipelineEligible).toBe(40_000);
        expect(m.coverage).toBeCloseTo(40_000 / 70_000, 2); // arredondado em centésimo por `roundMoney`
    });

    it('Exportação: CSV/JSON/HTML reaproveitam os mesmos use cases (overview/performance/pipelineCreation/alerts), nenhum cálculo novo', async () => {
        const won = deal({ id: 'ganho-1', amount: 80_000, stageIsWon: true, pipelineStageId: 'stage-ganho', closedAt: new Date('2026-08-05T00:00:00Z') });
        const repo = new FakeRepository([won]);
        await repo.upsertGoal(ORG, PERIOD, 'NEW_MRR', 300_000, 'BRL', 'user-1');
        const useCases = new CommercialIntelligenceUseCases(repo);

        const csv = await useCases.executiveExport(ORG, { month: PERIOD }, 'csv', NOW);
        expect(csv.mimeType).toContain('text/csv');
        expect(csv.content.charCodeAt(0)).toBe(0xfeff);
        expect(csv.content).toContain('80000'); // mesmo Fechado calculado por executiveOverview

        const json = await useCases.executiveExport(ORG, { month: PERIOD }, 'json', NOW);
        const parsed = JSON.parse(json.content) as { overview: { closedAmount: number } };
        expect(parsed.overview.closedAmount).toBe(80_000);

        const html = await useCases.executiveExport(ORG, { month: PERIOD }, 'html', NOW);
        expect(html.content).toContain('<!doctype html>');
        expect(html.content).toContain(PERIOD);
    });

    it('Drill-down: bitrixLinked reflete se o negócio tem bitrixLeadId ou bitrixDealId', async () => {
        const linked = deal({ id: 'l-1', amount: 10_000, bitrixDealId: 'bx-deal-1' });
        const notLinked = deal({ id: 'nl-1', amount: 10_000 });
        const repo = new FakeRepository([linked, notLinked]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const result = await useCases.dealsDrillDown(ORG, { month: PERIOD }, NOW);
        const byId = Object.fromEntries(result.rows.map((r) => [r.id, r]));
        expect(byId['l-1'].bitrixLinked).toBe(true);
        expect(byId['nl-1'].bitrixLinked).toBe(false);
    });
});
