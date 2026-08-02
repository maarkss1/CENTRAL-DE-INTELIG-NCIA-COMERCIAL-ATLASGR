import { env } from '../../../config/env.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { pickCallablePhone } from './birthVoice.helpers.js';
import { isSuppressed } from './callSuppression.service.js';

/** Caminho do webhook que o Birth Voices Hub chama com o resultado da ligação. */
export const CALL_RESULT_WEBHOOK_PATH = '/api/integrations/birth-voice/webhook';

const REQUEST_TIMEOUT_MS = 10_000;

export class BirthVoiceNotConfiguredError extends Error {}
export class NoPhoneNumberError extends Error {}
/** O número está na lista interna de bloqueio (opt-out). Não é falha: é a regra funcionando. */
export class SuppressedNumberError extends Error {}

export interface OutboundCallResult {
    sessionId: string;
    callSid: string;
    status: string;
}

function requireConfig() {
    const missing = [
        !env.BIRTH_VOICES_URL && 'BIRTH_VOICES_URL',
        !env.BIRTH_VOICES_API_KEY && 'BIRTH_VOICES_API_KEY',
        !env.BIRTH_VOICES_AGENT_ID && 'BIRTH_VOICES_AGENT_ID',
        !env.PUBLIC_BASE_URL && 'PUBLIC_BASE_URL',
    ].filter(Boolean);

    if (missing.length > 0) {
        throw new BirthVoiceNotConfiguredError(
            `SDR de voz não configurado. Variáveis ausentes: ${missing.join(', ')}.`,
        );
    }

    return {
        baseUrl: env.BIRTH_VOICES_URL!.replace(/\/$/, ''),
        apiKey: env.BIRTH_VOICES_API_KEY!,
        agentId: env.BIRTH_VOICES_AGENT_ID!,
        callbackUrl: `${env.PUBLIC_BASE_URL!.replace(/\/$/, '')}${CALL_RESULT_WEBHOOK_PATH}`,
    };
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
 * Pede ao Birth Voices Hub que ligue para o decisor deste lead.
 *
 * Retorna assim que a ligação é aceita — o resultado (atendeu, transcrição, duração) chega depois,
 * de forma assíncrona, no webhook em CALL_RESULT_WEBHOOK_PATH.
 */
export async function callLead(organizationId: string, leadId: string): Promise<OutboundCallResult> {
    const config = requireConfig();

    const lead = await prisma.lead.findFirst({
        where: { id: leadId, organizationId },
        include: { contact: true, company: true },
    });
    if (!lead) throw new Error('Lead não encontrado.');

    const targetNumber = pickCallablePhone(
        lead.contact as LeadContactish | null,
        lead.company as LeadCompanyish | null,
    );
    if (!targetNumber) {
        throw new NoPhoneNumberError('Lead sem telefone em formato discável.');
    }

    // Checado aqui, e não só na tela, porque este é o último ponto por onde toda ligação passa:
    // rota manual, automação e (futuramente) o worker de prospecção fria. Um opt-out que só fosse
    // respeitado pela UI seria contornado pela primeira campanha automática.
    if (await isSuppressed(organizationId, targetNumber)) {
        throw new SuppressedNumberError(
            'Número na lista interna de bloqueio (opt-out): a ligação não foi disparada.',
        );
    }

    const company = lead.company as LeadCompanyish | null;
    const response = await fetch(`${config.baseUrl}/api/voice/outbound`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            agentId: config.agentId,
            targetNumber,
            callbackUrl: config.callbackUrl,
            // Devolvido intacto no webhook: é assim que reencontramos o lead sem depender de
            // casar número de telefone, que muda e se repete entre empresas.
            context: {
                leadId: lead.id,
                organizationId,
                name: (lead.contact as LeadContactish | null)?.name ?? null,
                company: company?.tradeName ?? company?.legalName ?? null,
            },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Birth Voices Hub recusou a chamada (HTTP ${response.status}): ${detail.slice(0, 200)}`);
    }

    const result = (await response.json()) as OutboundCallResult;
    logger.info({ leadId, sessionId: result.sessionId, callSid: result.callSid }, 'Ligação de SDR enfileirada');
    return result;
}
