import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface AccountHealthIndicators {
    clientName: string;
    contractAgeMonths: number;
    monthlyRecurringRevenue: number;
    openSupportTickets: number;
    unresolvedComplaints: number;
    paymentDelaysLast90Days: number;
    platformUsageDropPercentage: number;
    recentSentimentNotes?: string;
}

export interface ChurnPredictionResult {
    churnRisk: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
    healthScore: number; // 0 a 100 (100 = conta saudável, 0 = churn iminente)
    primaryRiskDrivers: string[];
    immediateRetentionPlaybook: string[];
    suggestedRetentionDiscountOrBenefit?: string;
    executiveAlertSummary: string;
}

export class ChurnPredictionService {
    async analyzeChurnRisk(account: AccountHealthIndicators): Promise<ChurnPredictionResult> {
        const model = getAiModel('local-llama3-fast', 0.1, 'churn-prediction');
        const startTime = Date.now();

        const systemPrompt = `Você é um Cientista de Dados e Estrategista de Customer Success e Retenção B2B (Logística e Rastreamento de Frotas).
Avalie os indicadores de saúde da conta e calcule o risco real de churn (cancelamento) e o Health Score da conta.
Destaque:
1. Nível de Risco: Baixo / Médio / Alto / Crítico.
2. Health Score de 0 a 100.
3. Principais fatores de risco (ex: queda abrupta de telemetria ativa, reclamações de suporte não resolvidas, atraso financeiro).
4. Plano de retenção preventivo imediato (Playbook de CS).

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "churnRisk": "Alto",
  "healthScore": 42,
  "primaryRiskDrivers": [
    "Uso da plataforma caiu 40% no último mês",
    "3 chamados críticos sem resolução na mesa de suporte"
  ],
  "immediateRetentionPlaybook": [
    "Agendar visita técnica de alinhamento com o Gerente de CS",
    "Revisar o funcionamento dos sensores de telemetria sem custo adicional"
  ],
  "suggestedRetentionDiscountOrBenefit": "Oferecer 1 mês de isenção na taxa de manutenção em troca de renovação por 12 meses",
  "executiveAlertSummary": "Resumo em 1 parágrafo para o Diretor Comercial sobre o perigo e ação corretiva."
}`;

        try {
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Indicadores da Conta:\n${JSON.stringify(account, null, 2)}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'churn-prediction-analysis',
            });

            return cleanAndParseJson<ChurnPredictionResult>(response.content);
        } catch (error) {
            logger.error({ err: error }, 'Erro ao analisar risco de churn');
            return {
                churnRisk: account.platformUsageDropPercentage > 30 ? 'Alto' : 'Médio',
                healthScore: Math.max(10, 100 - account.platformUsageDropPercentage - (account.openSupportTickets * 10)),
                primaryRiskDrivers: ['Indicadores operacionais requerem atenção'],
                immediateRetentionPlaybook: ['Entrar em contato com o responsável pela conta'],
                executiveAlertSummary: `Conta ${account.clientName} monitorada preventivamente.`,
            };
        }
    }
}
