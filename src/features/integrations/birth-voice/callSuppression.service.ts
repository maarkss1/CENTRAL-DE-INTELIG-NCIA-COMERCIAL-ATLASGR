import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { toE164BR } from '../../../lib/phone.js';

/**
 * Lista interna de bloqueio de discagem.
 *
 * Um pedido de opt-out só vale se a próxima execução da campanha o respeitar. Antes desta camada o
 * pedido ficava apenas como texto na observação da atividade — legível por um humano, invisível
 * para o discador, que ligava de novo no dia seguinte.
 *
 * Todo número entra e sai daqui normalizado em E.164, porque é o único jeito de o mesmo telefone
 * cadastrado como "(11) 99999-8888" e como "011999998888" cair no mesmo bloqueio.
 */

export type SuppressionSource = 'call-opt-out' | 'manual' | 'import';

export interface RecordOptOutInput {
    organizationId: string;
    /** Aceita nulo para o chamador não precisar decidir sozinho: `recordOptOut` já recusa e loga. */
    phone: string | null | undefined;
    source: SuppressionSource;
    reason?: string | null;
    leadId?: string | null;
}

/**
 * Um número que não normaliza para E.164 não é discável, então também não é bloqueável — não há o
 * que gravar nem o que comparar. Quem chama trata isso como "não há bloqueio" com segurança porque
 * `callLead` já recusa, antes disso, qualquer lead sem número discável.
 */
export function normalizeSuppressionKey(phone: string | null | undefined): string | null {
    return toE164BR(phone);
}

/** Diz se este número está bloqueado para discagem nesta organização. */
export async function isSuppressed(organizationId: string, phone: string | null | undefined): Promise<boolean> {
    const phoneE164 = normalizeSuppressionKey(phone);
    if (!phoneE164) return false;

    const hit = await prisma.callSuppression.findUnique({
        where: { organizationId_phoneE164: { organizationId, phoneE164 } },
        select: { id: true },
    });
    return hit !== null;
}

/**
 * Registra o bloqueio. Idempotente de propósito: o webhook do Birth Voices Hub reentrega o mesmo
 * evento até receber 2xx, e a segunda entrega não pode virar erro nem apagar a evidência da
 * primeira — por isso `create` com `onConflict` silencioso via upsert que só insere.
 *
 * Devolve `false` quando o telefone não é discável (nada foi gravado), para o chamador saber que o
 * pedido de opt-out não pôde ser materializado e registrar isso no log em vez de assumir sucesso.
 */
export async function recordOptOut(input: RecordOptOutInput): Promise<boolean> {
    const phoneE164 = normalizeSuppressionKey(input.phone);
    if (!phoneE164) {
        logger.warn(
            { organizationId: input.organizationId, leadId: input.leadId },
            'Pedido de opt-out recebido para um telefone não normalizável — nada foi bloqueado.',
        );
        return false;
    }

    await prisma.callSuppression.upsert({
        where: { organizationId_phoneE164: { organizationId: input.organizationId, phoneE164 } },
        // Reentrega do mesmo evento não sobrescreve o motivo original: o primeiro registro é o que
        // tem a evidência mais próxima do pedido real.
        update: {},
        create: {
            organizationId: input.organizationId,
            phoneE164,
            source: input.source,
            reason: input.reason ?? null,
            leadId: input.leadId ?? null,
        },
    });

    logger.info(
        { organizationId: input.organizationId, leadId: input.leadId, source: input.source },
        'Número adicionado à lista de bloqueio de discagem (opt-out).',
    );
    return true;
}

export interface SuppressionEntry {
    id: string;
    phoneE164: string;
    source: string;
    reason: string | null;
    leadId: string | null;
    createdAt: Date;
}

/** Lista os bloqueios da organização, do mais recente para o mais antigo. */
export async function listSuppressions(organizationId: string, limit = 200): Promise<SuppressionEntry[]> {
    return prisma.callSuppression.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 500),
        select: { id: true, phoneE164: true, source: true, reason: true, leadId: true, createdAt: true },
    });
}
