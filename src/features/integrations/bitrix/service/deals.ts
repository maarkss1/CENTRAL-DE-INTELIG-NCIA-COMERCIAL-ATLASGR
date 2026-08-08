import { prisma } from '../../../../lib/prisma.js';
import { LeadStatus } from '@prisma/client';
import { logger } from '../../../../lib/logger.js';
import { AppError } from '../../../../shared/middlewares/errorHandler.js';
import { callBitrix, getConnectionWebhookUrl } from './client.js';

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
