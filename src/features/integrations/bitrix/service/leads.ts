import { prisma } from '../../../../lib/prisma.js';
import { LeadStatus } from '@prisma/client';
import { logger } from '../../../../lib/logger.js';
import { AppError } from '../../../../shared/middlewares/errorHandler.js';
import { callBitrix, getStatusLabels, getConnectionWebhookUrl } from './client.js';
import type { BitrixDealStage } from './deals.js';

// ── Sincronização bidirecional ──────────────────────────────────────────────────────────────
//
// Atlas → Bitrix é automático: toda vez que um lead nasce no Atlas (Descoberta, CNPJ, OCR...),
// pushLeadToBitrix roda sozinho (ver promoteToCrm em prospecting.service.ts). Bitrix → Atlas é
// manual por design: o Bitrix desta organização tem 99+ leads acumulados de anos, misturando
// prospecção real (via WhatsApp) com notificações de e-mail auto-geradas ("Delivery Status
// Notification") — importar tudo automaticamente encheria o CRM de lixo. Por isso listBitrixLeads
// só lista para revisão humana, e só importSelectedBitrixLeads grava, pelos IDs que a pessoa
// escolheu na tela.

interface BitrixLeadRaw {
    ID: string;
    TITLE?: string;
    NAME?: string;
    LAST_NAME?: string;
    COMPANY_TITLE?: string;
    PHONE?: Array<{ VALUE: string }>;
    EMAIL?: Array<{ VALUE: string }>;
    STATUS_ID?: string;
    SOURCE_ID?: string;
    DATE_CREATE?: string;
    COMMENTS?: string;
}

export interface BitrixLeadSummary {
    id: string;
    title: string;
    companyTitle: string | null;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    statusLabel: string;
    sourceId: string | null;
    dateCreate: string | null;
    alreadyImported: boolean;
}

/** Lista os status possíveis de Lead deste portal (equivalente a getDealStages, mas para o objeto Lead — que não tem pipeline). */
export async function getLeadStatuses(organizationId: string, connectionId: string): Promise<BitrixDealStage[]> {
    const webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);
    const labels = await getStatusLabels(webhookUrl);
    return Array.from(labels.entries()).map(([id, name]) => ({ id, name }));
}

/**
 * Lista uma página de leads do Bitrix24 para o usuário escolher o que importar — NUNCA grava
 * nada sozinho. `alreadyImported` reflete o que já existe no Atlas (por bitrixLeadId), pra tela
 * poder desabilitar o que já foi trazido antes.
 */
export interface BitrixLeadFilters {
    search?: string;
    statusId?: string;
    assignedById?: string;
}

export async function listBitrixLeads(
    organizationId: string,
    connectionId: string,
    start: number,
    filters: BitrixLeadFilters = {},
): Promise<{ leads: BitrixLeadSummary[]; next: number | null; total: number }> {
    const webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);

    // "%TITLE" é o operador de busca parcial (LIKE '%valor%') da REST API do Bitrix — resolvido
    // no servidor deles, não filtrado localmente, então funciona mesmo fora da página atual.
    const filter: Record<string, unknown> = {};
    if (filters.search?.trim()) filter['%TITLE'] = filters.search.trim();
    if (filters.statusId) filter.STATUS_ID = filters.statusId;
    if (filters.assignedById) filter.ASSIGNED_BY_ID = filters.assignedById;

    const [data, labels, imported] = await Promise.all([
        callBitrix<{ result: BitrixLeadRaw[]; next?: number; total: number }>(webhookUrl, 'crm.lead.list', {
            filter,
            select: ['ID', 'TITLE', 'NAME', 'LAST_NAME', 'COMPANY_TITLE', 'PHONE', 'EMAIL', 'STATUS_ID', 'SOURCE_ID', 'DATE_CREATE'],
            order: { DATE_CREATE: 'DESC' },
            start,
        }),
        getStatusLabels(webhookUrl),
        prisma.lead.findMany({ where: { organizationId, bitrixLeadId: { not: null } }, select: { bitrixLeadId: true } }),
    ]);

    const importedIds = new Set(imported.map((l) => l.bitrixLeadId));

    const leads: BitrixLeadSummary[] = data.result.map((raw) => ({
        id: raw.ID,
        title: raw.TITLE || raw.COMPANY_TITLE || `${raw.NAME || ''} ${raw.LAST_NAME || ''}`.trim() || `Lead #${raw.ID}`,
        companyTitle: raw.COMPANY_TITLE || null,
        contactName: [raw.NAME, raw.LAST_NAME].filter(Boolean).join(' ') || null,
        phone: raw.PHONE?.[0]?.VALUE || null,
        email: raw.EMAIL?.[0]?.VALUE || null,
        statusLabel: (raw.STATUS_ID && labels.get(raw.STATUS_ID)) || raw.STATUS_ID || 'Desconhecido',
        sourceId: raw.SOURCE_ID || null,
        dateCreate: raw.DATE_CREATE || null,
        alreadyImported: importedIds.has(raw.ID),
    }));

    return { leads, next: data.next ?? null, total: data.total };
}

/** Importa só os leads cujo ID a pessoa marcou na tela — pula silenciosamente o que já foi importado antes. */
export async function importSelectedBitrixLeads(
    organizationId: string,
    connectionId: string,
    bitrixLeadIds: string[],
): Promise<{ imported: number; skipped: number }> {
    const webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);
    if (bitrixLeadIds.length === 0) return { imported: 0, skipped: 0 };
    if (bitrixLeadIds.length > 100) throw new AppError('Selecione no máximo 100 leads por vez.', 400);

    const labels = await getStatusLabels(webhookUrl);
    let imported = 0;
    let skipped = 0;

    for (const bitrixLeadId of bitrixLeadIds) {
        const existing = await prisma.lead.findFirst({ where: { organizationId, bitrixLeadId }, select: { id: true } });
        if (existing) {
            skipped++;
            continue;
        }

        const { result: raw } = await callBitrix<{ result: BitrixLeadRaw }>(webhookUrl, 'crm.lead.get', { id: bitrixLeadId });
        const tradeName = raw.TITLE || raw.COMPANY_TITLE || `${raw.NAME || ''} ${raw.LAST_NAME || ''}`.trim() || `Lead Bitrix #${raw.ID}`;
        const contactName = [raw.NAME, raw.LAST_NAME].filter(Boolean).join(' ');
        const phone = raw.PHONE?.[0]?.VALUE || null;
        const email = raw.EMAIL?.[0]?.VALUE || null;

        const company = await prisma.company.create({
            data: {
                legalName: tradeName,
                tradeName,
                phones: phone ? [phone] : [],
                emails: email ? [email] : [],
                segment: 'Importado do Bitrix24',
                observations: raw.COMMENTS || null,
                organizationId,
                tags: ['Bitrix24'],
            },
        });

        const contact = contactName
            ? await prisma.contact.create({
                data: { name: contactName, phone, email, companyId: company.id, organizationId },
            })
            : null;

        await prisma.lead.create({
            data: {
                status: LeadStatus.Lead_Recebido,
                source: 'Bitrix24 (importado)',
                companyId: company.id,
                contactId: contact?.id,
                organizationId,
                bitrixLeadId: raw.ID,
                bitrixStageLabel: (raw.STATUS_ID && labels.get(raw.STATUS_ID)) || raw.STATUS_ID || null,
            },
        });
        imported++;
    }

    logger.info({ organizationId, imported, skipped }, '[bitrix] Importação seletiva concluída');
    return { imported, skipped };
}
