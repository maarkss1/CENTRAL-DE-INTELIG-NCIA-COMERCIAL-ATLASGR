import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { assertSafeWebhookUrl } from '../../../lib/adapters/crm/Bitrix24Adapter.js';

function normalizeWebhookUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

/**
 * Confirma que a URL realmente fala com um portal Bitrix24 antes de salvar — sem isto, um typo
 * na URL ou um token revogado só apareceria na hora de exportar o primeiro lead, silenciosamente
 * salvo como "conectado".
 */
async function testWebhook(webhookUrl: string): Promise<{ portalDomain: string }> {
    let response: Response;
    try {
        response = await fetch(`${webhookUrl}profile.json`);
    } catch (error) {
        logger.warn({ err: error }, '[bitrix] Falha de rede ao testar webhook');
        throw new AppError('Não foi possível conectar a essa URL. Confira o endereço do webhook.', 400);
    }

    if (!response.ok) {
        throw new AppError(`Bitrix24 respondeu com erro HTTP ${response.status} — confira a URL do webhook.`, 400);
    }

    const data = (await response.json().catch(() => null)) as
        | { error?: string; error_description?: string }
        | null;
    if (!data || data.error) {
        throw new AppError(
            data?.error_description || 'Webhook do Bitrix24 rejeitado (token inválido, revogado, ou sem permissão de perfil).',
            400
        );
    }

    let portalDomain = '';
    try {
        portalDomain = new URL(webhookUrl).hostname;
    } catch {
        // já validado por assertSafeWebhookUrl antes de chegar aqui
    }
    return { portalDomain };
}

/** Valida, testa contra o Bitrix24 de verdade e persiste o webhook desta organização. */
export async function connectBitrix(organizationId: string, rawWebhookUrl: unknown): Promise<{ portalDomain: string }> {
    if (!rawWebhookUrl || typeof rawWebhookUrl !== 'string') {
        throw new AppError('Informe a URL do webhook de entrada do Bitrix24.', 400);
    }

    const webhookUrl = normalizeWebhookUrl(rawWebhookUrl);
    await assertSafeWebhookUrl(webhookUrl);
    const { portalDomain } = await testWebhook(webhookUrl);

    await prisma.bitrixConnection.upsert({
        where: { organizationId },
        create: { organizationId, webhookUrl },
        update: { webhookUrl },
    });

    logger.info({ organizationId, portalDomain }, '[bitrix] Webhook conectado');
    return { portalDomain };
}

export async function getBitrixStatus(organizationId: string): Promise<{ connected: boolean; portalDomain: string | null }> {
    const connection = await prisma.bitrixConnection.findUnique({
        where: { organizationId },
        select: { webhookUrl: true },
    });
    if (!connection) return { connected: false, portalDomain: null };

    let portalDomain: string | null = null;
    try {
        portalDomain = new URL(connection.webhookUrl).hostname;
    } catch {
        // URL salva antes de alguma mudança de validação — não deveria acontecer, mas não é motivo pra quebrar o status
    }
    return { connected: true, portalDomain };
}

export async function disconnectBitrix(organizationId: string): Promise<void> {
    await prisma.bitrixConnection.deleteMany({ where: { organizationId } });
}

/** Usado pelo fluxo de exportação de lead como fallback quando a requisição não traz webhookUrl. */
export async function getStoredBitrixWebhookUrl(organizationId: string): Promise<string | null> {
    const connection = await prisma.bitrixConnection.findUnique({
        where: { organizationId },
        select: { webhookUrl: true },
    });
    return connection?.webhookUrl ?? null;
}

// ── Sincronização bidirecional ──────────────────────────────────────────────────────────────
//
// Atlas → Bitrix é automático: toda vez que um lead nasce no Atlas (Descoberta, CNPJ, OCR...),
// pushLeadToBitrix roda sozinho (ver promoteToCrm em prospecting.service.ts). Bitrix → Atlas é
// manual por design: o Bitrix desta organização tem 99+ leads acumulados de anos, misturando
// prospecção real (via WhatsApp) com notificações de e-mail auto-geradas ("Delivery Status
// Notification") — importar tudo automaticamente encheria o CRM de lixo. Por isso listBitrixLeads
// só lista para revisão humana, e só importSelectedBitrixLeads grava, pelos IDs que a pessoa
// escolheu na tela.

interface BitrixApiError {
    error: string;
    error_description?: string;
}

async function callBitrix<T>(webhookUrl: string, method: string, params?: Record<string, unknown>): Promise<T> {
    await assertSafeWebhookUrl(webhookUrl);
    const response = await fetch(`${webhookUrl}${method}.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params || {}),
    });
    const data = (await response.json().catch(() => null)) as (T & { error?: string; error_description?: string }) | null;
    if (!response.ok || !data || (data as unknown as BitrixApiError).error) {
        const err = data as unknown as BitrixApiError | null;
        throw new AppError(err?.error_description || `Bitrix24 respondeu com erro (HTTP ${response.status}).`, 502);
    }
    return data;
}

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

let statusLabelCache: { webhookUrl: string; labels: Map<string, string> } | null = null;

/** ID → nome de exibição de cada etapa (inclui as etapas customizadas do cliente, ex: "Novo Lead (Distribuidoras)"). */
async function getStatusLabels(webhookUrl: string): Promise<Map<string, string>> {
    if (statusLabelCache?.webhookUrl === webhookUrl) return statusLabelCache.labels;
    const data = await callBitrix<{ result: Array<{ STATUS_ID: string; NAME: string }> }>(
        webhookUrl,
        'crm.status.list',
        { filter: { ENTITY_ID: 'STATUS' } },
    );
    const labels = new Map(data.result.map((s) => [s.STATUS_ID, s.NAME]));
    statusLabelCache = { webhookUrl, labels };
    return labels;
}

/**
 * Lista uma página de leads do Bitrix24 para o usuário escolher o que importar — NUNCA grava
 * nada sozinho. `alreadyImported` reflete o que já existe no Atlas (por bitrixLeadId), pra tela
 * poder desabilitar o que já foi trazido antes.
 */
export async function listBitrixLeads(
    organizationId: string,
    start: number,
): Promise<{ leads: BitrixLeadSummary[]; next: number | null; total: number }> {
    const webhookUrl = await getStoredBitrixWebhookUrl(organizationId);
    if (!webhookUrl) throw new AppError('Bitrix24 não está conectado para esta organização.', 400);

    const [data, labels, imported] = await Promise.all([
        callBitrix<{ result: BitrixLeadRaw[]; next?: number; total: number }>(webhookUrl, 'crm.lead.list', {
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
    bitrixLeadIds: string[],
): Promise<{ imported: number; skipped: number }> {
    const webhookUrl = await getStoredBitrixWebhookUrl(organizationId);
    if (!webhookUrl) throw new AppError('Bitrix24 não está conectado para esta organização.', 400);
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
                status: 'Novo_Lead',
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

/**
 * Envia (ou atualiza) um lead do Atlas como Lead no Bitrix24. Núcleo compartilhado pelas duas
 * entradas públicas abaixo — lança AppError em qualquer falha; cada chamador decide se propaga
 * (botão manual) ou engole (push automático).
 */
async function syncLeadToBitrix(organizationId: string, leadId: string): Promise<{ bitrixLeadId: string }> {
    const webhookUrl = await getStoredBitrixWebhookUrl(organizationId);
    if (!webhookUrl) throw new AppError('Bitrix24 não está conectado para esta organização.', 400);

    const lead = await prisma.lead.findFirst({
        where: { id: leadId, organizationId },
        include: { company: true, contact: true },
    });
    if (!lead) throw new AppError('Lead não encontrado.', 404);

    const fields = {
        TITLE: lead.company?.tradeName || lead.company?.legalName || 'Lead Atlas',
        NAME: lead.contact?.name?.split(' ')[0],
        LAST_NAME: lead.contact?.name?.split(' ').slice(1).join(' ') || undefined,
        COMPANY_TITLE: lead.company?.legalName || lead.company?.tradeName,
        PHONE: (lead.contact?.phone || lead.company?.phones?.[0]) ? [{ VALUE: lead.contact?.phone || lead.company?.phones?.[0], VALUE_TYPE: 'WORK' }] : undefined,
        EMAIL: (lead.contact?.email || lead.company?.emails?.[0]) ? [{ VALUE: lead.contact?.email || lead.company?.emails?.[0], VALUE_TYPE: 'WORK' }] : undefined,
        SOURCE_ID: 'WEB',
        SOURCE_DESCRIPTION: 'AtlasGR Prospector',
        COMMENTS: lead.company?.observations || undefined,
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
            COMMENT: `Lead criado automaticamente pelo AtlasGR Prospector.${lead.score ? `\nFit Score: ${lead.score}` : ''}`,
        },
    });
    return { bitrixLeadId: String(newId) };
}

/**
 * Chamado automaticamente sempre que um lead nasce no Atlas (ver promoteToCrm) — não precisa de
 * clique manual. Fire-and-forget por design: nunca propaga erro, já que o Bitrix é um sistema
 * secundário e uma falha aqui não pode impedir o lead de existir no Atlas. Também é um no-op
 * silencioso se a organização não tiver Bitrix conectado.
 */
export async function pushLeadToBitrix(organizationId: string, leadId: string): Promise<void> {
    try {
        const webhookUrl = await getStoredBitrixWebhookUrl(organizationId);
        if (!webhookUrl) return;
        await syncLeadToBitrix(organizationId, leadId);
        logger.info({ organizationId, leadId }, '[bitrix] Lead enviado automaticamente');
    } catch (err) {
        logger.warn({ err, organizationId, leadId }, '[bitrix] Falha ao enviar lead automaticamente');
    }
}

/** Usado pelo botão manual "Exportar p/ Bitrix24" — ao contrário do push automático, propaga erro. */
export async function exportLeadToBitrixNow(organizationId: string, leadId: string): Promise<{ bitrixLeadId: string }> {
    return syncLeadToBitrix(organizationId, leadId);
}
