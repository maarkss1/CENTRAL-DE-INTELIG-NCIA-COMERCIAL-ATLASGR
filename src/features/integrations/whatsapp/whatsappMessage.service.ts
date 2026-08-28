import type { WAMessage } from '@whiskeysockets/baileys';
import { prisma, withRlsContext } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { toE164BR } from '../../../lib/phone.js';
import { scheduleConversationAnalysis } from '../../../lib/queue/whatsappSignal.worker.js';
import { recordOptOut } from '../../cadence/application/optOutService.js';
import { prismaOptOutRepository } from '../../cadence/infra/PrismaOptOutRepository.js';

/** Grupos (`@g.us`) e o próprio status (`status@broadcast`) não correspondem a um contato do CRM. */
function isIndividualChat(remoteJid: string | null | undefined): boolean {
    return !!remoteJid && remoteJid.endsWith('@s.whatsapp.net');
}

/** Extrai o texto de uma mensagem do Baileys, quando ela for de texto simples. */
export function extractMessageText(message: WAMessage): string | null {
    const content = message.message;
    if (!content) return null;
    return content.conversation
        || content.extendedTextMessage?.text
        || content.imageMessage?.caption
        || content.videoMessage?.caption
        || null;
}

/**
 * Encontra o Contact deste tenant cujo telefone/whatsapp cadastrado bate com o número informado.
 *
 * Compara pelos últimos 9 dígitos em vez de exigir formato idêntico: o cadastro do Contact aceita
 * texto livre (com/sem "+55", com/sem o 9 inicial de celular), então uma igualdade exata deixaria
 * de casar contatos reais por uma diferença só de formatação.
 *
 * `$queryRaw` não passa pela extensão `$allOperations` de `src/lib/prisma.ts` (RLS/tenant
 * scoping) — roda via `withRlsContext` (seta `app.current_tenant_id` na transação; sem isso a
 * policy de RLS de "Contact" devolve zero linhas sempre, mesmo com o WHERE certo) e mantém o
 * filtro explícito de `organizationId` como defesa em profundidade, igual ao padrão já usado em
 * `src/features/knowledge/search.service.ts`.
 */
async function findContactByPhone(organizationId: string, phoneE164: string) {
    const digits = phoneE164.replace(/\D/g, '');
    const significant = digits.slice(-9);
    if (significant.length < 8) return null;

    // `email` incluído aqui (além de `id`) para o registro de opt-out unificado abaixo poder casar
    // por e-mail também — ver contrato em .agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md
    // ("passem email e phoneE164 sempre que o canal já os tiver carregados").
    const [found] = await withRlsContext((tx) => tx.$queryRaw<{ id: string; email: string | null }[]>`
        SELECT id, email FROM "Contact"
        WHERE "organizationId" = ${organizationId}
          AND (
            regexp_replace(COALESCE(phone, ''), '\D', '', 'g') LIKE ${'%' + significant}
            OR regexp_replace(COALESCE(whatsapp, ''), '\D', '', 'g') LIKE ${'%' + significant}
          )
        LIMIT 1
    `);
    return found ?? null;
}

/** Lead em aberto mais recente deste contato — mensagens ficam associadas a ele quando existir um. */
async function findOpenLeadForContact(organizationId: string, contactId: string) {
    return prisma.lead.findFirst({
        where: {
            organizationId,
            contactId,
            status: { notIn: ['Negocios_Ganhos', 'Negocios_Perdidos', 'Lead_Desqualificado'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, customFields: true, organizationId: true },
    });
}

export interface PersistWhatsAppMessageInput {
    organizationId: string;
    waMessageId: string;
    direction: 'inbound' | 'outbound';
    remoteJid: string | null | undefined;
    body: string | null;
}

/**
 * Persiste uma mensagem do WhatsApp (recebida ou enviada) e, quando o número corresponde a um
 * contato já cadastrado, vincula a um Lead em aberto e registra no timeline dele.
 *
 * Idempotente: `waMessageId` é único por organização, então uma reentrega do mesmo evento (comum
 * após reconexão do Baileys) não duplica o registro nem o evento de timeline.
 */
export async function persistWhatsAppMessage(input: PersistWhatsAppMessageInput): Promise<void> {
    if (!isIndividualChat(input.remoteJid)) return;

    const phoneE164 = toE164BR(input.remoteJid!.replace('@s.whatsapp.net', ''));
    if (!phoneE164) return;

    const existing = await prisma.whatsAppMessage.findUnique({
        where: { organizationId_waMessageId: { organizationId: input.organizationId, waMessageId: input.waMessageId } },
        select: { id: true },
    });
    if (existing) return;

    const contact = await findContactByPhone(input.organizationId, phoneE164);
    const lead = contact ? await findOpenLeadForContact(input.organizationId, contact.id) : null;

    await prisma.whatsAppMessage.create({
        data: {
            organizationId: input.organizationId,
            waMessageId: input.waMessageId,
            direction: input.direction,
            phoneE164,
            body: input.body,
            contactId: contact?.id,
            leadId: lead?.id,
        },
    });

    if (lead && input.direction === 'inbound') {
        const textLower = (input.body || '').trim().toLowerCase();
        if (['sair', 'parar', 'stop'].includes(textLower)) {
            const currentFields = (lead.customFields as Record<string, unknown>) || {};
            // Mantém o flag legado (`customFields.optOutWhatsApp`) — outros pontos do código já
            // dependem dele (crm/jobs/followUp.worker.ts, birth-voice/*.webhook.ts) e não são
            // escopo desta mudança. `recordOptOut` é ADICIONAL, não substituto: registra no
            // registro unificado (`OptOutRecord`) para que este pedido também bloqueie e-mail/voz
            // do mesmo lead, não só WhatsApp — ver contrato em
            // .agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md.
            await prisma.lead.update({
                where: { id: lead.id },
                data: {
                    customFields: { ...currentFields, optOutWhatsApp: true }
                }
            });
            logger.info({ leadId: lead.id }, 'Lead solicitou opt-out do WhatsApp');

            // scope 'global': "sair"/"parar"/"stop" são pedidos genéricos de parar contato, não uma
            // restrição explícita a um canal ("não me liga mais, pode mandar e-mail") — mesma regra
            // de interpretação do contrato de opt-out unificado.
            await recordOptOut(prismaOptOutRepository, {
                organizationId: input.organizationId,
                scope: 'global',
                subject: { leadId: lead.id, email: contact?.email ?? null, phoneE164 },
                originChannel: 'whatsapp',
                reason: 'Lead pediu para parar de receber mensagens via WhatsApp',
                evidence: input.body,
            }).catch((error) => {
                // O flag legado já foi salvo acima — a falha aqui não pode apagar essa evidência,
                // mas precisa ficar visível (não é um catch silencioso).
                logger.error({ err: error, leadId: lead.id }, 'Falha ao registrar opt-out unificado a partir do WhatsApp.');
            });
        }

        await prisma.timelineEvent.create({
            data: {
                type: 'whatsapp',
                description: input.body
                    ? `Mensagem recebida no WhatsApp: "${input.body.slice(0, 200)}"`
                    : 'Mensagem recebida no WhatsApp (mídia sem legenda).',
                leadId: lead.id,
            },
        }).catch((error) => {
            // O registro da mensagem já foi salvo — a falha aqui não pode apagar essa evidência.
            logger.error({ err: error, leadId: lead.id }, 'Falha ao registrar mensagem de WhatsApp no timeline do lead.');
        });

        await scheduleConversationAnalysis(lead.id, input.organizationId);
    }
}

export interface WhatsAppConversationSummary {
    phoneE164: string;
    contactId: string | null;
    contactName: string | null;
    lastMessageBody: string | null;
    lastMessageDirection: 'inbound' | 'outbound';
    lastMessageAt: Date;
}

/**
 * Lista as conversas de WhatsApp da organização, uma por número, ordenadas pela mensagem mais
 * recente — a lista à esquerda do painel "WhatsApp Web" embutido na tela de Integrações.
 *
 * CORREÇÃO (N+1, onda 42 — auditoria completa de rotas de listagem): a versão anterior fazia
 * `groupBy` (buscando TODOS os números já conversados, sem limite) seguido de um `findFirst` por
 * número dentro de `Promise.all` — até N+1 queries por chamada (1 groupBy + até 50 findFirst no
 * pior caso), cada uma sua própria transação com RLS (ver `executeWithRls` em `src/lib/prisma.ts`,
 * então na prática o dobro de round-trips reais ao Postgres). O comentário original já reconhecia
 * isso como um "N+1 tipado e seguro" aceito por não ter alternativa simples com `groupBy` — mas
 * existe: `findMany` com `distinct: ['phoneE164']` (equivalente a `DISTINCT ON` do Postgres) traz,
 * numa ÚNICA query, exatamente uma linha por número — já com `include: { contact }` — desde que o
 * campo do `distinct` venha primeiro em `orderBy` (regra do Prisma para produzir um `DISTINCT ON`
 * determinístico). `receivedAt: 'desc'` como segundo critério garante que a linha mantida por
 * número é a mensagem mais recente daquele número (mesma semântica do `_max(receivedAt)` antigo);
 * `id: 'desc'` como desempate final reproduz o mesmo critério de desempate que o `orderBy: { id:
 * 'desc' }` do `findFirst` antigo usava para mensagens com o mesmo `receivedAt`. `where:
 * { organizationId }` continua explícito (mesmo escopo de tenant de antes) e o `include: {
 * contact }` roda dentro da MESMA transação/contexto de RLS da query principal (ver
 * `executeWithRls`), então o isolamento de tenant no JOIN não muda — só o número de queries cai.
 */
export async function listConversations(organizationId: string, limit = 50): Promise<WhatsAppConversationSummary[]> {
    const latestPerPhone = await prisma.whatsAppMessage.findMany({
        where: { organizationId },
        distinct: ['phoneE164'],
        orderBy: [{ phoneE164: 'asc' }, { receivedAt: 'desc' }, { id: 'desc' }],
        include: { contact: { select: { id: true, name: true } } },
    });

    return latestPerPhone
        .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
        .slice(0, limit)
        .map((msg) => ({
            phoneE164: msg.phoneE164,
            contactId: msg.contact?.id ?? null,
            contactName: msg.contact?.name ?? null,
            lastMessageBody: msg.body ?? null,
            lastMessageDirection: (msg.direction as 'inbound' | 'outbound') ?? 'inbound',
            lastMessageAt: msg.receivedAt,
        }));
}
