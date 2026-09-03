import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import type { IEnrichedLead } from '../../../types/prospecting';

// Achado da auditoria (PR #328, item fora de escopo original): os 4 métodos deste serviço faziam
// `cleanAndParseJson<T>` (JSON.parse + cast genérico) sem validar o shape contra um schema —
// um JSON sintaticamente válido mas com campos faltando/tipo errado (ex.: "score" como string, um
// item de `objections` sem `responseSpin`) passava direto, sujo, para quem consome o resultado.
// Cada schema abaixo espelha o formato exigido no próprio prompt (fonte da verdade dupla e
// deliberada: o prompt instrui o LLM, o schema garante em runtime que ele obedeceu).
const leadScoreSchema = z.object({ score: z.number() });
const swotSchema = z.object({
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  opportunities: z.array(z.string()),
  threats: z.array(z.string()),
});
const qualificationsSchema = z.object({
  bant: z.object({
    budget: z.string(),
    authority: z.string(),
    need: z.string(),
    timeframe: z.string(),
  }),
  gpct: z.object({
    goals: z.string(),
    plans: z.string(),
    challenges: z.string(),
    timeline: z.string(),
  }),
});
const objectionsMatrixSchema = z.object({
  objections: z.array(
    z.object({
      objection: z.string(),
      psychology: z.string(),
      responseConsultative: z.string(),
      responseChallenger: z.string(),
      responseSpin: z.string(),
    }),
  ),
});

function describeLead(lead: IEnrichedLead): string {
  const parts = [
    `Empresa: ${lead.fantasyName || lead.socialReason}`,
    lead.cnaeMain && `CNAE principal: ${lead.cnaeMain}`,
    lead.size && `Porte: ${lead.size}`,
    lead.cadastralSituation && `Situação cadastral: ${lead.cadastralSituation}`,
    (lead.city || lead.state) &&
      `Localização: ${[lead.city, lead.state].filter(Boolean).join(', ')}`,
    lead.employeesCount && `Funcionários: ${lead.employeesCount}`,
    lead.estimatedRevenue && `Faturamento estimado: ${lead.estimatedRevenue}`,
    lead.technologies?.length &&
      `Tecnologias detectadas: ${lead.technologies.slice(0, 8).join(', ')}`,
    lead.description && `Descrição: ${lead.description}`,
  ].filter(Boolean);
  return parts.length > 0
    ? parts.join(' | ')
    : 'Sem dados de enriquecimento disponíveis para este lead.';
}

/** Chama o gateway pedindo uma resposta em JSON, valida contra `schema` e faz o parse com um
 * fallback seguro em caso de falha (rede fora do ar, JSON malformado, ou shape que não bate com
 * `schema` — ex.: LLM ignorou o formato pedido no prompt) — nunca deixa a UI comercial quebrar ou
 * receber dado sujo por causa da IA. */
async function askJson<T>(
  systemPrompt: string,
  userPrompt: string,
  agentContext: string,
  schema: z.ZodType<T>,
  fallback: T,
): Promise<T> {
  const model = getAiModel('local-llama3-fast', 0.3, agentContext);
  const startTime = Date.now();
  try {
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);
    await logAiUsage({
      model: response.response_metadata.model,
      usage: response.response_metadata.tokenUsage,
      latencyMs: Date.now() - startTime,
    });
    return schema.parse(cleanAndParseJson<unknown>(response.content));
  } catch {
    return fallback;
  }
}

export class CommercialAIService {
  /**
   * Avalia a aderência do Lead ao ICP, gera Score (0-1000)
   */
  async generateLeadScore(lead: IEnrichedLead): Promise<number> {
    const result = await askJson(
      'Você avalia o fit de leads B2B de logística/transporte de cargas para a Atlas (SaaS de gestão de risco/torre de controle operacional). Considere porte, situação cadastral, segmento (CNAE) e maturidade tecnológica. Responda SOMENTE com JSON válido, sem markdown, no formato exato: {"score": number de 0 a 1000}.',
      `Dados do lead:\n${describeLead(lead)}`,
      'commercial-ai:lead-score',
      leadScoreSchema,
      { score: 500 },
    );
    const score = typeof result.score === 'number' ? result.score : 500;
    return Math.max(0, Math.min(1000, Math.round(score)));
  }

  /**
   * Gera análise SWOT baseada nos dados enriquecidos
   */
  async generateSWOT(lead: IEnrichedLead): Promise<Record<string, string[]>> {
    return askJson(
      'Você monta uma análise SWOT curta e factual (baseada apenas nos dados fornecidos, sem inventar números ou fatos) de um lead B2B de logística, para a equipe comercial da Atlas usar antes de uma abordagem. Responda SOMENTE com JSON válido, sem markdown, no formato exato: {"strengths": string[], "weaknesses": string[], "opportunities": string[], "threats": string[]}, cada lista com 2 a 4 itens curtos (máx. 8 palavras cada).',
      `Dados do lead:\n${describeLead(lead)}`,
      'commercial-ai:swot',
      swotSchema,
      { strengths: [], weaknesses: [], opportunities: [], threats: [] },
    );
  }

  /**
   * Cria Matriz BANT, GPCT e outras estruturas de qualificação
   */
  async generateQualifications(lead: IEnrichedLead): Promise<Record<string, unknown>> {
    const fallback = {
      bant: {
        budget: 'Não identificado',
        authority: 'Não identificado',
        need: 'Não identificado',
        timeframe: 'Não identificado',
      },
      gpct: {
        goals: 'Não identificado',
        plans: 'Não identificado',
        challenges: 'Não identificado',
        timeline: 'Não identificado',
      },
    };
    return askJson(
      'Você preenche matrizes de qualificação de vendas B2B (BANT e GPCT) para um lead de logística, com base ESTRITAMENTE nos dados fornecidos. Quando um campo não puder ser inferido com segurança pelos dados, use exatamente "Não identificado" em vez de inventar. Responda SOMENTE com JSON válido, sem markdown, no formato exato: {"bant": {"budget": string, "authority": string, "need": string, "timeframe": string}, "gpct": {"goals": string, "plans": string, "challenges": string, "timeline": string}}.',
      `Dados do lead:\n${describeLead(lead)}`,
      'commercial-ai:qualification',
      qualificationsSchema,
      fallback,
    );
  }

  /**
   * Gera objeções prováveis com respostas em múltiplos frameworks
   */
  async generateObjectionsMatrix(lead: IEnrichedLead): Promise<Record<string, unknown>[]> {
    const result = await askJson(
      'Você monta uma matriz de objeções de vendas B2B para logística/gestão de risco operacional, com a objeção mais provável para ESTE lead, a psicologia por trás dela e 3 respostas (consultiva, desafiadora/challenger, SPIN). Responda SOMENTE com JSON válido, sem markdown, no formato exato: {"objections": [{"objection": string, "psychology": string, "responseConsultative": string, "responseChallenger": string, "responseSpin": string}]}, com 3 a 5 itens.',
      `Dados do lead:\n${describeLead(lead)}`,
      'commercial-ai:objections',
      objectionsMatrixSchema,
      { objections: [] },
    );
    return result.objections;
  }
}
