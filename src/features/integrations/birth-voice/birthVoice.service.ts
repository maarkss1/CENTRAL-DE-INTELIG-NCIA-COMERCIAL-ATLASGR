import { env } from '../../../config/env.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { pickCallablePhone } from './birthVoice.helpers.js';
import { isSuppressed } from './callSuppression.service.js';
import { buildVoicePromptForLead } from './atlasProductPlaybook.js';

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
    email?: string | null;
}
interface LeadCompanyish {
    tradeName?: string | null;
    legalName?: string | null;
    phones?: string[] | null;
}

import { z } from 'zod';

const birthVoiceResponseSchema = z.object({
    call_id: z.string().optional(),
    sessionId: z.string().optional(),
    callSid: z.string().optional(),
    status: z.string().optional()
}).catchall(z.unknown());

/**
 * Pede ao Birth Voices Hub que ligue para o decisor deste lead.
 *
 * Retorna assim que a ligação é aceita — o resultado (atendeu, transcrição, duração) chega depois,
 * de forma assíncrona, no webhook em CALL_RESULT_WEBHOOK_PATH.
 */
export type VoiceAgentType = 'sdr' | 'nps' | 'reactivation';

export async function callLead(organizationId: string, leadId: string, agentType: VoiceAgentType = 'sdr'): Promise<OutboundCallResult> {
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
    //
    // leadId/email do próprio lead entram como contexto para o opt-out unificado entre canais
    // (`isSuppressed` também consulta `OptOutRecord`, não só `CallSuppression`) — sem isso, um
    // opt-out registrado só por e-mail (05) ou WhatsApp (06), sem o mesmo telefone em comum, não
    // seria encontrado aqui.
    if (
        await isSuppressed(organizationId, targetNumber, {
            leadId: lead.id,
            email: (lead.contact as LeadContactish | null)?.email ?? null,
        })
    ) {
        throw new SuppressedNumberError(
            'Número na lista interna de bloqueio (opt-out): a ligação não foi disparada.',
        );
    }

    const company = lead.company as LeadCompanyish | null;
    const companyName = company?.tradeName ?? company?.legalName ?? null;
    const contactName = (lead.contact as LeadContactish | null)?.name ?? null;

    const isBland = config.baseUrl.includes('bland.ai') || process.env.BLAND_API_KEY;
    const endpoint = isBland ? 'https://api.bland.ai/v1/calls' : `${config.baseUrl}/api/voice/outbound`;
    const apiKeyHeader = isBland ? (process.env.BLAND_API_KEY || config.apiKey) : `Bearer ${config.apiKey}`;
    
    const requestBody = isBland ? {
        phone_number: targetNumber,
        task: buildVoicePromptForLead(companyName, contactName),
        language: 'pt-BR',
        voice: 'nat',
        wait_for_greeting: true,
        record: true,
        max_duration: 15,
        request_data: {
            leadId: lead.id,
            organizationId,
            contact_name: contactName,
            company: companyName,
            agent_name: 'Gessica'
        }
    } : {
        agentId: config.agentId,
        targetNumber,
        callbackUrl: config.callbackUrl,
        agentType,
        interruption_threshold: 100,
        reduce_latency: true,
        voice: 'nat',
        task: buildVoicePromptForLead(companyName, contactName),
        context: {
            leadId: lead.id,
            organizationId,
            name: contactName,
            company: companyName,
        },
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: apiKeyHeader,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Provedor de Voz recusou a chamada (HTTP ${response.status}): ${detail.slice(0, 200)}`);
    }

    const rawData = await response.json();
    const parsed = birthVoiceResponseSchema.safeParse(rawData);
    if (!parsed.success) {
        logger.error({ leadId, error: parsed.error, rawData }, 'Resposta inesperada do provedor de Voz');
        throw new Error('Provedor de Voz retornou payload inválido');
    }
    
    const data = parsed.data;
    const result: OutboundCallResult = {
        sessionId: data.call_id || data.sessionId || `sess-${lead.id}`,
        callSid: data.call_id || data.callSid || `CA_${lead.id}`,
        status: data.status || 'queued',
    };

    logger.info({ leadId, sessionId: result.sessionId, callSid: result.callSid }, 'Ligação de SDR enfileirada com sucesso');
    return result;
}
