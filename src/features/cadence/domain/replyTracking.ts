/**
 * Entrega 3 — reply tracking de e-mail no classificador de intenção
 * (`.agents/prompts/17-cadencia-ciclo-receita.md`).
 *
 * O classificador de intenção já existe para WhatsApp
 * (`src/features/integrations/whatsapp/conversation-intelligence.service.ts` →
 * `ConversationSignal`, domínio do Agente 06 nesta onda). Este módulo NÃO duplica aquele
 * classificador — expõe só a parte que é minha: (1) decidir se um e-mail recebido é uma resposta
 * genuína do lead (e não um bounce/auto-reply/out-of-office, que não deveria encerrar a cadência
 * nem virar sinal), e (2) o formato do sinal que deve ser gravado, reaproveitando exatamente o
 * mesmo formato de `ConversationSignal` (campos `intent`/`urgency`/`objections`/`nextStep`/
 * `summary`/`confidence`), só com `channel: 'email'` em vez de implícito 'whatsapp'.
 *
 * A ligação real (IMAP/webhook de recebimento de e-mail, e a chamada ao modelo) depende de
 * `EmailMessage` (schema proposto ao 01) e do transporte de e-mail (domínio do 05) — por isso
 * este módulo é a porta (`ConversationSignalPort`, `IntentClassifierPort`) e a lógica pura em
 * volta dela, testável sem nenhuma das duas dependências existirem ainda.
 */

export interface InboundEmailReply {
    organizationId: string;
    leadId: string;
    providerMessageId: string;
    inReplyTo: string | null;
    fromEmail: string;
    subject: string | null;
    body: string;
    /** Cabeçalhos relevantes para detecção de auto-resposta — nunca a mensagem inteira. */
    autoSubmittedHeader?: string | null;
    receivedAt: Date;
}

const AUTO_REPLY_SUBJECT_PATTERNS = [
    /^auto(?:matic)?[\s-]?reply/i,
    /^out of office/i,
    /^resposta autom[aá]tica/i,
    /^ausente/i,
    /^undeliverable/i,
    /^mail delivery (failed|subsystem)/i,
    /^delivery status notification/i,
];

/**
 * Um e-mail recebido conta como resposta genuína do lead quando: tem corpo não vazio, não carrega
 * o cabeçalho `Auto-Submitted` (RFC 3834, usado por autoresponders e bounces) e o assunto não bate
 * com os padrões comuns de aviso automático. Falso negativo (tratar uma resposta real como
 * auto-reply) é pior que falso positivo aqui — a cadência continuaria rodando sobre um lead que já
 * respondeu — mas os padrões acima são específicos o bastante para não capturar respostas reais.
 */
export function isGenuineLeadReply(email: InboundEmailReply): boolean {
    if (!email.body || !email.body.trim()) return false;
    if (email.autoSubmittedHeader && email.autoSubmittedHeader.toLowerCase() !== 'no') return false;
    if (email.subject && AUTO_REPLY_SUBJECT_PATTERNS.some((pattern) => pattern.test(email.subject!.trim()))) return false;
    return true;
}

/** Mesmo formato de saída do classificador de WhatsApp (`ConversationSignalResult`) — não um paralelo novo. */
export interface ConversationSignalDraft {
    organizationId: string;
    leadId: string;
    channel: 'email' | 'whatsapp';
    messageCount: number;
    intent: string | null;
    urgency: string | null;
    objections: string[];
    budgetMentioned: boolean;
    nextStep: string | null;
    summary: string | null;
    confidence: number | null;
    rawModelOutput: unknown;
}

/** O que o classificador de intenção devolve — mesmo shape usado hoje para WhatsApp, reaproveitado aqui. */
export interface IntentClassificationResult {
    intent: string | null;
    urgency: string | null;
    objections: string[];
    budgetMentioned: boolean;
    nextStep: string | null;
    summary: string | null;
    confidence: number | null;
    raw: unknown;
}

/** Porta para o classificador real (LLM) — implementação real é a mesma já usada para WhatsApp, adaptada para transcrição de e-mail. */
export interface IntentClassifierPort {
    classify(transcript: string): Promise<IntentClassificationResult>;
}

/** Porta de persistência do sinal — grava em `ConversationSignal` (schema já existe; só falta a coluna `channel`, ver handoff ao 01). */
export interface ConversationSignalPort {
    record(draft: ConversationSignalDraft): Promise<void>;
}

/** Monta o transcript de e-mail no mesmo espírito de `buildTranscript` do canal WhatsApp: só o essencial, identificando quem fala. */
export function buildEmailTranscript(messages: Array<{ direction: 'inbound' | 'outbound'; body: string | null }>): string {
    return messages
        .filter((m) => m.body && m.body.trim())
        .map((m) => `${m.direction === 'inbound' ? 'Cliente' : 'Atlas'}: ${m.body!.trim()}`)
        .join('\n');
}

export interface HandleEmailReplyResult {
    /** `true` quando a cadência deste lead deve ser encerrada (requisito duro da entrega 2). */
    shouldStopCadence: boolean;
    /** `null` quando o e-mail foi descartado por parecer auto-resposta/bounce — não gera sinal nem estatística. */
    signalDraft: ConversationSignalDraft | null;
}

/**
 * Fluxo completo de uma resposta de e-mail recebida: filtra auto-reply/bounce, classifica (via
 * `IntentClassifierPort`, já implementado hoje para WhatsApp) e devolve o rascunho do sinal no
 * mesmo formato de `ConversationSignal`, mais a decisão de parar a cadência.
 *
 * Auto-reply/bounce nunca encerra a cadência — não é uma resposta do lead, é ruído de transporte.
 */
export async function handleEmailReply(
    email: InboundEmailReply,
    priorMessages: Array<{ direction: 'inbound' | 'outbound'; body: string | null }>,
    classifier: IntentClassifierPort,
): Promise<HandleEmailReplyResult> {
    if (!isGenuineLeadReply(email)) {
        return { shouldStopCadence: false, signalDraft: null };
    }

    const transcript = buildEmailTranscript([...priorMessages, { direction: 'inbound', body: email.body }]);
    const classification = await classifier.classify(transcript);

    const signalDraft: ConversationSignalDraft = {
        organizationId: email.organizationId,
        leadId: email.leadId,
        channel: 'email',
        messageCount: priorMessages.length + 1,
        intent: classification.intent,
        urgency: classification.urgency,
        objections: classification.objections,
        budgetMentioned: classification.budgetMentioned,
        nextStep: classification.nextStep,
        summary: classification.summary,
        confidence: classification.confidence,
        rawModelOutput: classification.raw,
    };

    // Resposta genuína do lead encerra a cadência (entrega 2), independentemente do que o
    // classificador de intenção concluiu — mesmo uma resposta "sem interesse"/"neutro" é uma
    // resposta humana real, e a máquina de estados já trata isso como razão de parada distinta de
    // opt-out (`lead-reply`), não como sinal para decidir se continua ou não.
    return { shouldStopCadence: true, signalDraft };
}
