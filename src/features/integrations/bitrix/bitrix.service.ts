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

// ── Importação a partir de Deals (Negócios) — funil real com pipeline/etapa ────────────────────
//
// O objeto "Lead" do Bitrix é uma lista plana de status, sem pipeline — não corresponde ao funil
// de vendas real que o time usa no dia a dia (kanban de Negócios, com múltiplos pipelines:
// Comercial, Financeiro, Suporte Técnico etc.). Estas funções falam com crm.deal.* para permitir
// filtrar por pipeline + etapa + vendedor + mês/ano antes de escolher o que importar.

export interface BitrixDealPipeline {
    id: string;
    name: string;
}

export interface BitrixDealStage {
    id: string;
    name: string;
}

export interface BitrixUserOption {
    id: string;
    name: string;
}

/** Lista os pipelines (categorias) de Negócio configurados no portal. */
export async function getDealPipelines(organizationId: string): Promise<BitrixDealPipeline[]> {
    const webhookUrl = await getStoredBitrixWebhookUrl(organizationId);
    if (!webhookUrl) throw new AppError('Bitrix24 não está conectado para esta organização.', 400);

    const data = await callBitrix<{ result: Array<{ ID: string; NAME: string }> }>(webhookUrl, 'crm.dealcategory.list', {});
    return data.result.map((c) => ({ id: c.ID, name: c.NAME }));
}

/** Lista as etapas de um pipeline específico de Negócio (STAGE_ID é prefixado por "C<pipeline>:"). */
export async function getDealStages(organizationId: string, categoryId: string): Promise<BitrixDealStage[]> {
    const webhookUrl = await getStoredBitrixWebhookUrl(organizationId);
    if (!webhookUrl) throw new AppError('Bitrix24 não está conectado para esta organização.', 400);

    const data = await callBitrix<{ result: Array<{ STATUS_ID: string; NAME: string }> }>(
        webhookUrl,
        'crm.dealcategory.stage.list',
        { id: Number(categoryId) },
    );
    return data.result.map((s) => ({ id: s.STATUS_ID, name: s.NAME }));
}

/**
 * Lista usuários do portal para o filtro de vendedor. Alguns webhooks do Bitrix não têm escopo
 * `user` habilitado (comum em webhooks criados só com escopo de CRM) — nesse caso devolve uma
 * lista vazia em vez de derrubar a tela inteira; a UI cai para exibir o ID bruto do responsável.
 */
export async function getBitrixUsers(organizationId: string): Promise<BitrixUserOption[]> {
    const webhookUrl = await getStoredBitrixWebhookUrl(organizationId);
    if (!webhookUrl) throw new AppError('Bitrix24 não está conectado para esta organização.', 400);

    try {
        const data = await callBitrix<{ result: Array<{ ID: string; NAME?: string; LAST_NAME?: string }> }>(
            webhookUrl,
            'user.get',
            { filter: { ACTIVE: true } },
        );
        return data.result
            .map((u) => ({ id: u.ID, name: [u.NAME, u.LAST_NAME].filter(Boolean).join(' ') || `Usuário #${u.ID}` }))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    } catch (err) {
        logger.warn({ err, organizationId }, '[bitrix] Sem escopo "user" no webhook — filtro de vendedor cairá para ID bruto');
        return [];
    }
}

interface BitrixDealRaw {
    ID: string;
    TITLE?: string;
    CATEGORY_ID?: string;
    STAGE_ID?: string;
    ASSIGNED_BY_ID?: string;
    DATE_CREATE?: string;
    OPPORTUNITY?: string;
    CONTACT_ID?: string;
    COMPANY_ID?: string;
    COMMENTS?: string;
    LEAD_ID?: string;
}

export interface BitrixDealSummary {
    id: string;
    title: string;
    stageLabel: string;
    assignedById: string | null;
    dateCreate: string | null;
    opportunity: string | null;
    alreadyImported: boolean;
}

export interface BitrixDealFilters {
    categoryId?: string;
    stageId?: string;
    assignedById?: string;
    /** 1-12. Só tem efeito junto com `year` — mês sozinho seria ambíguo entre anos diferentes. */
    month?: number;
    year?: number;
}

/**
 * Lista uma página de Negócios do Bitrix24 para o usuário escolher o que importar — mesmo
 * princípio de listBitrixLeads (nunca grava sozinho). Filtros são resolvidos num objeto Bitrix
 * `filter` server-side, em vez de paginar tudo e filtrar no cliente (o portal tem centenas de
 * registros; filtrar aqui evita o usuário ter que passar página por página procurando).
 */
export async function listBitrixDeals(
    organizationId: string,
    start: number,
    filters: BitrixDealFilters = {},
): Promise<{ deals: BitrixDealSummary[]; next: number | null; total: number }> {
    const webhookUrl = await getStoredBitrixWebhookUrl(organizationId);
    if (!webhookUrl) throw new AppError('Bitrix24 não está conectado para esta organização.', 400);

    const filter: Record<string, unknown> = {};
    if (filters.categoryId) filter.CATEGORY_ID = filters.categoryId;
    if (filters.stageId) filter.STAGE_ID = filters.stageId;
    if (filters.assignedById) filter.ASSIGNED_BY_ID = filters.assignedById;
    if (filters.month && filters.year) {
        const start_ = new Date(Date.UTC(filters.year, filters.month - 1, 1));
        const end_ = new Date(Date.UTC(filters.year, filters.month, 1));
        filter['>=DATE_CREATE'] = start_.toISOString().slice(0, 10);
        filter['<DATE_CREATE'] = end_.toISOString().slice(0, 10);
    } else if (filters.year) {
        filter['>=DATE_CREATE'] = `${filters.year}-01-01`;
        filter['<DATE_CREATE'] = `${filters.year + 1}-01-01`;
    }

    const [data, imported] = await Promise.all([
        callBitrix<{ result: BitrixDealRaw[]; next?: number; total: number }>(webhookUrl, 'crm.deal.list', {
            filter,
            select: ['ID', 'TITLE', 'CATEGORY_ID', 'STAGE_ID', 'ASSIGNED_BY_ID', 'DATE_CREATE', 'OPPORTUNITY', 'CONTACT_ID', 'COMPANY_ID'],
            order: { DATE_CREATE: 'DESC' },
            start,
        }),
        prisma.lead.findMany({ where: { organizationId, bitrixDealId: { not: null } }, select: { bitrixDealId: true } }),
    ]);

    // Nomes de etapa dependem do pipeline (STAGE_ID é prefixado por "C<pipeline>:") — resolve só
    // os pipelines que realmente apareceram nesta página, em vez de carregar todos de antemão.
    const categoryIds = [...new Set(data.result.map((d) => d.CATEGORY_ID).filter((v): v is string => Boolean(v)))];
    const stageLabelsByCategory = new Map<string, Map<string, string>>();
    await Promise.all(categoryIds.map(async (categoryId) => {
        const stages = await getDealStages(organizationId, categoryId);
        stageLabelsByCategory.set(categoryId, new Map(stages.map((s) => [s.id, s.name])));
    }));

    const importedIds = new Set(imported.map((l) => l.bitrixDealId));

    const deals: BitrixDealSummary[] = data.result.map((raw) => ({
        id: raw.ID,
        title: raw.TITLE || `Negócio #${raw.ID}`,
        stageLabel: (raw.CATEGORY_ID && raw.STAGE_ID && stageLabelsByCategory.get(raw.CATEGORY_ID)?.get(raw.STAGE_ID)) || raw.STAGE_ID || 'Desconhecida',
        assignedById: raw.ASSIGNED_BY_ID || null,
        dateCreate: raw.DATE_CREATE || null,
        opportunity: raw.OPPORTUNITY || null,
        alreadyImported: importedIds.has(raw.ID),
    }));

    return { deals, next: data.next ?? null, total: data.total };
}

/** Importa só os Negócios cujo ID a pessoa marcou na tela — pula silenciosamente o que já foi importado antes. */
export async function importSelectedBitrixDeals(
    organizationId: string,
    bitrixDealIds: string[],
): Promise<{ imported: number; skipped: number }> {
    const webhookUrl = await getStoredBitrixWebhookUrl(organizationId);
    if (!webhookUrl) throw new AppError('Bitrix24 não está conectado para esta organização.', 400);
    if (bitrixDealIds.length === 0) return { imported: 0, skipped: 0 };
    if (bitrixDealIds.length > 100) throw new AppError('Selecione no máximo 100 negócios por vez.', 400);

    let imported = 0;
    let skipped = 0;

    for (const bitrixDealId of bitrixDealIds) {
        const existing = await prisma.lead.findFirst({ where: { organizationId, bitrixDealId }, select: { id: true } });
        if (existing) {
            skipped++;
            continue;
        }

        const { result: deal } = await callBitrix<{ result: BitrixDealRaw }>(webhookUrl, 'crm.deal.get', { id: bitrixDealId });

        let contactName = '';
        let phone: string | null = null;
        let email: string | null = null;
        if (deal.CONTACT_ID) {
            try {
                const { result: contact } = await callBitrix<{
                    result: { NAME?: string; LAST_NAME?: string; PHONE?: Array<{ VALUE: string }>; EMAIL?: Array<{ VALUE: string }> };
                }>(webhookUrl, 'crm.contact.get', { id: deal.CONTACT_ID });
                contactName = [contact.NAME, contact.LAST_NAME].filter(Boolean).join(' ');
                phone = contact.PHONE?.[0]?.VALUE || null;
                email = contact.EMAIL?.[0]?.VALUE || null;
            } catch (err) {
                logger.warn({ err, bitrixDealId, contactId: deal.CONTACT_ID }, '[bitrix] Falha ao buscar contato do negócio — segue sem esses dados');
            }
        }

        let tradeName = deal.TITLE || `Negócio Bitrix #${deal.ID}`;
        if (deal.COMPANY_ID) {
            try {
                const { result: company } = await callBitrix<{ result: { TITLE?: string } }>(webhookUrl, 'crm.company.get', { id: deal.COMPANY_ID });
                tradeName = company.TITLE || tradeName;
            } catch (err) {
                logger.warn({ err, bitrixDealId, companyId: deal.COMPANY_ID }, '[bitrix] Falha ao buscar empresa do negócio — usando título do negócio');
            }
        }

        const stageLabel = deal.CATEGORY_ID && deal.STAGE_ID
            ? (await getDealStages(organizationId, deal.CATEGORY_ID)).find((s) => s.id === deal.STAGE_ID)?.name || deal.STAGE_ID
            : null;

        const company = await prisma.company.create({
            data: {
                legalName: tradeName,
                tradeName,
                phones: phone ? [phone] : [],
                emails: email ? [email] : [],
                segment: 'Importado do Bitrix24 (Negócio)',
                observations: deal.COMMENTS || null,
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
                source: 'Bitrix24 (importado via Negócio)',
                companyId: company.id,
                contactId: contact?.id,
                organizationId,
                bitrixDealId: deal.ID,
                bitrixStageLabel: stageLabel,
            },
        });
        imported++;
    }

    logger.info({ organizationId, imported, skipped }, '[bitrix] Importação de negócios concluída');
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
