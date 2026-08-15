import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getAiModel, withRetry, logAiUsage } from '../../../lib/ai/gateway.js';
import { redactSensitiveData } from '../../intelligence/services/guardrails.service.js';
import { prisma } from '../../../lib/prisma.js';
import { notificationService } from '../../notifications/notification.service.js';
import { CommercialIntelligenceUseCases } from '../application/CommercialIntelligenceUseCases.js';
import type { CommercialIntelligenceFilter } from '../domain/CommercialIntelligence.js';

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

const DEFAULT_SUMMARY_MODEL = 'local-llama3';
const DEFAULT_SUMMARY_TEMPERATURE = 0.3;
const DEFAULT_NOTE_MODEL = 'local-llama3-fast';
const DEFAULT_NOTE_TEMPERATURE = 0.5;

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
        const [overview, alerts, aging] = await Promise.all([
            this.useCases.executiveOverview(organizationId, filter),
            this.useCases.alerts(organizationId, filter),
            this.useCases.aging(organizationId, filter),
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

        return redactSensitiveData(response.content).text.trim();
    }
}
