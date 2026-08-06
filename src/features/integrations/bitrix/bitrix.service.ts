import { prisma } from '../../../lib/prisma.js';
import { LeadStatus } from '@prisma/client';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { assertSafeWebhookUrl } from '../../../lib/adapters/crm/Bitrix24Adapter.js';
import { requestContext } from '../../../lib/async-context.js';
import { fromPrismaLeadStatus } from '../../../lib/enumMap.js';

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

function hostnameOf(webhookUrl: string): string | null {
    try {
        return new URL(webhookUrl).hostname;
    } catch {
        return null;
    }
}

export interface BitrixConnectionSummary {
    id: string;
    label: string;
    portalDomain: string | null;
}

/** Lista todos os portais Bitrix conectados desta organização — uma organização pode ter mais de um (ex.: AtlasGR e TotalTrac). */
export async function listBitrixConnections(organizationId: string): Promise<BitrixConnectionSummary[]> {
    const connections = await prisma.bitrixConnection.findMany({
        where: { organizationId },
        select: { id: true, label: true, webhookUrl: true },
        orderBy: { createdAt: 'asc' },
    });
    return connections.map((c) => ({ id: c.id, label: c.label, portalDomain: hostnameOf(c.webhookUrl) }));
}

/** Valida, testa contra o Bitrix24 de verdade e persiste um NOVO portal conectado a esta organização. */
export async function connectBitrix(organizationId: string, rawWebhookUrl: unknown, rawLabel: unknown): Promise<{ id: string; portalDomain: string }> {
    if (!rawWebhookUrl || typeof rawWebhookUrl !== 'string') {
        throw new AppError('Informe a URL do webhook de entrada do Bitrix24.', 400);
    }

    const webhookUrl = normalizeWebhookUrl(rawWebhookUrl);
    await assertSafeWebhookUrl(webhookUrl);
    const { portalDomain } = await testWebhook(webhookUrl);
    const label = (typeof rawLabel === 'string' && rawLabel.trim()) || portalDomain || 'Bitrix24';

    const connection = await prisma.bitrixConnection.create({
        data: { organizationId, webhookUrl, label },
    });

    logger.info({ organizationId, connectionId: connection.id, portalDomain }, '[bitrix] Webhook conectado');
    return { id: connection.id, portalDomain };
}

export async function disconnectBitrix(organizationId: string, connectionId: string): Promise<void> {
    await prisma.bitrixConnection.deleteMany({ where: { id: connectionId, organizationId } });
}

/** Resolve a URL do webhook de UMA conexão específica, validando que ela pertence a esta organização. */
export async function getConnectionWebhookUrl(organizationId: string, connectionId: string): Promise<string> {
    const connection = await prisma.bitrixConnection.findFirst({
        where: { id: connectionId, organizationId },
        select: { webhookUrl: true },
    });
    if (!connection) throw new AppError('Conexão Bitrix24 não encontrada para esta organização.', 404);
    return connection.webhookUrl;
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
        const response = await fetch(`${webhookUrl}${method}.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params || {}),
            signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as (T & { error?: string; error_description?: string }) | null;
        if (!response.ok || !data || (data as unknown as BitrixApiError).error) {
            const err = data as unknown as BitrixApiError | null;
            throw new AppError(err?.error_description || `Bitrix24 respondeu com erro (HTTP ${response.status}).`, 502);
        }
        return data;
    } catch (err: unknown) {
        if (controller.signal.aborted) {
            throw new AppError('Tempo limite esgotado ao comunicar com o Bitrix24 (timeout 15s).', 504);
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
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

    const existingLeads = await prisma.lead.findMany({
        where: { organizationId, bitrixLeadId: { in: bitrixLeadIds } },
        select: { bitrixLeadId: true },
    });
    const existingIds = new Set(existingLeads.map((l) => l.bitrixLeadId));

    for (const bitrixLeadId of bitrixLeadIds) {
        if (existingIds.has(bitrixLeadId)) {
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

/**
 * Lista os pipelines (categorias) de Negócio configurados no portal — só o pipeline "Comercial".
 * Portais como o da TotalTrac têm dezenas de pipelines operacionais (Financeiro, RH, Suporte
 * Técnico, Implantação...) que não são funil de vendas; misturar tudo na tela de importação do
 * Atlas (uma ferramenta de prospecção/CRM comercial) só traz ruído. Se o portal não tiver nenhum
 * pipeline chamado "Comercial" (caso do AtlasGR, cujas vendas vivem em Lead, não em Negócio), a
 * lista vem vazia e a aba Negócios não tem o que mostrar — a pessoa usa a aba Leads nesse caso.
 */
export async function getDealPipelines(organizationId: string, connectionId: string): Promise<BitrixDealPipeline[]> {
    const webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);

    const data = await callBitrix<{ result: Array<{ ID: string; NAME: string }> }>(webhookUrl, 'crm.dealcategory.list', {});
    return data.result
        .filter((c) => c.NAME.trim().toLowerCase() === 'comercial')
        .map((c) => ({ id: c.ID, name: c.NAME }));
}

/** Lista as etapas de um pipeline específico de Negócio (STAGE_ID é prefixado por "C<pipeline>:"). */
export async function getDealStages(organizationId: string, connectionId: string, categoryId: string): Promise<BitrixDealStage[]> {
    const webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);

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
export async function getBitrixUsers(organizationId: string, connectionId: string): Promise<BitrixUserOption[]> {
    const webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);

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
    /** Busca parcial pelo título (nome da empresa/negócio) — resolvida no servidor do Bitrix. */
    search?: string;
}

/**
 * Lista uma página de Negócios do Bitrix24 para o usuário escolher o que importar — mesmo
 * princípio de listBitrixLeads (nunca grava sozinho). Filtros são resolvidos num objeto Bitrix
 * `filter` server-side, em vez de paginar tudo e filtrar no cliente (o portal tem centenas de
 * registros; filtrar aqui evita o usuário ter que passar página por página procurando).
 */
export async function listBitrixDeals(
    organizationId: string,
    connectionId: string,
    start: number,
    filters: BitrixDealFilters = {},
): Promise<{ deals: BitrixDealSummary[]; next: number | null; total: number }> {
    const webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);

    // Sem categoryId explícito ("Todos os pipelines" no filtro), resolve o pipeline Comercial e
    // filtra por ele mesmo assim — sem isso, "Todos" vazaria negócios de pipelines operacionais
    // (Financeiro, RH, Suporte...) que getDealPipelines já esconde da lista de opções. Se o portal
    // não tem pipeline Comercial (ex.: AtlasGR, cujas vendas vivem em Lead), não existe "todos os
    // negócios relevantes" pra cair como fallback — devolve vazio em vez de vazar o portal inteiro.
    let categoryId = filters.categoryId;
    if (!categoryId) {
        const [comercial] = await getDealPipelines(organizationId, connectionId);
        if (!comercial) return { deals: [], next: null, total: 0 };
        categoryId = comercial.id;
    }

    const filter: Record<string, unknown> = {};
    if (categoryId) filter.CATEGORY_ID = categoryId;
    if (filters.stageId) filter.STAGE_ID = filters.stageId;
    if (filters.assignedById) filter.ASSIGNED_BY_ID = filters.assignedById;
    if (filters.search?.trim()) filter['%TITLE'] = filters.search.trim();
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
        const stages = await getDealStages(organizationId, connectionId, categoryId);
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
    connectionId: string,
    bitrixDealIds: string[],
): Promise<{ imported: number; skipped: number }> {
    const webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);
    if (bitrixDealIds.length === 0) return { imported: 0, skipped: 0 };
    if (bitrixDealIds.length > 100) throw new AppError('Selecione no máximo 100 negócios por vez.', 400);

    let imported = 0;
    let skipped = 0;

    const existingDeals = await prisma.lead.findMany({
        where: { organizationId, bitrixDealId: { in: bitrixDealIds } },
        select: { bitrixDealId: true },
    });
    const existingIds = new Set(existingDeals.map((l) => l.bitrixDealId));

    for (const bitrixDealId of bitrixDealIds) {
        if (existingIds.has(bitrixDealId)) {
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
            ? (await getDealStages(organizationId, connectionId, deal.CATEGORY_ID)).find((s) => s.id === deal.STAGE_ID)?.name || deal.STAGE_ID
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
                status: LeadStatus.Lead_Recebido,
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

/** Testar saúde de uma conexão existente contra o Bitrix24. */
export async function testBitrixConnection(organizationId: string, connectionId: string): Promise<{ success: boolean; portalDomain: string }> {
    const webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);
    const { portalDomain } = await testWebhook(webhookUrl);
    return { success: true, portalDomain };
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

// ── Sincronização automática (regras) — ver bitrixSync.worker.ts ───────────────────────────────
//
// Diferente da importação manual acima (sempre por clique explícito), isto deixa o Atlas trazer
// negócios sozinho — mas só o que bate com uma regra que o usuário criou explicitamente aqui
// (pipeline + etapa/vendedor opcionais). Sem nenhuma regra ativa, nada acontece automaticamente;
// isto preserva a decisão original de não importar tudo do portal sem escopo (ver nota no topo
// deste arquivo sobre leads/negócios misturados com notificações de e-mail automáticas).

export interface BitrixSyncRuleInput {
    connectionId: string;
    source: 'lead' | 'deal';
    /** Obrigatório quando source="deal" (pipeline do Negócio); ignorado quando source="lead". */
    categoryId?: string | null;
    /** Etapa (Deal) ou status (Lead) — opcional nos dois casos. */
    stageId?: string | null;
    assignedById?: string | null;
}

export async function listSyncRules(organizationId: string, connectionId: string) {
    return prisma.bitrixSyncRule.findMany({ where: { organizationId, connectionId }, orderBy: { createdAt: 'desc' } });
}

export async function createSyncRule(organizationId: string, input: BitrixSyncRuleInput) {
    if (input.source === 'deal' && !input.categoryId) {
        throw new AppError('Informe o pipeline da regra.', 400);
    }
    // Confirma que a conexão realmente pertence a esta organização antes de gravar a regra —
    // sem isto, um connectionId de outro tenant passaria despercebido (RLS bloquearia a leitura
    // depois, mas o erro apareceria tarde demais, na primeira execução do worker).
    const connection = await prisma.bitrixConnection.findFirst({ where: { id: input.connectionId, organizationId } });
    if (!connection) throw new AppError('Conexão Bitrix24 não encontrada para esta organização.', 404);

    return prisma.bitrixSyncRule.create({
        data: {
            organizationId,
            connectionId: input.connectionId,
            source: input.source,
            categoryId: input.source === 'deal' ? input.categoryId : null,
            stageId: input.stageId || null,
            assignedById: input.assignedById || null,
        },
    });
}

export async function setSyncRuleActive(organizationId: string, ruleId: string, active: boolean) {
    const rule = await prisma.bitrixSyncRule.findFirst({ where: { id: ruleId, organizationId } });
    if (!rule) throw new AppError('Regra não encontrada.', 404);
    return prisma.bitrixSyncRule.update({ where: { id: ruleId }, data: { active } });
}

export async function deleteSyncRule(organizationId: string, ruleId: string): Promise<void> {
    const rule = await prisma.bitrixSyncRule.findFirst({ where: { id: ruleId, organizationId } });
    if (!rule) throw new AppError('Regra não encontrada.', 404);
    await prisma.bitrixSyncRule.delete({ where: { id: ruleId } });
}

// Trava de segurança por execução de regra: mesmo com um pipeline movimentado, uma regra nunca
// importa mais que isto numa única rodada do worker — evita que uma regra mal configurada (ex.:
// pipeline errado, sem etapa) inunde o CRM de uma vez só. O próximo tick pega o restante.
const MAX_AUTO_IMPORT_PER_RULE_PER_TICK = 25;

/** Executa uma única regra: busca registros não importados que batem com o filtro e importa até o teto por rodada. */
async function runSyncRule(
    organizationId: string,
    rule: { id: string; connectionId: string; source: string; categoryId: string | null; stageId: string | null; assignedById: string | null },
): Promise<number> {
    if (rule.source === 'lead') {
        const { leads } = await listBitrixLeads(organizationId, rule.connectionId, 0, {
            statusId: rule.stageId || undefined,
            assignedById: rule.assignedById || undefined,
        });
        const pendingIds = leads.filter((l) => !l.alreadyImported).map((l) => l.id).slice(0, MAX_AUTO_IMPORT_PER_RULE_PER_TICK);
        if (pendingIds.length === 0) return 0;
        const { imported } = await importSelectedBitrixLeads(organizationId, rule.connectionId, pendingIds);
        return imported;
    }

    if (!rule.categoryId) return 0; // regra "deal" mal formada (não deveria acontecer — createSyncRule já valida)
    const { deals } = await listBitrixDeals(organizationId, rule.connectionId, 0, {
        categoryId: rule.categoryId,
        stageId: rule.stageId || undefined,
        assignedById: rule.assignedById || undefined,
    });
    const pendingIds = deals.filter((d) => !d.alreadyImported).map((d) => d.id).slice(0, MAX_AUTO_IMPORT_PER_RULE_PER_TICK);
    if (pendingIds.length === 0) return 0;

    const { imported } = await importSelectedBitrixDeals(organizationId, rule.connectionId, pendingIds);
    return imported;
}

/**
 * Roda uma vez para TODAS as organizações com pelo menos uma regra ativa — chamado pelo worker
 * periódico (bitrixSync.worker.ts). Uma regra com erro (ex.: webhook desconectado nesse meio
 * tempo) não derruba as demais; cada uma registra seu próprio resultado.
 *
 * BitrixSyncRule tem RLS por tenant (como toda tabela de dado de cliente) — não está na allowlist
 * de bypass (essa allowlist é só para tabelas de identidade: User/Organization/Session/etc., ver
 * async-context.ts). Por isso a descoberta de "quais organizações existem" usa bypass só em cima
 * de Organization (que ESTÁ na allowlist), e cada regra é lida/gravada dentro do contexto de
 * tenant real dela — RLS de verdade, não uma exceção só pra este worker.
 */
export async function runBitrixSyncTick(): Promise<{ organizationsProcessed: number; totalImported: number }> {
    // IMPORTANTE: o callback do run() precisa dar `await` na query Prisma, não só retorná-la.
    // `prisma.model.findMany(...)` devolve um PrismaPromise "lazy" (um thenable customizado, não
    // uma Promise nativa) — a query só é de fato disparada (e o hook $allOperations de prisma.ts
    // só é chamado) quando algo dá `.then()`/`await` nela. Se o callback só faz
    // `() => prisma.organization.findMany(...)`, o `.then()` acontece no `await` DE FORA do
    // run(), depois que o AsyncLocalStorage já saiu de escopo — requestContext.getStore() então
    // chega `undefined` dentro de $allOperations e a query roda sem bypass_rls, sem achar nenhuma
    // organização. Confirmado via scripts/debug-als-hypothesis.ts.
    const organizations = await requestContext.run({ bypassRls: true }, async () => {
        return await prisma.organization.findMany({ select: { id: true } });
    });

    let organizationsProcessed = 0;
    let totalImported = 0;

    for (const { id: organizationId } of organizations) {
        await requestContext.run({ tenantId: organizationId }, async () => {
            const rules = await prisma.bitrixSyncRule.findMany({ where: { active: true } });
            if (rules.length === 0) return;
            organizationsProcessed++;

            for (const rule of rules) {
                try {
                    const imported = await runSyncRule(organizationId, rule);
                    totalImported += imported;
                    await prisma.bitrixSyncRule.update({
                        where: { id: rule.id },
                        data: { lastRunAt: new Date(), lastImportedCount: imported },
                    });
                    if (imported > 0) {
                        logger.info({ organizationId, ruleId: rule.id, imported }, '[bitrix] Regra de sincronização automática importou registros');
                    }
                } catch (err) {
                    logger.error({ err, organizationId, ruleId: rule.id }, '[bitrix] Falha ao executar regra de sincronização automática');
                }
            }
        });
    }

    return { organizationsProcessed, totalImported };
}
