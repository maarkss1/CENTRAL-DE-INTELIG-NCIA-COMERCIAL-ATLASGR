import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { Prisma } from '@prisma/client';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';

// Mensagens antigas demais (fora da janela) não entram no prompt — o objetivo é ler a conversa
// recente, não reprocessar o histórico inteiro a cada nova mensagem.
const MAX_MESSAGES_IN_WINDOW = 40;

const ALLOWED_INTENTS = new Set([
    'alta_intencao_compra',
    'duvida_tecnica',
    'objecao_preco',
    'objecao_outro',
    'sem_interesse',
    'neutro',
]);
const ALLOWED_URGENCY = new Set(['alta', 'media', 'baixa']);

const EXTRACTION_SYSTEM_PROMPT = `Você é um analista de conversas comerciais B2B (logística/gerenciamento de risco de carga, mercado brasileiro). Leia a conversa de WhatsApp entre um vendedor da Atlas ("Atlas") e um lead ("Cliente") e extraia sinais REAIS — nunca invente algo que não está no texto. Responda SOMENTE com um JSON válido, sem markdown, no formato exato:
{"intent": "alta_intencao_compra"|"duvida_tecnica"|"objecao_preco"|"objecao_outro"|"sem_interesse"|"neutro", "urgency": "alta"|"media"|"baixa", "objections": string[], "budgetMentioned": boolean, "nextStep": string|null, "summary": string, "confidence": number}
"objections" só objeções REALMENTE ditas pelo cliente (frase curta, em português). "nextStep" é o próximo passo combinado (reunião, envio de proposta, retorno em data) ou null se nada foi combinado. "summary" tem 1-2 frases citando algo real da conversa — nunca genérico. "confidence" é de 0 a 1: sua confiança nesta leitura.`;

interface ConversationSignalResult {
    intent: string | null;
    urgency: string | null;
    objections: string[];
    budgetMentioned: boolean;
    nextStep: string | null;
    summary: string | null;
    confidence: number | null;
}

function buildTranscript(messages: Array<{ direction: string; body: string | null }>): string {
    return messages
        .filter((m) => m.body && m.body.trim())
        .map((m) => `${m.direction === 'inbound' ? 'Cliente' : 'Atlas'}: ${m.body!.trim()}`)
        .join('\n');
}

function parseModelOutput(raw: string): ConversationSignalResult {
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
    };
}

/**
 * Lê as últimas mensagens de WhatsApp já persistidas deste lead e extrai sinais de intenção
 * comercial via LLM (intenção, urgência, objeções, próximo passo combinado). Nunca é chamado no
 * caminho de recebimento da mensagem — só pelo worker (ver whatsappSignal.worker.ts), sempre com
 * um atraso (debounce) para ler a troca completa em vez de mensagem por mensagem.
 */
export async function analyzeConversation(leadId: string, organizationId: string): Promise<void> {
    const messages = await prisma.whatsAppMessage.findMany({
        where: { organizationId, leadId },
        orderBy: { receivedAt: 'desc' },
        take: MAX_MESSAGES_IN_WINDOW,
        select: { direction: true, body: true },
    });
    if (messages.length === 0) return;

    const ordered = messages.reverse();
    const transcript = buildTranscript(ordered);
    if (!transcript.trim()) return;

    const model = getAiModel('local-llama3', 0.2, 'conversationIntelligence');
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

    let result: ConversationSignalResult;
    let rawModelOutput: Prisma.InputJsonValue;
    try {
        result = parseModelOutput(response.content);
        rawModelOutput = cleanAndParseJson<Prisma.InputJsonValue>(response.content);
    } catch (error) {
        logger.warn({ err: error, leadId }, 'Falha ao interpretar sinal de conversa gerado pela IA');
        result = {
            intent: null,
            urgency: null,
            objections: [],
            budgetMentioned: false,
            nextStep: null,
            summary: null,
            confidence: null,
        };
        rawModelOutput = { raw: response.content };
    }

    await prisma.conversationSignal.create({
        data: {
            organizationId,
            leadId,
            messageCount: ordered.length,
            intent: result.intent,
            urgency: result.urgency,
            objections: result.objections,
            budgetMentioned: result.budgetMentioned,
            nextStep: result.nextStep,
            summary: result.summary,
            confidence: result.confidence,
            rawModelOutput,
        },
    });

    if (result.summary) {
        await prisma.timelineEvent.create({
            data: {
                type: 'whatsapp',
                description: `Sinal de conversa (IA): ${result.summary}`,
                leadId,
            },
        }).catch((error) => {
            // O sinal já foi salvo — a falha aqui não pode apagar essa leitura.
            logger.error({ err: error, leadId }, 'Falha ao registrar sinal de conversa no timeline do lead.');
        });
    }
}
