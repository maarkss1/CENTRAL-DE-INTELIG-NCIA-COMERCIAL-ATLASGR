import { LeadStatus } from '@prisma/client';
import { prisma } from '../../../../lib/prisma.js';
import { notificationService } from '../../../notifications/notification.service.js';

/**
 * Status terminais usados só para decidir se um Lead/Negócio já existente ainda "conta" como
 * pertencendo a alguém para fins de bloqueio de duplicidade — um registro fechado (ganho, perdido,
 * desqualificado, piloto cancelado) não deve travar um import novo do mesmo contato. Espelha a
 * mesma lista de `CLOSED_DEAL_STATUSES` em crm360.service.ts (não exportada de lá) mais os status
 * terminais do funil Lead — ver mesmo raciocínio documentado em
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
 */
export async function findOwnershipConflict(
    organizationId: string,
    contact: { phone: string | null; email: string | null },
    incomingOwnerName: string | null,
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
    if (incomingOwnerName && existing.owner === incomingOwnerName) return null; // já é do mesmo dono — não é conflito

    return { existingLeadId: existing.id, existingOwner: existing.owner, existingTitle: existing.title };
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
    await notificationService.create({
        organizationId,
        title: 'Importação do Bitrix24 bloqueada — contato já pertence a outro responsável',
        body: `"${attemptedTitle}" não foi importado: já existe um negócio ativo ("${conflict.existingTitle || 'sem título'}") para este mesmo telefone/e-mail, atribuído a ${conflict.existingOwner}.`,
        kind: 'Alerta',
        entity: 'Lead',
        entityId: conflict.existingLeadId,
    });
}
