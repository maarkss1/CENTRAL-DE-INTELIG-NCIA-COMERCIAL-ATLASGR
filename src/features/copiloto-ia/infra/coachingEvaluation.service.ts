/**
 * "Sales Coaching e QA" (Onda 6, AGENT_11 do pacote): avalia UMA conversa contra a rubrica fixa do
 * pacote — 9 dimensões, cada uma 0-10 COM EVIDÊNCIA textual da própria transcrição (AGENT_11:
 * "evidências, não opiniões vagas"). Nunca pede nem usa característica sensível/protegida (nome,
 * gênero, sotaque, idade) — a rubrica é inteiramente sobre TÉCNICA de venda, o prompt não expõe
 * nenhum dado do vendedor além do texto da própria fala dele na conversa.
 *
 * `overallScore` NÃO é pedido à IA — é a média das 9 notas × 10, calculada aqui
 * (`computeOverallScore`), determinística sobre os números que a IA atribuiu por dimensão.
 */
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getAiModel, logAiUsage, cleanAndParseJson } from '../../../lib/ai/gateway.js';

export interface RubricDimension {
  score: number;
  evidence: string;
}

/** As 9 dimensões fixas do AGENT_11 do pacote — nunca configuráveis por esta onda (o pacote fala
 * em "rubricas configuráveis" como visão futura; aqui é a rubrica única e fixa). */
export interface CoachingRubricOutput {
  descoberta: RubricDimension;
  qualificacao: RubricDimension;
  escuta: RubricDimension;
  objecoes: RubricDimension;
  clareza: RubricDimension;
  produto: RubricDimension;
  proximoPasso: RubricDimension;
  aderenciaPlaybook: RubricDimension;
  qualidadeRegistro: RubricDimension;
}

export interface CoachingEvaluationResult {
  rubric: CoachingRubricOutput;
  overallScore: number;
}

const PROMPT_ID = 'copiloto-ia-coaching-evaluation';
const RUBRIC_DIMENSIONS = [
  'descoberta',
  'qualificacao',
  'escuta',
  'objecoes',
  'clareza',
  'produto',
  'proximoPasso',
  'aderenciaPlaybook',
  'qualidadeRegistro',
] as const;

const SYSTEM_PROMPT = `Você é um Coach de Vendas B2B experiente fazendo QA de uma reunião comercial.
Avalie a TÉCNICA do vendedor (nunca características pessoais, sotaque, forma de falar ou qualquer
traço protegido) em cada dimensão abaixo, de 0 a 10, SEMPRE com uma evidência curta (trecho ou
paráfrase direta da transcrição) que sustente a nota — nunca uma nota sem evidência.

Dimensões:
- descoberta: fez perguntas abertas reais sobre a dor/contexto do cliente?
- qualificacao: confirmou orçamento, autoridade de decisão, prazo?
- escuta: deixou o cliente falar, retomou pontos que o cliente trouxe?
- objecoes: tratou objeções com argumento real, não só contornou?
- clareza: explicou a proposta de valor de forma compreensível?
- produto: demonstrou domínio real do produto/serviço?
- proximoPasso: fechou um próximo passo concreto (data, ação, responsável)?
- aderenciaPlaybook: seguiu a estrutura esperada de uma reunião comercial (abertura, descoberta, proposta, próximos passos)?
- qualidadeRegistro: as informações relevantes ficaram claras o suficiente para registrar no CRM depois?

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "descoberta": { "score": 7, "evidence": "Perguntou sobre o volume mensal de fretes antes de propor algo" },
  "qualificacao": { "score": 4, "evidence": "Não perguntou quem mais decide a compra" },
  "escuta": { "score": 8, "evidence": "..." },
  "objecoes": { "score": 6, "evidence": "..." },
  "clareza": { "score": 7, "evidence": "..." },
  "produto": { "score": 8, "evidence": "..." },
  "proximoPasso": { "score": 9, "evidence": "Marcou nova reunião para sexta com data e horário definidos" },
  "aderenciaPlaybook": { "score": 6, "evidence": "..." },
  "qualidadeRegistro": { "score": 7, "evidence": "..." }
}

Se a transcrição não tiver conteúdo suficiente para avaliar uma dimensão específica, use score 5
(neutro, "não avaliável") e explique isso na evidência — nunca invente uma nota alta ou baixa sem
base real na conversa.`;

function clampScore(value: unknown): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 5;
  return Math.max(0, Math.min(10, Math.round(num)));
}

function computeOverallScore(rubric: CoachingRubricOutput): number {
  const total = RUBRIC_DIMENSIONS.reduce((sum, dimension) => sum + rubric[dimension].score, 0);
  return Math.round((total / RUBRIC_DIMENSIONS.length) * 10);
}

export async function evaluateConversationCoaching(
  rawTranscript: string,
): Promise<CoachingEvaluationResult> {
  const model = getAiModel('local-llama3-fast', 0.1, PROMPT_ID);
  const startTime = Date.now();

  const response = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(rawTranscript),
  ]);

  await logAiUsage({
    model: response.response_metadata.model,
    usage: response.response_metadata.tokenUsage,
    latencyMs: Date.now() - startTime,
    promptId: PROMPT_ID,
  });

  const parsed = cleanAndParseJson<
    Partial<Record<(typeof RUBRIC_DIMENSIONS)[number], Partial<RubricDimension>>>
  >(response.content);

  const rubric = RUBRIC_DIMENSIONS.reduce((acc, dimension) => {
    const raw = parsed[dimension];
    acc[dimension] = {
      score: clampScore(raw?.score),
      evidence:
        typeof raw?.evidence === 'string' && raw.evidence.trim()
          ? raw.evidence
          : 'Sem evidência retornada pelo modelo.',
    };
    return acc;
  }, {} as CoachingRubricOutput);

  return { rubric, overallScore: computeOverallScore(rubric) };
}
