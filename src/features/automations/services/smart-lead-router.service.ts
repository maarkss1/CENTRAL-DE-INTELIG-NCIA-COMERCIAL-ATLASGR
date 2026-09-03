import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface RepProfile {
  repId: string;
  name: string;
  specialties: string[]; // ex: ['Frota Pesada', 'Agro', 'Logística Reversa', 'Contas Estratégicas']
  winRatePercent: number;
  currentLeadCount: number;
}

export interface IncomingLeadInfo {
  leadId: string;
  companyName: string;
  estimatedFleet: number;
  segment: string;
  urgency: 'Alta' | 'Média' | 'Baixa';
  region: string;
}

export interface LeadRoutingMatch {
  recommendedRepId: string;
  recommendedRepName: string;
  matchScore: number; // 0 a 100
  matchRationale: string;
  fallbackRepId?: string;
}

// Achado da auditoria (PR #328, item fora de escopo original): o LLM devolvia `recommendedRepId`
// como texto livre, sem garantia nenhuma de que correspondesse a um vendedor real da lista
// `availableReps` enviada no prompt — um JSON sintaticamente válido com um id inventado passava
// direto para quem consome este resultado (ex.: gravar `Lead.owner`). O schema abaixo valida o
// SHAPE da resposta (nunca confiar que o LLM respeitou o formato pedido no prompt); a checagem de
// pertencimento a `availableReps` (não expressável em Zod, depende do input da chamada) acontece
// logo depois, em `matchLeadToRep`.
const leadRoutingMatchSchema = z.object({
  recommendedRepId: z.string().min(1),
  recommendedRepName: z.string().min(1),
  matchScore: z.number().min(0).max(100),
  matchRationale: z.string().min(1),
  fallbackRepId: z.string().optional(),
});

export class SmartLeadRouterService {
  async matchLeadToRep(
    lead: IncomingLeadInfo,
    availableReps: RepProfile[],
  ): Promise<LeadRoutingMatch> {
    if (!availableReps || availableReps.length === 0) {
      throw new Error('Nenhum vendedor disponível para roteamento.');
    }

    const model = getAiModel('local-llama3-fast', 0.1, 'lead-router');
    const startTime = Date.now();

    const systemPrompt = `Você é um Algoritmo Inteligente de Distribuição e Roteamento de Leads B2B (Smart Lead Router).
Sua missão é selecionar o melhor vendedor da equipe comercial para atender uma nova oportunidade de negócio, equilibrando:
1. Especialidade no segmento do lead (${lead.segment} e porte de frota de ${lead.estimatedFleet} veículos).
2. Histórico de taxa de conversão (winRatePercent).
3. Capacidade de carga atual (evitar sobrecarregar vendedores com muitos leads abertos).

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "recommendedRepId": "rep_123",
  "recommendedRepName": "Nome do Vendedor",
  "matchScore": 94,
  "matchRationale": "Explicação concisa do motivo da escolha (especialista em frota pesada e com capacidade na agenda).",
  "fallbackRepId": "rep_456"
}`;

    try {
      const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(
          `Lead Entrante:\n${JSON.stringify(lead, null, 2)}\n\nVendedores Disponíveis:\n${JSON.stringify(availableReps, null, 2)}`,
        ),
      ]);

      await logAiUsage({
        model: response.response_metadata.model,
        usage: response.response_metadata.tokenUsage,
        latencyMs: Date.now() - startTime,
        promptId: 'smart-lead-routing',
      });

      const parsed = leadRoutingMatchSchema.parse(cleanAndParseJson<unknown>(response.content));

      const isEligible = availableReps.some((rep) => rep.repId === parsed.recommendedRepId);
      if (!isEligible) {
        logger.warn(
          { recommendedRepId: parsed.recommendedRepId, leadId: lead.leadId },
          '[smart-lead-router] LLM sugeriu vendedor fora da lista de disponíveis — usando fallback por winRate.',
        );
        return this.fallbackByWinRate(availableReps);
      }

      return parsed;
    } catch (error) {
      logger.error({ err: error }, 'Erro no roteamento inteligente de lead');
      return this.fallbackByWinRate(availableReps);
    }
  }

  private fallbackByWinRate(availableReps: RepProfile[]): LeadRoutingMatch {
    const sortedByWinRate = [...availableReps].sort((a, b) => b.winRatePercent - a.winRatePercent);
    const best = sortedByWinRate[0];
    return {
      recommendedRepId: best.repId,
      recommendedRepName: best.name,
      matchScore: 80,
      matchRationale: 'Selecionado por critério de melhor taxa de conversão histórica.',
    };
  }
}
