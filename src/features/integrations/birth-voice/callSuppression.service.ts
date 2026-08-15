import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { toE164BR } from '../../../lib/phone.js';
import { isOptedOut, recordOptOut as recordUnifiedOptOut } from '../../cadence/application/optOutService.js';
import { prismaOptOutRepository } from '../../cadence/infra/PrismaOptOutRepository.js';

/**
 * Lista interna de bloqueio de discagem.
 *
 * Um pedido de opt-out só vale se a próxima execução da campanha o respeitar. Antes desta camada o
 * pedido ficava apenas como texto na observação da atividade — legível por um humano, invisível
 * para o discador, que ligava de novo no dia seguinte.
 *
 * Todo número entra e sai daqui normalizado em E.164, porque é o único jeito de o mesmo telefone
 * cadastrado como "(11) 99999-8888" e como "011999998888" cair no mesmo bloqueio.
 *
 * Desde a Onda 7 (`.agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md`), `CallSuppression`
 * convive com o registro unificado de opt-out (`OptOutRecord`, agente 17), sem substituí-lo:
 * - `isSuppressed` consulta as DUAS fontes antes de deixar discar — um opt-out feito por e-mail ou
 *   WhatsApp (`scope: 'global'` ou `'voice'`) agora também bloqueia a ligação, o que antes era
 *   impossível porque `CallSuppression` só conhecia a si mesma.
 * - `recordOptOut` continua gravando em `CallSuppression` (fonte de verdade de voz, inalterada) e
 *   também grava em `OptOutRecord` (`scope: 'voice'`, melhor esforço) para que WhatsApp/e-mail
 *   enxerguem o bloqueio.
 * Decisão registrada (proposta original do 17, "Para o 12 especificamente", passo 2 de 3): manter
 * as duas escritas por enquanto. Migrar a leitura de voz para depender só de `OptOutRecord` é o
 * passo 3, e exige antes confirmar 100% de cobertura — fora do escopo desta tarefa pontual.
 */

export type SuppressionSource = 'call-opt-out' | 'manual' | 'import';

export interface RecordOptOutInput {
    organizationId: string;
    /** Aceita nulo para o chamador não precisar decidir sozinho: `recordOptOut` já recusa e loga. */
    phone: string | null | undefined;
    source: SuppressionSource;
    reason?: string | null;
    leadId?: string | null;
    /** Trecho real do pedido (transcrição/mensagem), quando disponível — nunca inferência, mesma disciplina do registro unificado. */
    evidence?: string | null;
}

/**
 * Um número que não normaliza para E.164 não é discável, então também não é bloqueável — não há o
 * que gravar nem o que comparar. Quem chama trata isso como "não há bloqueio" com segurança porque
 * `callLead` já recusa, antes disso, qualquer lead sem número discável.
 */
export function normalizeSuppressionKey(phone: string | null | undefined): string | null {
    return toE164BR(phone);
}

/**
 * Contexto adicional para fortalecer o casamento do opt-out unificado entre canais. `leadId` é o
 * casamento mais forte (ver `17-para-05-06-12-contrato-optout.md`) — sem ele, um opt-out registrado
 * só por e-mail (sem o mesmo telefone em comum) não seria encontrado por aqui.
 */
export interface SuppressionCheckContext {
    leadId?: string | null;
    email?: string | null;
}

/**
 * Diz se este número/lead está bloqueado para discagem nesta organização.
 *
 * Combina duas fontes (ver nota no topo do arquivo): `CallSuppression` (histórica, só voz) e
 * `OptOutRecord` (unificada entre canais, `scope: 'global'` ou `'voice'`). Sem nenhum identificador
 * (nem telefone normalizável, nem `leadId`/`email` no contexto) não há o que consultar em nenhuma
 * das duas — devolve `false` sem bater no banco.
 */
export async function isSuppressed(
    organizationId: string,
    phone: string | null | undefined,
    context: SuppressionCheckContext = {},
): Promise<boolean> {
    const phoneE164 = normalizeSuppressionKey(phone);
    const leadId = context.leadId ?? null;
    const email = context.email ?? null;

    if (!phoneE164 && !leadId && !email) return false;

    const [suppressionHit, optedOut] = await Promise.all([
        phoneE164
            ? prisma.callSuppression.findUnique({
                  where: { organizationId_phoneE164: { organizationId, phoneE164 } },
                  select: { id: true },
              })
            : Promise.resolve(null),
        isOptedOut(prismaOptOutRepository, organizationId, { leadId, email, phoneE164 }, 'voice'),
    ]);

    return suppressionHit !== null || optedOut;
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

    // Grava também no registro unificado (`OptOutRecord`, `scope: 'voice'`) para que WhatsApp/e-mail
    // (06/05) também enxerguem este bloqueio — ver `17-para-05-06-12-contrato-optout.md`. Melhor
    // esforço de propósito: `CallSuppression` acima já é a fonte de verdade de voz e não pode deixar
    // de valer porque a escrita unificada falhou (ex.: banco momentaneamente indisponível).
    try {
        await recordUnifiedOptOut(prismaOptOutRepository, {
            organizationId: input.organizationId,
            scope: 'voice',
            subject: { leadId: input.leadId ?? null, phoneE164 },
            originChannel: 'voice',
            reason: input.reason ?? null,
            evidence: input.evidence ?? null,
            requestedBy: null,
        });
    } catch (error) {
        logger.error(
            { err: error, organizationId: input.organizationId },
            'Falha ao gravar opt-out unificado (OptOutRecord) — a lista de bloqueio de voz (CallSuppression) já foi gravada e continua valendo.',
        );
    }

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
