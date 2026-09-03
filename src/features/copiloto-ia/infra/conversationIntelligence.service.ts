/**
 * Extração de sinais de inteligência de conversa (Onda 5: objeções, concorrentes, buying signals)
 * a partir do texto bruto já transcrito — via chat completion (`getAiModel`, mesmo gateway/
 * orçamento/custo do resto da plataforma, `src/lib/ai/`), não é outro provedor novo. Diferente de
 * `MeetingSynthesisService` (resumo executivo, já existente em `chatbook`), este serviço é dono do
 * próprio módulo `copiloto-ia` — não precisa de porta de composição (`src/shared/contracts/`)
 * porque não cruza fronteira de feature, só usa infraestrutura compartilhada (`src/lib/`).
 *
 * Nunca fabrica um resultado de fallback em caso de erro (ao contrário de
 * `MeetingSynthesisService`) — deixa o erro subir, o chamador (worker de transcrição) já trata
 * qualquer falha marcando a conversa `FAILED` com o motivo real.
 */
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getAiModel, logAiUsage, cleanAndParseJson } from '../../../lib/ai/gateway.js';

export interface ObjectionSignal {
  text: string;
  /** Se ficou claro na conversa que a objeção foi endereçada/superada antes do fim. */
  resolved: boolean;
}

export interface CompetitorSignal {
  name: string;
  /** Trecho de contexto de por que o concorrente foi mencionado (comparação, já usa, avaliando). */
  context: string;
}

export interface BuyingSignalItem {
  text: string;
  strength: 'alta' | 'media' | 'baixa';
}

export interface ConversationIntelligenceOutput {
  objections: ObjectionSignal[];
  competitors: CompetitorSignal[];
  buyingSignals: BuyingSignalItem[];
}

const PROMPT_ID = 'copiloto-ia-conversation-intelligence';

const SYSTEM_PROMPT = `Você é um Analista de Inteligência de Vendas B2B. Leia a transcrição de uma
reunião comercial e extraia APENAS o que está explicitamente na conversa — nunca infira ou
invente algo que não foi dito.

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "objections": [{ "text": "Preço acima do orçamento aprovado", "resolved": false }],
  "competitors": [{ "name": "Concorrente X", "context": "Cliente já usa e está comparando preço" }],
  "buyingSignals": [{ "text": "Pediu prazo para assinatura ainda este mês", "strength": "alta" }]
}

Se não houver objeção/concorrente/buying signal identificável na transcrição, devolva a lista
vazia correspondente — nunca preencha com um item genérico só para não deixar vazio.`;

export async function extractConversationIntelligence(
  rawTranscript: string,
): Promise<ConversationIntelligenceOutput> {
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

  const parsed = cleanAndParseJson<Partial<ConversationIntelligenceOutput>>(response.content);
  return {
    objections: parsed.objections ?? [],
    competitors: parsed.competitors ?? [],
    buyingSignals: parsed.buyingSignals ?? [],
  };
}
