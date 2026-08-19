import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';
import type { IntentClassificationResult, IntentClassifierPort } from '../domain/replyTracking.js';

/**
 * Implementação real do `IntentClassifierPort` (CYC-003, onda 26) para réplica de e-mail — mesma
 * extração de sinal (intenção/urgência/objeções/próximo passo) já feita para WhatsApp em
 * `conversation-intelligence.service.ts`, mas chamada a partir do transcript de e-mail que
 * `handleEmailReply` monta (`replyTracking.ts`). Não reaproveita aquele módulo porque ele é
 * amarrado a `WhatsAppMessage`/debounce de fila — aqui a leitura já chega pronta.
 */

const ALLOWED_INTENTS = new Set([
    'alta_intencao_compra',
    'duvida_tecnica',
    'objecao_preco',
    'objecao_outro',
    'sem_interesse',
    'neutro',
]);
const ALLOWED_URGENCY = new Set(['alta', 'media', 'baixa']);

const EXTRACTION_SYSTEM_PROMPT = `Você é um analista de conversas comerciais B2B (logística/gerenciamento de risco de carga, mercado brasileiro). Leia a troca de e-mails entre um vendedor da Atlas ("Atlas") e um lead ("Cliente") e extraia sinais REAIS — nunca invente algo que não está no texto. Responda SOMENTE com um JSON válido, sem markdown, no formato exato:
{"intent": "alta_intencao_compra"|"duvida_tecnica"|"objecao_preco"|"objecao_outro"|"sem_interesse"|"neutro", "urgency": "alta"|"media"|"baixa", "objections": string[], "budgetMentioned": boolean, "nextStep": string|null, "summary": string, "confidence": number}
"objections" só objeções REALMENTE ditas pelo cliente (frase curta, em português). "nextStep" é o próximo passo combinado (reunião, envio de proposta, retorno em data) ou null se nada foi combinado. "summary" tem 1-2 frases citando algo real da conversa — nunca genérico. "confidence" é de 0 a 1: sua confiança nesta leitura.`;

function parseModelOutput(raw: string): IntentClassificationResult {
    const parsed = cleanAndParseJson<Record<string, unknown>>(raw);
    return {
        intent: typeof parsed.intent === 'string' && ALLOWED_INTENTS.has(parsed.intent) ? parsed.intent : null,
        urgency: typeof parsed.urgency === 'string' && ALLOWED_URGENCY.has(parsed.urgency) ? parsed.urgency : null,
        objections: Array.isArray(parsed.objections)
            ? parsed.objections.filter((o: unknown): o is string => typeof o === 'string').slice(0, 10)
            : [],
        budgetMentioned: parsed.budgetMentioned === true,
        nextStep: typeof parsed.nextStep === 'string' && parsed.nextStep.trim() ? parsed.nextStep.trim() : null,
        summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : null,
        confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : null,
        raw: parsed,
    };
}

export const emailIntentClassifier: IntentClassifierPort = {
    async classify(transcript: string): Promise<IntentClassificationResult> {
        const model = getAiModel('local-llama3', 0.2, 'emailReplyIntelligence');
        const startTime = Date.now();
        const response = await model.invoke([
            new SystemMessage(EXTRACTION_SYSTEM_PROMPT),
            new HumanMessage(`Conversa:\n${transcript}`),
        ]);

        await logAiUsage({
            model: response.response_metadata.model,
            usage: response.response_metadata.tokenUsage,
            latencyMs: Date.now() - startTime,
        });

        try {
            return parseModelOutput(response.content);
        } catch (error) {
            logger.warn({ err: error }, 'Falha ao interpretar sinal de réplica de e-mail gerado pela IA');
            return {
                intent: null,
                urgency: null,
                objections: [],
                budgetMentioned: false,
                nextStep: null,
                summary: null,
                confidence: null,
                raw: { raw: response.content },
            };
        }
    },
};
