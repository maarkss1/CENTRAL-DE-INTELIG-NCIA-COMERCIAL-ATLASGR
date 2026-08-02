import { createHmac, timingSafeEqual } from 'crypto';
import { toE164BR } from '../../../lib/phone.js';

/**
 * Lógica pura da integração do SDR de voz: sem env, sem prisma, sem rede.
 *
 * Separado do webhook de propósito — a verificação de assinatura é a parte crítica de segurança e
 * precisa ser testável sem abrir pool de banco nem depender de variáveis de ambiente válidas.
 */

export interface TranscriptTurn {
    role: 'user' | 'assistant';
    content: string;
}

export interface CallEndedData {
    sessionId?: string;
    callSid?: string;
    direction?: string;
    to?: string | null;
    status?: string;
    outcome?: string;
    durationSeconds?: number;
    agentName?: string | null;
    transcript?: TranscriptTurn[];
    context?: Record<string, unknown>;
    /**
     * Sinal explícito de opt-out vindo do Hub. Hoje o Birth Voices Hub ainda não preenche este
     * campo — seu `outcome` é puramente telefônico (Concluído, Ocupado, Não atendida, Falha,
     * Cancelada), sem vocabulário para "o lead pediu para não ligar mais". O campo já é lido aqui
     * para que, quando o Hub passar a enviá-lo, ele tenha precedência sobre a heurística de
     * transcrição abaixo, sem precisar mexer neste lado.
     */
    optOut?: boolean;
}

/**
 * Frases com que uma pessoa recusa novas ligações. Sem acento e em minúsculas porque a comparação
 * roda sobre o texto já normalizado (ver `normalizeForMatch`).
 *
 * A lista é deliberadamente ampla: errar bloqueando alguém que não pediu custa uma oportunidade,
 * errar deixando passar custa ligar de novo para quem pediu explicitamente para não ser incomodado
 * — que é o dano que a LGPD e o bom senso comercial mandam evitar. Na dúvida, bloqueia.
 */
const OPT_OUT_PHRASES = [
    'nao me ligue',
    'nao me liguem',
    'nao liguem mais',
    'nao ligue mais',
    'nao ligar mais',
    'nao me liga mais',
    'para de ligar',
    'pare de ligar',
    'parem de ligar',
    'nao quero mais receber',
    'nao quero receber ligacao',
    'nao quero receber ligacoes',
    'me tire da lista',
    'me tira da lista',
    'me remova da lista',
    'me retire da lista',
    'tire meu numero',
    'tira meu numero',
    'remova meu numero',
    'excluir meu numero',
    'descadastrar',
    'nao entre mais em contato',
    'nao entrem mais em contato',
    'perdeu meu numero',
    'nunca mais me ligue',
    'nunca mais liguem',
];

/**
 * Tira acentos e pontuação para a comparação não depender de como o STT transcreveu.
 * "Não me ligue!" e "nao me ligue" precisam bater na mesma frase.
 */
function normalizeForMatch(text: string): string {
    return text
        .normalize('NFD')
        // Faixa dos sinais diacríticos combinantes, escapada: NFD separa "ã" em "a" + til, e este
        // replace descarta o til. Escrito como \u.... porque os caracteres literais são invisíveis
        // no editor e viram lixo em qualquer diff.
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export interface OptOutDetection {
    optOut: boolean;
    /** Como o opt-out foi identificado — vai para o campo `source` do bloqueio, para auditoria. */
    source: 'hub-flag' | 'transcript' | null;
    /** Trecho exato que motivou o bloqueio, para alguém conseguir revisar a decisão depois. */
    evidence: string | null;
}

/**
 * Decide se esta ligação terminou em pedido de opt-out.
 *
 * Só as falas do lead são examinadas: a IA pronuncia essas mesmas frases ao confirmar o pedido
 * ("entendi, não ligamos mais"), e considerar o turno dela faria toda ligação em que o assunto
 * aparece virar um bloqueio.
 */
export function detectOptOut(data: CallEndedData): OptOutDetection {
    if (data.optOut === true) {
        return { optOut: true, source: 'hub-flag', evidence: null };
    }

    for (const turn of data.transcript ?? []) {
        if (turn.role !== 'user') continue;
        const normalized = normalizeForMatch(turn.content ?? '');
        const matched = OPT_OUT_PHRASES.find((phrase) => normalized.includes(phrase));
        if (matched) {
            return { optOut: true, source: 'transcript', evidence: turn.content.trim().slice(0, 300) };
        }
    }

    return { optOut: false, source: null, evidence: null };
}

/**
 * Confere a assinatura HMAC sobre os bytes crus recebidos.
 *
 * Precisa ser o corpo bruto: `JSON.parse` seguido de `JSON.stringify` pode reordenar chaves e
 * produzir uma string diferente da que foi assinada, e aí nenhuma assinatura legítima confere.
 */
export function isValidSignature(rawBody: Buffer, receivedSignature: string | undefined, secret: string): boolean {
    if (!receivedSignature) return false;

    const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'), 'utf8');
    const received = Buffer.from(receivedSignature, 'utf8');

    // timingSafeEqual lança quando os tamanhos diferem, então o comprimento é comparado antes.
    return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Marcador que torna o registro idempotente — o Hub reentrega o evento até receber um 2xx. */
export function callMarker(callSid: string): string {
    return `[call:${callSid}]`;
}

export function buildObservations(data: CallEndedData): string {
    const outcome = data.outcome || data.status || 'Resultado desconhecido';
    const duration = typeof data.durationSeconds === 'number' ? `${data.durationSeconds}s` : 'duração desconhecida';
    const header = `Ligação do SDR de voz (${data.agentName || 'agente'}) — ${outcome}, ${duration}.`;

    const transcript = (data.transcript ?? [])
        .map((turn) => `${turn.role === 'assistant' ? 'IA' : 'Lead'}: ${turn.content}`)
        .join('\n');

    // O marcador vai no fim para não poluir o começo do texto que o SDR lê na tela.
    return [header, transcript, callMarker(data.callSid || 'sem-id')].filter(Boolean).join('\n\n');
}

interface LeadContactish {
    name?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
}
interface LeadCompanyish {
    tradeName?: string | null;
    legalName?: string | null;
    phones?: string[] | null;
}

/**
 * Escolhe para qual número ligar. A ordem reflete quem atende: o telefone do contato mapeado é o
 * do decisor; o da empresa cai na recepção e raramente chega em quem decide.
 */
export function pickCallablePhone(
    contact: LeadContactish | null | undefined,
    company: LeadCompanyish | null | undefined,
): string | null {
    const candidates = [contact?.phone, contact?.whatsapp, ...(company?.phones ?? [])];
    for (const candidate of candidates) {
        const normalized = toE164BR(candidate);
        if (normalized) return normalized;
    }
    return null;
}
