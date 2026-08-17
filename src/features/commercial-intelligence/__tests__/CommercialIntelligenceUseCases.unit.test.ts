import { describe, it, expect } from 'vitest';
import { CommercialIntelligenceUseCases, classifyCoverageProtection } from '../application/CommercialIntelligenceUseCases';
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

    syncActivity: { lastSyncAt: Date | null; syncedCount: number; failedCount: number } = { lastSyncAt: null, syncedCount: 0, failedCount: 0 };
    async getBitrixSyncActivity(): Promise<{ lastSyncAt: Date | null; syncedCount: number; failedCount: number }> {
        return this.syncActivity;
    }

    filterOptionsResult: { owners: string[]; products: string[]; sources: string[]; icps: string[] } = { owners: [], products: [], sources: [], icps: [] };
    async getFilterOptions(): Promise<{ owners: string[]; products: string[]; sources: string[]; icps: string[] }> {
        return this.filterOptionsResult;
    }

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

    it('drill-down: sort riskImpact ordena por valor em risco (amount × probabilidade de não fechar), não por valor bruto', async () => {
        // "seguro" tem valor bruto maior, mas alta probabilidade (baixo risco); "arriscado" tem
        // valor menor, mas próxima ação vencida + sem interação + sem data prevista → probabilidade
        // baixa e portanto MAIS valor em risco apesar do amount menor.
        const seguro = deal({ id: 'seguro', amount: 200_000, stageProbability: 90, nextAction: new Date('2026-08-16T00:00:00Z'), lastInteraction: new Date('2026-08-14T00:00:00Z'), expectedCloseAt: new Date('2026-08-20T00:00:00Z') });
        const arriscado = deal({ id: 'arriscado', amount: 50_000, stageProbability: 20, nextAction: null, lastInteraction: null, expectedCloseAt: null });
        const repo = new FakeRepository([seguro, arriscado]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const result = await useCases.dealsDrillDown(ORG, { month: PERIOD, sort: 'riskImpact' }, NOW);
        expect(result.rows.map((r) => r.id)).toEqual(['arriscado', 'seguro']);
    });

    it('drill-down: sem sort, a ordem não muda (comportamento padrão preservado)', async () => {
        const a = deal({ id: 'a', amount: 10_000 });
        const b = deal({ id: 'b', amount: 20_000 });
        const repo = new FakeRepository([a, b]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const result = await useCases.dealsDrillDown(ORG, { month: PERIOD }, NOW);
        expect(result.rows.map((r) => r.id)).toEqual(['a', 'b']);
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
        expect(result.totalBusinessDays).toBe(21);
        expect(result.elapsedBusinessDays).toBe(10);
        // winRate = 1/(1+1) = 50% -> pipelineNeeded = 300_000 / 0.5 = 600_000
        expect(result.pipelineNeeded).toBe(600_000);
        const paceExpectedAmount = 600_000 * (10 / 21);
        expect(result.paceExpectedAmount).toBeCloseTo(Math.round((paceExpectedAmount + Number.EPSILON) * 100) / 100, 2);
        expect(result.pacePercent).toBeCloseTo((result.amount / (result.paceExpectedAmount as number)) * 100, 1);
    });

    it('Pipeline Creation Pace: sem Pipeline Necessário calculável (sem meta), paceExpectedAmount e pacePercent ficam "Não disponível" (null)', async () => {
        const created = deal({ id: 'novo-1', amount: 50_000, createdAt: new Date('2026-08-03T00:00:00Z') });
        const repo = new FakeRepository([created]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const result = await useCases.pipelineCreation(ORG, { month: PERIOD }, NOW);
        expect(result.pipelineNeeded).toBeNull();
        expect(result.paceExpectedAmount).toBeNull();
        expect(result.pacePercent).toBeNull();
        // dias úteis continuam calculáveis independente da meta
        expect(result.totalBusinessDays).toBe(21);
        expect(result.elapsedBusinessDays).toBe(10);
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

    // ─── Proteção 90 dias (seção 11) ───────────────────────────────────────────

    it('classifyCoverageProtection: sem_dados sem meta cadastrada, mesmo com coverage calculável', () => {
        expect(classifyCoverageProtection(false, 5, 2)).toBe('sem_dados');
    });

    it('classifyCoverageProtection: usa o coverage recomendado (Win Rate) quando disponível', () => {
        expect(classifyCoverageProtection(true, 2, 2)).toBe('saudavel');
        expect(classifyCoverageProtection(true, 1.3, 2)).toBe('atencao'); // >= 60% de 2 = 1.2
        expect(classifyCoverageProtection(true, 1, 2)).toBe('critico');
    });

    it('classifyCoverageProtection: cai no limiar-padrão documentado sem Win Rate histórico', () => {
        expect(classifyCoverageProtection(true, 3, null)).toBe('saudavel');
        expect(classifyCoverageProtection(true, 2, null)).toBe('atencao');
        expect(classifyCoverageProtection(true, 1, null)).toBe('critico');
    });

    it('Proteção 90 dias: 4 entradas em meses de calendário sequenciais, sem meta = sem_dados', async () => {
        const repo = new FakeRepository([deal({ id: 'd1', amount: 10_000 })]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        expect(overview.coverageProtection).toHaveLength(4);
        expect(overview.coverageProtection.map((e) => e.period)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
        expect(overview.coverageProtection.map((e) => e.label)).toEqual(['AGO/2026', 'SET/2026', 'OUT/2026', 'NOV/2026']);
        expect(overview.coverageProtection.every((e) => e.status === 'sem_dados')).toBe(true);
    });

    it('Proteção 90 dias: classifica cada mês com base na meta e no pipeline elegível daquele mês', async () => {
        const won = deal({ id: 'w1', amount: 10_000, stageIsWon: true, pipelineStageId: 'stage-ganho', closedAt: new Date('2026-08-05T00:00:00Z') });
        const lost = deal({ id: 'l1', amount: 5_000, stageIsLost: true, pipelineStageId: 'stage-perdido', closedAt: new Date('2026-08-06T00:00:00Z') });
        // Win Rate = 1/(1+1) = 50% -> coverageRecommended = 2x
        const eligibleAug = deal({ id: 'e-aug', amount: 20_000, expectedCloseAt: new Date('2026-08-20T00:00:00Z') });
        const eligibleSep = deal({ id: 'e-sep', amount: 200_000, expectedCloseAt: new Date('2026-09-10T00:00:00Z') });
        const repo = new FakeRepository([won, lost, eligibleAug, eligibleSep]);
        await repo.upsertGoal(ORG, '2026-08', 'NEW_MRR', 50_000, 'BRL', 'user-1'); // remainingGoal = 50000-10000 = 40000; coverage = 20000/40000 = 0.5x -> critico (< 60% de 2x)
        await repo.upsertGoal(ORG, '2026-09', 'NEW_MRR', 20_000, 'BRL', 'user-1'); // remainingGoal = 20000; coverage = 200000/20000 = 10x -> saudavel
        const useCases = new CommercialIntelligenceUseCases(repo);

        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        const [m0, m1, m2, m3] = overview.coverageProtection;
        expect(m0.coverage).toBe(0.5);
        expect(m0.status).toBe('critico');
        expect(m1.coverage).toBe(10);
        expect(m1.status).toBe('saudavel');
        expect(m2.status).toBe('sem_dados');
        expect(m3.status).toBe('sem_dados');
    });

    it('Proteção 90 dias: meta batida no mês (remainingGoal = 0) é "saudavel", nunca "sem_dados"', async () => {
        const won = deal({ id: 'w1', amount: 50_000, stageIsWon: true, pipelineStageId: 'stage-ganho', closedAt: new Date('2026-08-05T00:00:00Z') });
        const repo = new FakeRepository([won]);
        await repo.upsertGoal(ORG, '2026-08', 'NEW_MRR', 50_000, 'BRL', 'user-1');
        const useCases = new CommercialIntelligenceUseCases(repo);
        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        expect(overview.coverageProtection[0].remainingGoal).toBe(0);
        expect(overview.coverageProtection[0].coverage).toBeNull();
        expect(overview.coverageProtection[0].status).toBe('saudavel');
    });

    // ─── Comparação com o mês anterior (seção 7/23) ────────────────────────────

    it('Comparação com o mês anterior: null sem nenhum negócio fechado no mês anterior', async () => {
        const repo = new FakeRepository([deal({ id: 'd1', amount: 10_000 })]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        expect(overview.previousPeriod).toBeNull();
    });

    it('Comparação com o mês anterior: Fechado e Win Rate do mês anterior quando há negócios fechados', async () => {
        const wonPrev = deal({ id: 'wp', amount: 40_000, stageIsWon: true, pipelineStageId: 'stage-ganho', closedAt: new Date('2026-07-10T00:00:00Z') });
        const lostPrev = deal({ id: 'lp', amount: 10_000, stageIsLost: true, pipelineStageId: 'stage-perdido', closedAt: new Date('2026-07-12T00:00:00Z') });
        const repo = new FakeRepository([wonPrev, lostPrev]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        expect(overview.previousPeriod).toEqual({ period: '2026-07', closedAmount: 40_000, closedCount: 1, winRate: 50 });
    });

    // ─── Forecast Confidence (seção 22) ────────────────────────────────────────

    it('Forecast Confidence: null sem nenhum negócio aberto', async () => {
        const useCases = new CommercialIntelligenceUseCases(new FakeRepository([]));
        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        expect(overview.forecastConfidence.score).toBeNull();
        expect(overview.forecastConfidence.classification).toBeNull();
        expect(overview.forecastConfidence.sampleSize).toBe(0);
    });

    it('Forecast Confidence: reduz proporcionalmente quando a amostra tem menos de 5 negócios abertos', async () => {
        // 2 negócios abertos, campos-chave completos (default de deal()), sem histórico de etapa.
        const deals = [deal({ id: 'a', amount: 10_000 }), deal({ id: 'b', amount: 20_000 })];
        const repo = new FakeRepository(deals);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        // fieldCompletenessScore=100, stageHistoryCoverage=0 -> combinado=70; amostra 2/5 -> 28
        expect(overview.forecastConfidence.fieldCompletenessScore).toBe(100);
        expect(overview.forecastConfidence.stageHistoryCoverage).toBe(0);
        expect(overview.forecastConfidence.sampleSizePenaltyApplied).toBe(true);
        expect(overview.forecastConfidence.score).toBe(28);
        expect(overview.forecastConfidence.classification).toBe('critico');
    });

    it('Forecast Confidence: sem redutor a partir de 5 negócios abertos', async () => {
        const deals = ['a', 'b', 'c', 'd', 'e'].map((id) => deal({ id, amount: 10_000 }));
        const repo = new FakeRepository(deals);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        expect(overview.forecastConfidence.sampleSizePenaltyApplied).toBe(false);
        expect(overview.forecastConfidence.score).toBe(70); // 100*0.7 + 0*0.3
        expect(overview.forecastConfidence.classification).toBe('atencao');
    });

    it('Forecast Confidence: cobertura de histórico de etapa eleva o score quando os negócios têm LeadStageHistory', async () => {
        const deals = ['a', 'b', 'c', 'd', 'e'].map((id) => deal({ id, amount: 10_000 }));
        const history = deals.map((d) => ({ leadId: d.id, stageId: d.pipelineStageId, stageName: d.stageName ?? '', enteredAt: new Date('2026-08-01T00:00:00Z'), exitedAt: null }));
        const repo = new FakeRepository(deals, STAGES, history);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const overview = await useCases.executiveOverview(ORG, { month: PERIOD }, NOW);
        expect(overview.forecastConfidence.stageHistoryCoverage).toBe(100);
        expect(overview.forecastConfidence.score).toBe(100);
        expect(overview.forecastConfidence.classification).toBe('saudavel');
    });

    // ─── Confiabilidade dos Dados (seção 5) ────────────────────────────────────

    it('Confiabilidade dos Dados: pondera por impacto no forecast, não é a média simples de completude', async () => {
        const complete = deal({ id: 'complete-1', amount: 10_000 });
        const missingKeyFields = deal({ id: 'missing-1', amount: 0, owner: null, expectedCloseAt: null, nextAction: null });
        const repo = new FakeRepository([complete, missingKeyFields]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const quality = await useCases.crmQuality(ORG, { month: PERIOD }, NOW);
        expect(quality.dataReadiness.overallScore).not.toBeNull();
        const valorField = quality.dataReadiness.fields.find((f) => f.field === 'amount');
        expect(valorField?.completeness).toBe(50);
        expect(valorField?.classification).toBe('atencao');
    });

    it('Confiabilidade dos Dados: "Motivo da perda" é avaliado sobre negócios perdidos, não abertos', async () => {
        const open = deal({ id: 'open-1', amount: 10_000 });
        const lostWithReason = deal({ id: 'lost-1', amount: 5_000, stageIsLost: true, closedAt: new Date('2026-08-05'), lossReason: 'Preço alto' });
        const lostNoReason = deal({ id: 'lost-2', amount: 5_000, stageIsLost: true, closedAt: new Date('2026-08-06'), lossReason: null });
        const repo = new FakeRepository([open, lostWithReason, lostNoReason]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const quality = await useCases.crmQuality(ORG, { month: PERIOD }, NOW);
        const lossField = quality.dataReadiness.fields.find((f) => f.field === 'lossReason');
        expect(lossField?.total).toBe(2);
        expect(lossField?.filled).toBe(1);
        expect(lossField?.completeness).toBe(50);
    });

    it('Confiabilidade dos Dados: "Não disponível" (null) quando não há nenhum negócio perdido, nunca 0% fabricado', async () => {
        const open = deal({ id: 'open-1', amount: 10_000 });
        const repo = new FakeRepository([open]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const quality = await useCases.crmQuality(ORG, { month: PERIOD }, NOW);
        const lossField = quality.dataReadiness.fields.find((f) => f.field === 'lossReason');
        expect(lossField?.total).toBe(0);
        expect(lossField?.completeness).toBeNull();
        expect(lossField?.classification).toBeNull();
    });

    // ─── Pipeline Creation Pace (seção 21) ──────────────────────────────────────

    it('Pipeline Creation Pace: ritmo esperado proporcional a dias úteis decorridos no mês', async () => {
        const won = deal({ id: 'w1', amount: 25_000, stageIsWon: true, pipelineStageId: 'stage-ganho', closedAt: new Date('2026-08-05T00:00:00Z') });
        const lost = deal({ id: 'l1', amount: 25_000, stageIsLost: true, pipelineStageId: 'stage-perdido', closedAt: new Date('2026-08-06T00:00:00Z') });
        // Win Rate = 50%
        const createdThisMonth = deal({ id: 'novo-1', amount: 25_000, createdAt: new Date('2026-08-03T00:00:00Z') });
        const repo = new FakeRepository([won, lost, createdThisMonth]);
        await repo.upsertGoal(ORG, PERIOD, 'NEW_MRR', 100_000, 'BRL', 'user-1'); // pipelineNeeded = 100000/0.5 = 200000
        const useCases = new CommercialIntelligenceUseCases(repo);
        const result = await useCases.pipelineCreation(ORG, { month: PERIOD }, NOW); // NOW = 2026-08-15
        expect(result.pipelineNeeded).toBe(200_000);
        expect(result.totalBusinessDays).toBe(21); // agosto/2026 inteiro
        expect(result.elapsedBusinessDays).toBeGreaterThan(0);
        expect(result.elapsedBusinessDays).toBeLessThan(result.totalBusinessDays);
        expect(result.paceExpectedAmount).toBeCloseTo(200_000 * (result.elapsedBusinessDays / result.totalBusinessDays), 2);
        expect(result.pacePercent).toBeCloseTo((result.amount / (result.paceExpectedAmount as number)) * 100, 2);
    });

    it('Pipeline Creation Pace: sem Pipeline Necessário calculável, todos os campos de ritmo ficam "Não disponível" (null)', async () => {
        const createdThisMonth = deal({ id: 'novo-1', amount: 25_000, createdAt: new Date('2026-08-03T00:00:00Z') });
        const repo = new FakeRepository([createdThisMonth]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const result = await useCases.pipelineCreation(ORG, { month: PERIOD }, NOW);
        expect(result.pipelineNeeded).toBeNull();
        expect(result.paceExpectedAmount).toBeNull();
        expect(result.pacePercent).toBeNull();
        expect(result.paceGapAmount).toBeNull();
    });

    // ─── Alertas positivos e adicionais (seção 19) ──────────────────────────────

    it('Alertas: "Forecast acima da meta" (positivo) quando o forecast já cobre a meta', async () => {
        const won = deal({ id: 'w1', amount: 100_000, stageIsWon: true, pipelineStageId: 'stage-ganho', closedAt: new Date('2026-08-05T00:00:00Z') });
        const repo = new FakeRepository([won]);
        await repo.upsertGoal(ORG, PERIOD, 'NEW_MRR', 50_000, 'BRL', 'user-1');
        const useCases = new CommercialIntelligenceUseCases(repo);
        const alerts = await useCases.alerts(ORG, { month: PERIOD }, NOW);
        expect(alerts.some((a) => a.id === 'forecast-acima-meta' && a.severity === 'positive')).toBe(true);
    });

    it('Alertas: crítico quando a confiabilidade do forecast está baixa', async () => {
        const missingFields = deal({ id: 'm1', amount: 0, owner: null, expectedCloseAt: null, nextAction: null, lastInteraction: null });
        const repo = new FakeRepository([missingFields]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const alerts = await useCases.alerts(ORG, { month: PERIOD }, NOW);
        expect(alerts.some((a) => a.id === 'forecast-confidence-critica' && a.severity === 'critical')).toBe(true);
    });

    it('Alertas: "Propostas sem interação" quando um negócio Commit/Best Case está sem interação recente', async () => {
        const staleProposal = deal({ id: 'stale-1', amount: 40_000, stageProbability: 60, pipelineStageId: 'stage-proposta', lastInteraction: null });
        const repo = new FakeRepository([staleProposal]);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const alerts = await useCases.alerts(ORG, { month: PERIOD }, NOW);
        expect(alerts.some((a) => a.id === 'propostas-sem-interacao' && a.severity === 'warning')).toBe(true);
    });

    // ─── Funil histórico (seção 12) ─────────────────────────────────────────────

    it('Funil histórico: negócio perdido cedo não conta como tendo alcançado uma etapa posterior — a etapa terminal nunca vira proxy de progresso', async () => {
        const lostEarly = deal({ id: 'lost-early', amount: 10_000, stageIsLost: true, pipelineStageId: 'stage-perdido', closedAt: new Date('2026-08-05T00:00:00Z') });
        const history = [
            { leadId: 'lost-early', stageId: 'stage-nova', stageName: 'Nova Oportunidade', enteredAt: new Date('2026-08-01T00:00:00Z'), exitedAt: new Date('2026-08-03T00:00:00Z') },
            { leadId: 'lost-early', stageId: 'stage-perdido', stageName: 'Negócios Perdidos', enteredAt: new Date('2026-08-03T00:00:00Z'), exitedAt: null },
        ];
        const repo = new FakeRepository([lostEarly], STAGES, history);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const performance = await useCases.performance(ORG, { month: PERIOD }, NOW);
        expect(performance.funnel.find((f) => f.stageId === 'stage-nova')?.historicalReachedCount).toBe(1);
        expect(performance.funnel.find((f) => f.stageId === 'stage-proposta')?.historicalReachedCount).toBe(0);
    });

    it('Funil histórico: negócio ganho conta em todas as etapas abertas que passou, segundo o histórico', async () => {
        const won = deal({ id: 'won-1', amount: 50_000, stageIsWon: true, pipelineStageId: 'stage-ganho', closedAt: new Date('2026-08-10T00:00:00Z') });
        const history = [
            { leadId: 'won-1', stageId: 'stage-nova', stageName: 'Nova Oportunidade', enteredAt: new Date('2026-08-01T00:00:00Z'), exitedAt: new Date('2026-08-02T00:00:00Z') },
            { leadId: 'won-1', stageId: 'stage-proposta', stageName: 'Proposta Enviada', enteredAt: new Date('2026-08-02T00:00:00Z'), exitedAt: new Date('2026-08-09T00:00:00Z') },
            { leadId: 'won-1', stageId: 'stage-ganho', stageName: 'Negócios Ganhos', enteredAt: new Date('2026-08-09T00:00:00Z'), exitedAt: null },
        ];
        const repo = new FakeRepository([won], STAGES, history);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const performance = await useCases.performance(ORG, { month: PERIOD }, NOW);
        expect(performance.funnel.find((f) => f.stageId === 'stage-nova')?.historicalReachedCount).toBe(1);
        const proposta = performance.funnel.find((f) => f.stageId === 'stage-proposta');
        expect(proposta?.historicalReachedCount).toBe(1);
        expect(proposta?.historicalConversionFromPrevious).toBe(100);
    });

    it('Funil histórico: negócio aberto sem nenhum histórico usa a etapa atual como alcançada (registro legado)', async () => {
        const openLegacy = deal({ id: 'open-legacy', amount: 20_000, pipelineStageId: 'stage-proposta', stageName: 'Proposta Enviada', stageSortOrder: 1 });
        const repo = new FakeRepository([openLegacy], STAGES, []);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const performance = await useCases.performance(ORG, { month: PERIOD }, NOW);
        expect(performance.funnel.find((f) => f.stageId === 'stage-nova')?.historicalReachedCount).toBe(1);
        expect(performance.funnel.find((f) => f.stageId === 'stage-proposta')?.historicalReachedCount).toBe(1);
    });

    it('Funil histórico: negócio fechado sem nenhuma linha de histórico não é contado em nenhuma etapa (nunca progresso fabricado)', async () => {
        const lostNoHistory = deal({ id: 'lost-no-history', amount: 15_000, stageIsLost: true, pipelineStageId: 'stage-perdido', closedAt: new Date('2026-08-05T00:00:00Z') });
        const repo = new FakeRepository([lostNoHistory], STAGES, []);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const performance = await useCases.performance(ORG, { month: PERIOD }, NOW);
        expect(performance.funnel.every((f) => f.historicalReachedCount === 0)).toBe(true);
    });

    it('Funil histórico: funnelHistoricalTrackingSince é null sem nenhum histórico e a data mais antiga quando há histórico', async () => {
        const repoSemHistorico = new FakeRepository([deal({ id: 'd1', amount: 1_000 })], STAGES, []);
        const perfSemHistorico = await new CommercialIntelligenceUseCases(repoSemHistorico).performance(ORG, { month: PERIOD }, NOW);
        expect(perfSemHistorico.funnelHistoricalTrackingSince).toBeNull();

        const history = [{ leadId: 'd2', stageId: 'stage-nova', stageName: 'Nova Oportunidade', enteredAt: new Date('2026-07-15T00:00:00Z'), exitedAt: null }];
        const repoComHistorico = new FakeRepository([deal({ id: 'd2', amount: 1_000 })], STAGES, history);
        const perfComHistorico = await new CommercialIntelligenceUseCases(repoComHistorico).performance(ORG, { month: PERIOD }, NOW);
        expect(perfComHistorico.funnelHistoricalTrackingSince).toBe('2026-07-15T00:00:00.000Z');
    });

    // ─── Opções de filtro reais (seção 18) ──────────────────────────────────────

    it('filterOptions: delega ao repositório os valores reais já usados por negócios do funil Negócio', async () => {
        const repo = new FakeRepository([]);
        repo.filterOptionsResult = { owners: ['ana@atlasgr.com.br'], products: ['SKU-1'], sources: ['Indicação'], icps: ['Enterprise'] };
        const useCases = new CommercialIntelligenceUseCases(repo);
        const result = await useCases.filterOptions(ORG);
        expect(result).toEqual(repo.filterOptionsResult);
    });

    // ─── Tendências históricas — 6 meses (seção 23) ─────────────────────────────

    it('historicalTrends: 6 meses do mais antigo ao mais recente, terminando no mês do filtro', async () => {
        const useCases = new CommercialIntelligenceUseCases(new FakeRepository([]));
        const result = await useCases.historicalTrends(ORG, { month: PERIOD }, NOW);
        expect(result.points.map((p) => p.period)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
    });

    it('historicalTrends: mês sem amostra retorna "Não disponível" (null) em vez de interpolar', async () => {
        const useCases = new CommercialIntelligenceUseCases(new FakeRepository([]));
        const result = await useCases.historicalTrends(ORG, { month: PERIOD }, NOW);
        expect(result.points.every((p) => p.winRate === null && p.closedSampleSize === 0)).toBe(true);
    });

    it('historicalTrends: mês com negócio fechado retorna Win Rate e Ticket Médio reais daquele mês', async () => {
        const won = deal({ id: 'w1', amount: 30_000, stageIsWon: true, pipelineStageId: 'stage-ganho', closedAt: new Date('2026-06-10T00:00:00Z') });
        const useCases = new CommercialIntelligenceUseCases(new FakeRepository([won]));
        const result = await useCases.historicalTrends(ORG, { month: PERIOD }, NOW);
        const june = result.points.find((p) => p.period === '2026-06');
        expect(june?.winRate).toBe(100);
        expect(june?.averageTicketWon).toBe(30_000);
        expect(june?.closedSampleSize).toBe(1);
    });

    // ─── Bitrix24: última sincronização e atividade de 30 dias (seção 28) ──────

    it('Qualidade do CRM: expõe última sincronização e volume de sucesso/falha dos últimos 30 dias', async () => {
        const repo = new FakeRepository([deal({ id: 'd1', amount: 1_000 })], STAGES, [], 0, 0, 0, true);
        repo.syncActivity = { lastSyncAt: new Date('2026-08-14T10:00:00Z'), syncedCount: 12, failedCount: 3 };
        const useCases = new CommercialIntelligenceUseCases(repo);
        const quality = await useCases.crmQuality(ORG, { month: PERIOD }, NOW);
        expect(quality.bitrixSync.lastSyncAt).toBe('2026-08-14T10:00:00.000Z');
        expect(quality.bitrixSync.syncedCount30d).toBe(12);
        expect(quality.bitrixSync.failedCount30d).toBe(3);
    });

    it('Qualidade do CRM: sem conexão Bitrix, atividade de sincronização fica explicitamente zerada', async () => {
        const repo = new FakeRepository([deal({ id: 'd1', amount: 1_000 })], STAGES, [], 0, 0, 0, false);
        const useCases = new CommercialIntelligenceUseCases(repo);
        const quality = await useCases.crmQuality(ORG, { month: PERIOD }, NOW);
        expect(quality.bitrixSync.lastSyncAt).toBeNull();
        expect(quality.bitrixSync.syncedCount30d).toBe(0);
        expect(quality.bitrixSync.failedCount30d).toBe(0);
    });
});
