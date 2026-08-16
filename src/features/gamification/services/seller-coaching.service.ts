import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface SellerPerformanceData {
    sellerName: string;
    role: 'SDR / Hunter' | 'Closer / Executivo de Contas' | 'Account Manager / Farmer';
    period: string;
    callsMade: number;
    connectionsRatePercent: number;
    meetingsScheduled: number;
    proposalsSent: number;
    dealsClosed: number;
    conversionRatePercent: number;
    avgTicket: number;
    topLossReason?: string;
}

export interface SellerCoachingReport {
    motivationalHeadline: string;
    overallGrade: 'A+' | 'A' | 'B' | 'C' | 'D';
    celebrationPoint: string;
    criticalGaps: string[];
    actionableMicroHabits: string[];
    suggestedTrainingTopic: string;
    nextWeekTargetFocus: string;
}

export class SellerCoachingService {
    async generateCoachingReport(data: SellerPerformanceData): Promise<SellerCoachingReport> {
        const model = getAiModel('local-llama3-fast', 0.3, 'seller-coaching');
        const startTime = Date.now();

        const systemPrompt = `Você é o Vice-Presidente de Vendas e Mentor de Elite em Vendas Consultivas B2B.
Analise os KPIs de performance do vendedor e gere um relatório de feedback e coaching semanal humanizado, inspirador, pragmático e focado em melhoria de números.
Regras:
1. Comece celebrando um ponto forte real com energia.
2. Seja cirúrgico nos gargalos (ex: se fez muitas ligações mas poucas reuniões, o problema é o gancho inicial/quebra-gelo).
3. Entregue 2 ou 3 micro-hábitos diários fáceis de aplicar na semana seguinte.

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "motivationalHeadline": "Semana de alta consistência! Vamos focar na conversão de propostas.",
  "overallGrade": "B",
  "celebrationPoint": "Volume de prospecção acima da meta da equipe (120 ligações).",
  "criticalGaps": [
    "Taxa de conversão de reunião para proposta está em 15% (média do time é 30%)",
    "Motivo de perda recorrente: falta de validação do decisor financeiro"
  ],
  "actionableMicroHabits": [
    "Dedicar os primeiros 5 minutos de cada reunião para validar o orçamento e o processo de decisão",
    "Enviar o resumo de ROI em até 2 horas após a call de demonstração"
  ],
  "suggestedTrainingTopic": "Metodologia Sandler: Qualificação Orçamentária e Comitê de Compra",
  "nextWeekTargetFocus": "Aumentar a taxa de conversão em 10% nas contas acima de 20 veículos."
}`;

        try {
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Dados de Performance do Vendedor:\n${JSON.stringify(data, null, 2)}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'seller-coaching-report',
            });

            return cleanAndParseJson<SellerCoachingReport>(response.content);
        } catch (error) {
            logger.error({ err: error }, 'Erro ao gerar coaching do vendedor');
            return {
                motivationalHeadline: `Bom trabalho esta semana, ${data.sellerName}!`,
                overallGrade: 'B',
                celebrationPoint: 'Manutenção do ritmo de atividades comerciais.',
                criticalGaps: ['Otimizar tempo de resposta aos leads qualificados.'],
                actionableMicroHabits: ['Revisar pipeline diariamente no início da manhã.'],
                suggestedTrainingTopic: 'Técnicas de Fechamento e Contorno de Objeções',
                nextWeekTargetFocus: 'Acelerar fechamento de oportunidades em fase final.',
            };
        }
    }
}
