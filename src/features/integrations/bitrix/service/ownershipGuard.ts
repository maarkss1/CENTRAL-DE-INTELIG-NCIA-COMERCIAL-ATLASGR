import { LeadStatus } from '@prisma/client';
import { prisma } from '../../../../lib/prisma.js';
import { notificationService } from '../../../notifications/notification.service.js';

/**
 * Status terminais usados só para decidir se um Lead/Negócio já existente ainda "conta" como
 * pertencendo a alguém para fins de bloqueio de duplicidade — um registro fechado (ganho, perdido,
 * desqualificado, piloto cancelado) não deve travar um import novo do mesmo contato. Espelha a
 * mesma lista de `CLOSED_DEAL_STATUSES` em PrismaCrm360Repository.ts (não exportada de lá) mais os
 * status terminais do funil Lead — ver mesmo raciocínio documentado em
 * PrismaCommercialIntelligenceRepository.ts sobre por que essa duplicação pequena é aceitável.
 */
const TERMINAL_STATUSES: LeadStatus[] = [
    LeadStatus.Negocios_Ganhos,
    LeadStatus.Negocios_Perdidos,
    LeadStatus.Lead_Desqualificado,
    LeadStatus.Piloto_Atlas_Profile_Cancelado,
    LeadStatus.Piloto_Logistico_Cancelado,
];

export interface OwnershipConflict {
    existingLeadId: string;
    existingOwner: string;
    existingTitle: string | null;
}

/**
 * Verifica se já existe, nesta organização, um Lead/Negócio ATIVO (fora dos status terminais)
 * vinculado a um contato com o mesmo telefone ou e-mail, e cujo responsável (`owner`) é diferente
 * do que está prestes a importar este registro — usa telefone/e-mail (já buscados do Bitrix pela
 * importação, sem chamada extra) em vez de CNPJ, que nem sempre vem preenchido no payload do
 * Bitrix. `null` quando não há conflito (contato novo, sem responsável anterior, ou já é do mesmo
 * dono) — nesse caso o import segue normalmente.
 *
 * `incomingOwnerId` é o `User.id` que vai ser gravado em `Lead.owner` (ver `userMapping.ts` →
 * `resolveAtlasUserIdByEmail`). Leads importados ANTES da correção de
 * `.agents/handoffs/onda-7/04-para-06-owner-bitrix-nome-nao-id.md` ainda têm `owner` = nome
 * (`User.name`) até o backfill proposto em
 * `.agents/handoffs/onda-10/06-para-01-backfill-lead-owner.md` rodar — nesse intervalo, um
 * `existing.owner` legado (nome) nunca bate por igualdade com um `incomingOwnerId` novo (id), então
 * a checagem trata como conflito mesmo quando é o mesmo dono na prática. É uma falha para o lado
 * seguro (bloqueia e notifica em vez de deixar passar), não uma regressão de segurança.
 */
export async function findOwnershipConflict(
    organizationId: string,
    contact: { phone: string | null; email: string | null },
    incomingOwnerId: string | null,
): Promise<OwnershipConflict | null> {
    if (!contact.phone && !contact.email) return null;

    const existing = await prisma.lead.findFirst({
        where: {
            organizationId,
            status: { notIn: TERMINAL_STATUSES },
            owner: { not: null },
            contact: {
                OR: [
                    contact.phone ? { phone: contact.phone } : undefined,
                    contact.email ? { email: { equals: contact.email, mode: 'insensitive' as const } } : undefined,
                ].filter((c): c is NonNullable<typeof c> => c !== undefined),
            },
        },
        select: { id: true, owner: true, title: true },
        orderBy: { updatedAt: 'desc' },
    });

    if (!existing || !existing.owner) return null;
    if (incomingOwnerId && existing.owner === incomingOwnerId) return null; // já é do mesmo dono — não é conflito

    return { existingLeadId: existing.id, existingOwner: existing.owner, existingTitle: existing.title };
}

/**
 * Devolve um rótulo legível para `owner` num alerta voltado ao usuário. Desde a correção de
 * `.agents/handoffs/onda-7/04-para-06-owner-bitrix-nome-nao-id.md`, `Lead.owner` grava `User.id`
 * (não mais o nome) — sem essa resolução, a notificação abaixo vazaria um cuid cru para o
 * operador. Tenta casar `owner` como `User.id` desta organização; se não achar (registro legado
 * ainda não migrado pelo backfill, ou dono já removido), devolve o próprio valor armazenado como
 * fallback — nunca lança.
 */
async function resolveOwnerDisplayName(organizationId: string, owner: string): Promise<string> {
    const user = await prisma.user.findFirst({ where: { id: owner, organizationId }, select: { name: true } });
    return user?.name ?? owner;
}

/**
 * Notifica quem tentou importar (via automação ou clique manual) que o registro foi bloqueado por
 * já pertencer a outro responsável — nunca lança: notificação é efeito colateral, não pode derrubar
 * o restante do lote de importação (mesmo princípio de `NotificationService.create`).
 */
export async function notifyOwnershipConflict(
    organizationId: string,
    conflict: OwnershipConflict,
    attemptedTitle: string,
): Promise<void> {
    const ownerLabel = await resolveOwnerDisplayName(organizationId, conflict.existingOwner);
    await notificationService.create({
        organizationId,
        title: 'Importação do Bitrix24 bloqueada — contato já pertence a outro responsável',
        body: `"${attemptedTitle}" não foi importado: já existe um negócio ativo ("${conflict.existingTitle || 'sem título'}") para este mesmo telefone/e-mail, atribuído a ${ownerLabel}.`,
        kind: 'Alerta',
        entity: 'Lead',
        entityId: conflict.existingLeadId,
    });
}
