import { prisma } from '../../../../lib/prisma.js';
import { logger } from '../../../../lib/logger.js';
import { AppError } from '../../../../shared/middlewares/errorHandler.js';
import { fromPrismaLeadStatus } from '../../../../lib/enumMap.js';
import { callBitrix, getConnectionWebhookUrl } from './client.js';

/**
 * Envia (ou atualiza) um lead do Atlas como Lead no Bitrix24. Núcleo compartilhado pelas duas
 * entradas públicas abaixo — lança AppError em qualquer falha; cada chamador decide se propaga
 * (botão manual) ou engole (push automático).
 */
async function syncLeadToBitrix(organizationId: string, webhookUrl: string, leadId: string): Promise<{ bitrixLeadId: string }> {
    const lead = await prisma.lead.findFirst({
        where: { id: leadId, organizationId },
        include: { company: true, contact: true },
    });
    if (!lead) throw new AppError('Lead não encontrado.', 404);

    const statusLabel = fromPrismaLeadStatus(lead.status);
    const qualInfo = lead.qualification && typeof lead.qualification === 'object'
        ? Object.entries(lead.qualification as Record<string, unknown>)
            .filter(([_, v]) => v != null && v !== '')
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
        : '';

    const commentsParts = [
        lead.company?.observations,
        `Etapa no Atlas: ${statusLabel}`,
        lead.temperature ? `Temperatura: ${lead.temperature}` : null,
        lead.score ? `Fit Score: ${lead.score}` : null,
        lead.pic ? `Perfil (PIC): ${lead.pic}` : null,
        qualInfo ? `\n--- Qualificação Atlas ---\n${qualInfo}` : null,
    ].filter(Boolean).join('\n');

    const fields = {
        TITLE: lead.company?.tradeName || lead.company?.legalName || 'Lead Atlas',
        NAME: lead.contact?.name?.split(' ')[0],
        LAST_NAME: lead.contact?.name?.split(' ').slice(1).join(' ') || undefined,
        COMPANY_TITLE: lead.company?.legalName || lead.company?.tradeName,
        PHONE: (lead.contact?.phone || lead.company?.phones?.[0]) ? [{ VALUE: lead.contact?.phone || lead.company?.phones?.[0], VALUE_TYPE: 'WORK' }] : undefined,
        EMAIL: (lead.contact?.email || lead.company?.emails?.[0]) ? [{ VALUE: lead.contact?.email || lead.company?.emails?.[0], VALUE_TYPE: 'WORK' }] : undefined,
        SOURCE_ID: 'WEB',
        SOURCE_DESCRIPTION: 'AtlasGR Prospector',
        COMMENTS: commentsParts || undefined,
    };

    if (lead.bitrixLeadId) {
        await callBitrix(webhookUrl, 'crm.lead.update', { id: lead.bitrixLeadId, fields });
        return { bitrixLeadId: lead.bitrixLeadId };
    }

    const { result: newId } = await callBitrix<{ result: string }>(webhookUrl, 'crm.lead.add', { fields });
    await prisma.lead.update({ where: { id: lead.id }, data: { bitrixLeadId: String(newId) } });
    await callBitrix(webhookUrl, 'crm.timeline.comment.add', {
        fields: {
            ENTITY_ID: newId,
            ENTITY_TYPE: 'lead',
            COMMENT: `Lead criado pelo AtlasGR Prospector.\nEtapa: ${statusLabel}${lead.score ? `\nFit Score: ${lead.score}` : ''}`,
        },
    });
    return { bitrixLeadId: String(newId) };
}

/**
 * Chamado automaticamente sempre que um lead nasce no Atlas (ver promoteToCrm) — não precisa de
 * clique manual. Fire-and-forget por design: nunca propaga erro, já que o Bitrix é um sistema
 * secundário e uma falha aqui não pode impedir o lead de existir no Atlas.
 */
export async function pushLeadToBitrix(organizationId: string, leadId: string): Promise<void> {
    try {
        const connection = await prisma.bitrixConnection.findFirst({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
        if (!connection) return;
        await syncLeadToBitrix(organizationId, connection.webhookUrl, leadId);
        logger.info({ organizationId, connectionId: connection.id, leadId }, '[bitrix] Lead enviado automaticamente');
    } catch (err) {
        logger.warn({ err, organizationId, leadId }, '[bitrix] Falha ao enviar lead automaticamente');
    }
}

/** Suporta exportação individual OU em lote (quando leadId é omitido/undefined). */
export async function exportLeadToBitrixNow(
    organizationId: string,
    leadId?: string,
    connectionId?: string
): Promise<{ bitrixLeadId?: string; exportedCount?: number; skippedCount?: number }> {
    let webhookUrl: string;
    if (connectionId) {
        webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);
    } else {
        const connection = await prisma.bitrixConnection.findFirst({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
        if (!connection) throw new AppError('Bitrix24 não está conectado para esta organização.', 400);
        webhookUrl = connection.webhookUrl;
    }

    if (leadId && leadId !== 'all') {
        return syncLeadToBitrix(organizationId, webhookUrl, leadId);
    }

    // Exportação em lote de todos os leads da organização
    const leads = await prisma.lead.findMany({
        where: { organizationId },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
    });

    let exportedCount = 0;
    let skippedCount = 0;

    for (const l of leads) {
        try {
            await syncLeadToBitrix(organizationId, webhookUrl, l.id);
            exportedCount++;
        } catch (err) {
            logger.warn({ err, leadId: l.id }, '[bitrix] Falha ao exportar lead em lote');
            skippedCount++;
        }
    }

    return { exportedCount, skippedCount };
}
