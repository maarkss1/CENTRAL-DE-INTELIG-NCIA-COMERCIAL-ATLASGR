import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getAiModel, withRetry, logAiUsage, cleanAndParseJson } from '../../../lib/ai/gateway.js';
import { redactAndTrackPiiLeak } from '../../intelligence/services/guardrails.service.js';
import { prisma } from '../../../lib/prisma.js';
import { notificationService } from '../../notifications/notification.service.js';
import { CommercialIntelligenceUseCases } from '../application/CommercialIntelligenceUseCases.js';
import { buildForecastRange, computeTrendMomentum } from '../application/predictiveForecast.js';
import type { CommercialIntelligenceFilter, MentorPlaybookResult, MentorRecommendation, ExecutiveAlert, DealDrillDownRow } from '../domain/CommercialIntelligence.js';

/**
 * Camada de IA do Comercial Inteligente — deliberadamente SEPARADA de `AIService`
 * (`src/features/intelligence/services/ai.service.ts`): aquele serviço grounda em UM lead
 * (`buildLeadContext`), este grounda em métricas agregadas já calculadas por
 * `CommercialIntelligenceUseCases` (nunca recalcula nem deixa o modelo inferir números — só
 * narra o que já foi computado e testado). Reaproveita as primitivas de baixo nível do gateway
 * (`getAiModel`/`withRetry`/`logAiUsage`) e a config editável via `AiEngineSetting`/AIConfigCenter,
 * exatamente como `AIService` já faz — ver AGENTS.md deste módulo: "não fabricar KPI" aplica-se
 * também ao texto gerado por IA, não só aos números.
 */

const SUMMARY_TOOL_KEY = 'ci_executive_summary';
const NOTE_TOOL_KEY = 'ci_bitrix_note';
const MENTOR_TOOL_KEY = 'ci_mentor_playbook';

const DEFAULT_SUMMARY_MODEL = 'local-llama3';
const DEFAULT_SUMMARY_TEMPERATURE = 0.3;
const DEFAULT_NOTE_MODEL = 'local-llama3-fast';
const DEFAULT_NOTE_TEMPERATURE = 0.5;
const DEFAULT_MENTOR_MODEL = 'local-llama3';
const DEFAULT_MENTOR_TEMPERATURE = 0.2;

const MENTOR_SYSTEM_PROMPT = `Você é um mentor/analista de receita B2B sênior do "Comercial Inteligente" (AtlasGR/Total Trac), gerando um playbook de ações priorizadas para um ADMIN ou GESTOR comercial.
REGRAS CRÍTICAS:
1. Use SOMENTE os dados do contexto abaixo — nunca invente valor, prazo, nome ou negócio. Dado ausente não vira suposição.
2. Gere de 3 a 5 recomendações, cada uma ligada a um número/negócio ESPECÍFICO do contexto — nunca um conselho genérico ("melhore o processo de vendas").
3. Ordene por prioridade real (impacto financeiro e urgência), não pela ordem em que os dados aparecem.
4. "suggestedAction" precisa ser uma ação concreta e executável hoje (ex.: "Ligar para [empresa] e reagendar a próxima ação, vencida há 9 dias"), não um objetivo abstrato.
5. "relatedDealIds" só deve conter IDs de negócios que estão listados no contexto — nunca invente um ID.
6. Responda APENAS com um JSON válido, sem markdown, sem texto antes ou depois, no formato:
[{"priority":"alta","title":"...","rationale":"...","suggestedAction":"...","relatedDealIds":["..."]}]`;

const SUMMARY_SYSTEM_PROMPT = `Você é um analista de receita B2B sênior escrevendo um resumo executivo curto do "Comercial Inteligente" (AtlasGR/Total Trac) para um ADMIN ou GESTOR comercial.
REGRAS CRÍTICAS:
1. Use SOMENTE os números do contexto abaixo — nunca invente, estime ou arredonde de um jeito que mude o sentido de um valor. Dado ausente = "não disponível", nunca presumido.
2. 3 a 5 frases curtas, tom consultivo direto, sem jargão vazio ("sinergia", "alavancar", "estado da arte").
3. Priorize o que precisa de ação HOJE — não liste tudo, destaque primeiro o mais urgente/crítico.
4. Termine com UMA recomendação concreta, ligada a um número específico do contexto.
5. Nunca mencione que você é uma IA nem descreva o que está fazendo — entregue direto o resumo, sem introdução ("Aqui está o resumo:").`;

const NOTE_SYSTEM_PROMPT = `Você escreve uma nota curta para a timeline de um negócio no Bitrix24, alertando o time comercial sobre um risco identificado pelo Comercial Inteligente (AtlasGR/Total Trac).
REGRAS CRÍTICAS:
1. Use SOMENTE os dados do negócio fornecidos abaixo — nunca invente valor, prazo, nome ou etapa.
2. Máximo 3 frases, tom interno/profissional — isto é lido pelo time comercial, não pelo cliente.
3. Explique o risco e sugira uma ação concreta e específica para ESTE negócio (não um conselho genérico).
4. Sem saudação, sem assinatura — é uma nota de sistema, não um e-mail.
5. Responda apenas com o texto da nota, sem aspas, sem introdução.`;

function money(value: number | null, currency = 'BRL'): string {
    if (value == null) return 'não disponível';
    return value.toLocaleString('pt-BR', { style: 'currency', currency });
}

/**
 * Fallback determinístico do Mentor Comercial (sem IA) — derivado só de `alerts` (métrica
 * agregada) e dos negócios com maior valor em risco (`priorityDeals`, já ordenados por
 * `dealsDrillDown({sort:'riskImpact'})`). Usado quando a chamada de IA falha ou devolve algo não
 * parseável — o painel nunca some, só perde a redação em linguagem natural.
 */
function buildFallbackRecommendations(alerts: ExecutiveAlert[], priorityDeals: DealDrillDownRow[]): MentorRecommendation[] {
    const fromAlerts: MentorRecommendation[] = alerts
        .filter((a) => a.severity === 'critical' || a.severity === 'warning')
        .slice(0, 3)
        .map((a) => ({
            priority: a.severity === 'critical' ? 'alta' : 'media',
            title: a.title,
            rationale: a.description,
            suggestedAction: 'Revisar esta métrica no cockpit e definir uma ação corretiva hoje.',
            relatedDealIds: [],
        }));

    const fromDeals: MentorRecommendation[] = priorityDeals
        .slice(0, 3)
        .map((d) => ({
            priority: d.riskFactors.length >= 2 ? 'alta' : 'media',
            title: `Negócio em risco: ${d.title ?? d.companyName ?? d.id}`,
            rationale: d.riskFactors.length > 0 ? d.riskFactors.join('; ') : 'Valor em risco elevado sem fator de risco específico listado.',
            suggestedAction: 'Contatar o responsável, atualizar a próxima ação e a data prevista de fechamento.',
            relatedDealIds: [d.id],
        }));

    return [...fromAlerts, ...fromDeals].slice(0, 5);
}

export interface ExecutiveSummaryResult {
    summary: string;
    generatedAt: string;
}

export interface BitrixNoteDraftResult {
    draft: string;
}

export class CommercialIntelligenceAiService {
    constructor(private useCases: CommercialIntelligenceUseCases) {}

    /**
     * Resumo executivo em linguagem natural sobre o cockpit do período — narra números já
     * calculados por `executiveOverview`/`alerts`/`aging` (mesmos endpoints que a UI já usa e que
     * já têm cobertura de teste próprios). Quando há alerta crítico, também registra uma
     * `Notification` — é a parte "automação" desta função: gerar o resumo já avisa o time no sino,
     * sem passo manual extra.
     */
    async generateExecutiveSummary(organizationId: string, filter: CommercialIntelligenceFilter): Promise<ExecutiveSummaryResult> {
        const [overview, alerts, aging, creation] = await Promise.all([
            this.useCases.executiveOverview(organizationId, filter),
            this.useCases.alerts(organizationId, filter),
            this.useCases.aging(organizationId, filter),
            this.useCases.pipelineCreation(organizationId, filter),
        ]);

        if (overview.isEmpty) {
            return { summary: 'Ainda não há negócios no funil "Negócio" para resumir.', generatedAt: new Date().toISOString() };
        }

        const currency = overview.goal?.currency ?? 'BRL';
        const stagnantAmount = aging.byStage.reduce((sum, stage) => sum + stage.amountOverThreshold, 0);

        const contextLines = [
            `- Período: ${overview.period}`,
            `- Meta New MRR: ${overview.goal ? money(overview.goal.amount, currency) : 'não cadastrada'}`,
            `- Fechado no mês: ${money(overview.closedAmount, currency)} (${overview.closedCount} negócio(s))`,
            `- % da meta atingido: ${overview.pctOfGoal != null ? `${overview.pctOfGoal.toFixed(1)}%` : 'não disponível (sem meta cadastrada)'}`,
            `- Forecast total (fechado + commit + best case + pipeline ponderado): ${money(overview.forecastAmount, currency)}`,
            `- Gap do forecast para a meta: ${overview.gapForecast != null ? money(overview.gapForecast, currency) : 'não disponível'}`,
            `- Pipeline total aberto: ${money(overview.pipelineTotal, currency)} (${overview.pipelineTotalCount} negócio(s))`,
            `- Coverage do mês: ${overview.coverageMonth.coverage != null ? `${overview.coverageMonth.coverage.toFixed(1)}x` : 'não disponível'}${overview.coverageMonth.coverageRecommended != null ? ` (recomendado: ${overview.coverageMonth.coverageRecommended.toFixed(1)}x)` : ''}`,
            `- Proteção 90 dias (M+1/M+2/M+3): ${overview.coverageProtection.slice(1).map((e) => `${e.label} ${e.coverage != null ? `${e.coverage.toFixed(1)}x` : 'sem dados'} (${e.status})`).join(', ')}`,
            `- Forecast Confidence: ${overview.forecastConfidence.score != null ? `${overview.forecastConfidence.score}% (${overview.forecastConfidence.classification})` : 'não disponível (sem negócio aberto para avaliar)'}`,
            `- Pipeline Creation Pace: ${creation.pacePercent != null ? `${creation.pacePercent.toFixed(0)}% do ritmo necessário` : 'não disponível'}`,
            overview.previousPeriod
                ? `- Mês anterior (${overview.previousPeriod.period}): fechado ${money(overview.previousPeriod.closedAmount, currency)}, Win Rate ${overview.previousPeriod.winRate != null ? `${overview.previousPeriod.winRate.toFixed(1)}%` : 'não disponível'}`
                : '- Mês anterior: sem base histórica suficiente para comparação',
            `- Valor estagnado acima do aging crítico (${aging.criticalThresholdDays} dias na etapa): ${money(stagnantAmount, currency)}`,
            alerts.length > 0
                ? `- Alertas ativos (${alerts.length}): ${alerts.map((a) => `[${a.severity}] ${a.title} — ${a.description}`).join(' | ')}`
                : '- Nenhum alerta ativo no momento.',
        ];

        const userPrompt = `## Dados reais do Comercial Inteligente — use somente estes números:\n${contextLines.join('\n')}`;

        const summary = await this.invoke(SUMMARY_TOOL_KEY, DEFAULT_SUMMARY_MODEL, DEFAULT_SUMMARY_TEMPERATURE, SUMMARY_SYSTEM_PROMPT, userPrompt, 'Não foi possível gerar o resumo executivo agora.');

        const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
        if (criticalCount > 0) {
            await notificationService.create({
                organizationId,
                title: `Comercial Inteligente: ${criticalCount} risco(s) crítico(s) identificado(s)`,
                body: summary,
                kind: 'Alerta',
                entity: 'CommercialIntelligence',
            });
        }

        return { summary, generatedAt: new Date().toISOString() };
    }

    /**
     * Rascunho de nota de risco para um negócio específico, grounded em `forecastExplain` (mesmo
     * cálculo de fatores positivos/negativos já usado no drill-down) — nunca enviado sozinho: a UI
     * mostra o rascunho num campo editável e só posta no Bitrix quando a pessoa confirma (mesmo
     * princípio de qualquer escrita em sistema externo: revisão humana antes do envio).
     */
    async draftBitrixRiskNote(organizationId: string, leadId: string): Promise<BitrixNoteDraftResult | null> {
        const deal = await this.useCases.forecastExplain(organizationId, leadId);
        if (!deal) return null;

        const contextLines = [
            `- Negócio: ${deal.title ?? 'Sem título'}${deal.companyName ? ` — ${deal.companyName}` : ''}`,
            `- Valor: ${money(deal.amount)}`,
            `- Responsável: ${deal.owner ?? 'não atribuído'}`,
            `- Probabilidade ponderada: ${deal.weightedProbability}%`,
            `- Classificação (tier de forecast): ${deal.tier}`,
            `- Fatores de risco identificados: ${deal.negativeFactors.length > 0 ? deal.negativeFactors.join('; ') : 'nenhum listado'}`,
            deal.positiveFactors.length > 0 ? `- Fatores positivos: ${deal.positiveFactors.join('; ')}` : null,
        ].filter((line): line is string => line !== null);

        const userPrompt = `## Dados reais deste negócio — use somente estes dados:\n${contextLines.join('\n')}`;
        const draft = await this.invoke(NOTE_TOOL_KEY, DEFAULT_NOTE_MODEL, DEFAULT_NOTE_TEMPERATURE, NOTE_SYSTEM_PROMPT, userPrompt, 'Não foi possível gerar a nota agora.');
        return { draft };
    }

    /**
     * Mentor Comercial — playbook de recomendações priorizadas. Diferente de
     * `generateExecutiveSummary` (um parágrafo narrando o cockpit), aqui o modelo devolve JSON
     * ESTRUTURADO (mesmo padrão de `ChurnPredictionService.analyzeChurnRisk`:
     * `cleanAndParseJson` + fallback determinístico se a IA falhar ou o JSON não parsear — nunca
     * deixa o painel vazio só porque o modelo falhou). Grounded nos mesmos relatórios já testados
     * (`executiveOverview`/`alerts`/`aging`/`pipelineCreation`/`historicalTrends`) mais a Faixa de
     * Previsão (`predictiveForecast.ts`, recomposição de campos já existentes) e os negócios com
     * maior valor em risco (`dealsDrillDown` com `sort: 'riskImpact'`).
     */
    async generateMentorPlaybook(organizationId: string, filter: CommercialIntelligenceFilter): Promise<MentorPlaybookResult> {
        const [overview, alerts, aging, creation, trends, priorityDeals] = await Promise.all([
            this.useCases.executiveOverview(organizationId, filter),
            this.useCases.alerts(organizationId, filter),
            this.useCases.aging(organizationId, filter),
            this.useCases.pipelineCreation(organizationId, filter),
            this.useCases.historicalTrends(organizationId, filter),
            this.useCases.dealsDrillDown(organizationId, { month: filter.month, owner: filter.owner, sort: 'riskImpact', limit: 5 }),
        ]);

        if (overview.isEmpty) {
            return { recommendations: [], source: 'fallback', generatedAt: new Date().toISOString() };
        }

        const currency = overview.goal?.currency ?? 'BRL';
        const range = buildForecastRange(overview);
        const momentum = computeTrendMomentum(trends);
        const stagnantAmount = aging.byStage.reduce((sum, stage) => sum + stage.amountOverThreshold, 0);

        const dealLines = priorityDeals.rows.map((d) => (
            `- [id:${d.id}] ${d.title ?? 'Sem título'}${d.companyName ? ` (${d.companyName})` : ''} — ${money(d.amount, currency)}, responsável ${d.owner ?? 'não atribuído'}, tier ${d.tier ?? 'não classificado'}, ${d.agingDays} dia(s) na etapa. Riscos: ${d.riskFactors.length > 0 ? d.riskFactors.join('; ') : 'nenhum listado'}.`
        ));

        const contextLines = [
            `- Período: ${overview.period}`,
            `- Meta New MRR: ${overview.goal ? money(overview.goal.amount, currency) : 'não cadastrada'}`,
            `- Cenário Conservador (fechado+commit): ${money(range.conservative.amount, currency)}`,
            `- Cenário Provável (forecast ponderado): ${money(range.likely.amount, currency)}`,
            `- Cenário Otimista (fechado+commit+best case+upside): ${money(range.optimistic.amount, currency)}`,
            momentum ? `- Momentum do Win Rate: ${momentum.direction} (${momentum.latestWinRate.toFixed(1)}% no último mês vs. média anterior de ${momentum.previousAverageWinRate.toFixed(1)}%)` : '- Momentum do Win Rate: sem base histórica suficiente',
            `- Gap do forecast para a meta: ${overview.gapForecast != null ? money(overview.gapForecast, currency) : 'não disponível'}`,
            `- Ritmo de criação de pipeline: ${creation.pacePercent != null ? `${creation.pacePercent.toFixed(0)}% do ritmo necessário` : 'não disponível'}`,
            `- Valor estagnado acima do aging crítico (${aging.criticalThresholdDays} dias na etapa): ${money(stagnantAmount, currency)}`,
            alerts.length > 0
                ? `- Alertas ativos (${alerts.length}): ${alerts.map((a) => `[${a.severity}] ${a.title} — ${a.description}`).join(' | ')}`
                : '- Nenhum alerta ativo no momento.',
            `## Negócios com maior valor em risco (use o campo [id:...] em relatedDealIds quando referenciar um destes):`,
            ...(dealLines.length > 0 ? dealLines : ['- Nenhum negócio aberto elegível para priorização.']),
        ];

        const userPrompt = `## Dados reais do Comercial Inteligente — use somente estes dados:\n${contextLines.join('\n')}`;
        const generatedAt = new Date().toISOString();

        try {
            const raw = await this.invoke(MENTOR_TOOL_KEY, DEFAULT_MENTOR_MODEL, DEFAULT_MENTOR_TEMPERATURE, MENTOR_SYSTEM_PROMPT, userPrompt, 'Não foi possível gerar o playbook agora.');
            const parsed = cleanAndParseJson<MentorRecommendation[]>(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Playbook vazio ou em formato inesperado.');
            return { recommendations: parsed.slice(0, 5), source: 'ai', generatedAt };
        } catch {
            return { recommendations: buildFallbackRecommendations(alerts, priorityDeals.rows), source: 'fallback', generatedAt };
        }
    }

    private async invoke(toolKey: string, defaultModel: string, defaultTemperature: number, systemPrompt: string, userPrompt: string, errorPrefix: string): Promise<string> {
        const customSetting = await prisma.aiEngineSetting.findUnique({ where: { toolKey } });
        const model = getAiModel(customSetting?.model ?? defaultModel, customSetting?.temperature ?? defaultTemperature, toolKey);

        const startTime = Date.now();
        let response;
        try {
            response = await withRetry(() => model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(userPrompt),
            ]));
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`${errorPrefix} ${detail}`);
        }
        const latencyMs = Date.now() - startTime;
        await logAiUsage({ model: response.response_metadata.model, usage: response.response_metadata.tokenUsage, latencyMs });

        return (await redactAndTrackPiiLeak(response.content, 'commercial-intelligence')).trim();
    }
}
