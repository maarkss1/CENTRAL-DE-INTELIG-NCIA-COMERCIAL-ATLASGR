import { prisma } from '../../../../lib/prisma.js';
import { LeadStatus, type Prisma } from '@prisma/client';
import { logger } from '../../../../lib/logger.js';
import { AppError } from '../../../../shared/middlewares/errorHandler.js';
import { AuditService } from '../../../../lib/audit/audit.service.js';
import { callBitrix, getStatusLabels, getConnectionWebhookUrl } from './client.js';
import { resolveEnumMaps, applyInboundCustomFields } from './customFields.js';
import { BITRIX_FIELD_MAP } from '../bitrixFieldMap.js';
import { getBitrixUsers, type BitrixDealStage } from './deals.js';
import { resolveAtlasUserIdByEmail } from './userMapping.js';
import { findOwnershipConflict, notifyOwnershipConflict } from './ownershipGuard.js';

const LEAD_UF_CRM_CODES = BITRIX_FIELD_MAP.map((m) => m.leadCode).filter((c): c is string =>
  Boolean(c),
);

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
  ASSIGNED_BY_ID?: string;
  // Índice aberto para os UF_CRM_* de BITRIX_FIELD_MAP — pedidos explicitamente no `select` de
  // listBitrixLeads/crm.lead.get e lidos por applyInboundCustomFields (service/customFields.ts).
  [ufCrmCode: string]: unknown;
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
export async function getLeadStatuses(
  organizationId: string,
  connectionId: string,
): Promise<BitrixDealStage[]> {
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
  /** Filtro por valor exato de um campo qualquer (ex.: UF_CRM_1234567890) — código resolvido
   * via getEntityFields, valor digitado livremente pela pessoa na tela. Os dois precisam vir
   * juntos; um sem o outro é ignorado. */
  customFieldCode?: string;
  customFieldValue?: string;
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
  if (filters.customFieldCode && filters.customFieldValue?.trim())
    filter[filters.customFieldCode] = filters.customFieldValue.trim();

  const [data, labels] = await Promise.all([
    callBitrix<{ result: BitrixLeadRaw[]; next?: number; total: number }>(
      webhookUrl,
      'crm.lead.list',
      {
        filter,
        // UF_CRM_* incluídos aqui (não só em crm.lead.get) para que a importação em massa via
        // regra automática (runSyncRule) também traga os campos de qualificação — sem isso a
        // paginação corrigida em runSyncRule ainda importaria leads "vazios" de qualificação.
        select: [
          'ID',
          'TITLE',
          'NAME',
          'LAST_NAME',
          'COMPANY_TITLE',
          'PHONE',
          'EMAIL',
          'STATUS_ID',
          'SOURCE_ID',
          'DATE_CREATE',
          'ASSIGNED_BY_ID',
          ...LEAD_UF_CRM_CODES,
        ],
        order: { DATE_CREATE: 'DESC' },
        start,
      },
    ),
    getStatusLabels(webhookUrl),
  ]);

  const bitrixIds = data.result.map((r) => r.ID);
  const imported =
    bitrixIds.length > 0
      ? await prisma.lead.findMany({
          where: { organizationId, bitrixLeadId: { in: bitrixIds } },
          select: { bitrixLeadId: true },
        })
      : [];
  const importedIds = new Set(imported.map((l) => l.bitrixLeadId));

  const leads: BitrixLeadSummary[] = data.result.map((raw) => ({
    id: raw.ID,
    title:
      raw.TITLE ||
      raw.COMPANY_TITLE ||
      `${raw.NAME || ''} ${raw.LAST_NAME || ''}`.trim() ||
      `Lead #${raw.ID}`,
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

/**
 * Varre páginas de crm.lead.list (seguindo o cursor `next`) até juntar `limit` IDs ainda não
 * importados ou esgotar o portal — usada pelos dois caminhos de importação automática (regra de
 * sync e o botão rápido "Sincronizar Bitrix24"). Sem isto, os dois só enxergavam a primeira
 * página (padrão 50 registros) do Bitrix; se ela já estivesse toda importada, nada além dela era
 * alcançado, para sempre (achado P0-2 da auditoria).
 *
 * `maxPagesScanned` é uma trava de segurança por chamada (não por conta/regra): evita que um
 * portal com dezenas de milhares de leads, todos já importados, prenda o worker varrendo páginas
 * indefinidamente numa única rodada. Quando o teto é atingido antes de achar `limit` registros, o
 * chamador é avisado via `pagesExhausted: false` para poder logar que a varredura não foi completa.
 */
export async function findUnimportedBitrixLeadIds(
  organizationId: string,
  connectionId: string,
  limit: number,
  filters: BitrixLeadFilters = {},
  maxPagesScanned = 20,
): Promise<{ ids: string[]; pagesExhausted: boolean; pagesScanned: number }> {
  const ids: string[] = [];
  let start: number | null = 0;
  let pagesScanned = 0;

  while (start !== null && ids.length < limit && pagesScanned < maxPagesScanned) {
    const page = await listBitrixLeads(organizationId, connectionId, start, filters);
    pagesScanned++;
    for (const lead of page.leads) {
      if (!lead.alreadyImported) ids.push(lead.id);
      if (ids.length >= limit) break;
    }
    start = page.next;
  }

  return { ids: ids.slice(0, limit), pagesExhausted: start === null, pagesScanned };
}

/**
 * Importa só os leads cujo ID a pessoa marcou na tela (ou que findUnimportedBitrixLeadIds
 * selecionou) — pula o que já foi importado antes. A checagem prévia (`findFirst`) cobre o caso
 * comum (reimportar a mesma seleção); a constraint `@@unique([organizationId, bitrixLeadId])` no
 * schema cobre a corrida genuína (dois imports concorrentes do mesmo ID — ex.: clique manual e
 * tick do worker automático ao mesmo tempo): se os dois passarem pelo `findFirst` antes de o
 * primeiro `create` commitar, o segundo `create` falha com P2002 e é contado como `skipped` em
 * vez de derrubar o lote inteiro ou duplicar o lead.
 */
export async function importSelectedBitrixLeads(
  organizationId: string,
  connectionId: string,
  bitrixLeadIds: string[],
  /** Quando informado (usuário CLOSER/SDR — ver bitrix.routes.ts), qualquer lead cujo ASSIGNED_BY_ID
   * não bata é ignorado, mesmo que o ID tenha vindo explícito no corpo da requisição — a lista já
   * vem filtrada pela mesma trava, mas isso fecha a brecha de alguém montar a requisição na mão. */
  restrictToAssignedById?: string,
): Promise<{
  imported: number;
  skipped: number;
  skippedConflicts: number;
  skippedNotOwned: number;
  failed: number;
  /** IDs (Atlas) dos leads criados nesta chamada — usado pelo painel de importação para aplicar
   * configurações pós-import (ex.: temperatura inicial) só nos registros realmente novos. */
  importedLeadIds: string[];
}> {
  const webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);
  if (bitrixLeadIds.length === 0)
    return {
      imported: 0,
      skipped: 0,
      skippedConflicts: 0,
      skippedNotOwned: 0,
      failed: 0,
      importedLeadIds: [],
    };
  if (bitrixLeadIds.length > 100) throw new AppError('Selecione no máximo 100 leads por vez.', 400);

  const [labels, enumMaps, bitrixUsers] = await Promise.all([
    getStatusLabels(webhookUrl),
    resolveEnumMaps(webhookUrl, 'lead'),
    getBitrixUsers(organizationId, connectionId),
  ]);
  const bitrixUserEmailById = new Map(bitrixUsers.map((u) => [u.id, u.email]));
  let imported = 0;
  let skipped = 0;
  let skippedConflicts = 0;
  let skippedNotOwned = 0;
  let failed = 0;
  const importedLeadIds: string[] = [];

  for (const bitrixLeadId of bitrixLeadIds) {
    // Todo o corpo por item vive dentro deste try/catch externo: antes, uma exceção não-P2002
    // (ex.: callBitrix esgotando retries, timeout de rede, erro de DB) propagava pra fora do loop
    // inteiro e derrubava a importação completa, descartando os contadores já coletados — o
    // frontend (BitrixImportPanel.tsx) mostrava "falha ao importar" mesmo quando N-1 itens já
    // tinham sido criados de verdade. Agora cada item falho é contado em `failed` e a importação
    // continua para os demais.
    try {
      const existing = await prisma.lead.findFirst({
        where: { organizationId, bitrixLeadId },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const { result: raw } = await callBitrix<{ result: BitrixLeadRaw }>(
        webhookUrl,
        'crm.lead.get',
        { id: bitrixLeadId },
      );
      if (restrictToAssignedById && raw.ASSIGNED_BY_ID !== restrictToAssignedById) {
        skippedNotOwned++;
        continue;
      }
      const tradeName =
        raw.TITLE ||
        raw.COMPANY_TITLE ||
        `${raw.NAME || ''} ${raw.LAST_NAME || ''}`.trim() ||
        `Lead Bitrix #${raw.ID}`;
      const contactName = [raw.NAME, raw.LAST_NAME].filter(Boolean).join(' ');
      const phone = raw.PHONE?.[0]?.VALUE || null;
      const email = raw.EMAIL?.[0]?.VALUE || null;
      const {
        qualification,
        leadFields: rawLeadFields,
        contactRole,
      } = applyInboundCustomFields(raw, 'lead', enumMaps);
      // `source` (mapeado da "Origem" do Bitrix) não pode sobrescrever a tag fixa
      // 'Bitrix24 (importado)' abaixo — ela marca COMO o registro entrou no Atlas (rastreável em
      // relatórios de funil), não a origem de marketing original, que já não temos onde guardar
      // separadamente sem introduzir uma coluna nova fora do escopo desta correção.
      const { source: _bitrixOrigemIgnorada, ...leadFields } = rawLeadFields;
      void _bitrixOrigemIgnorada;

      const assigneeEmail = raw.ASSIGNED_BY_ID
        ? (bitrixUserEmailById.get(raw.ASSIGNED_BY_ID) ?? null)
        : null;
      // Lead.owner grava User.id (não o nome) para casar com a convenção de leads criados no
      // app — ver .agents/handoffs/onda-7/04-para-06-owner-bitrix-nome-nao-id.md.
      const ownerId = await resolveAtlasUserIdByEmail(organizationId, assigneeEmail);

      const conflict = await findOwnershipConflict(organizationId, { phone, email }, ownerId);
      if (conflict) {
        skippedConflicts++;
        await notifyOwnershipConflict(organizationId, conflict, tradeName);
        logger.info(
          { organizationId, bitrixLeadId, conflict },
          '[bitrix] Import bloqueado — contato já pertence a outro responsável',
        );
        continue;
      }

      try {
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
              data: {
                name: contactName,
                phone,
                email,
                role: contactRole,
                companyId: company.id,
                organizationId,
              },
            })
          : null;

        const lead = await prisma.lead.create({
          data: {
            status: LeadStatus.Lead_Recebido,
            source: 'Bitrix24 (importado)',
            companyId: company.id,
            contactId: contact?.id,
            organizationId,
            owner: ownerId,
            bitrixLeadId: raw.ID,
            bitrixStageLabel: (raw.STATUS_ID && labels.get(raw.STATUS_ID)) || raw.STATUS_ID || null,
            qualification: Object.keys(qualification).length > 0 ? qualification : undefined,
            ...leadFields,
          } as Prisma.LeadCreateInput,
        });
        imported++;
        importedLeadIds.push(lead.id);
        await AuditService.log({
          action: 'IMPORT',
          entity: 'Lead',
          entityId: lead.id,
          tenantId: organizationId,
          afterState: { bitrixLeadId: raw.ID, source: 'crm.lead.get' },
        });
      } catch (err) {
        // P2002 = violação da unique constraint (organizationId, bitrixLeadId) — corrida real
        // com outra importação do MESMO registro entre o findFirst acima e este create. Não é
        // um erro de verdade: o resultado (lead existe, vinculado a este bitrixLeadId) é o
        // mesmo que se este loop tivesse simplesmente perdido a corrida — conta como skipped.
        if ((err as { code?: string })?.code === 'P2002') {
          skipped++;
          logger.info(
            { organizationId, bitrixLeadId },
            '[bitrix] Import concorrente do mesmo lead detectado (unique constraint) — contado como já importado',
          );
        } else {
          throw err;
        }
      }
    } catch (err) {
      failed++;
      logger.error(
        { err, organizationId, bitrixLeadId },
        '[bitrix] Falha ao importar item — contabilizado como falha, importação continua para os demais',
      );
    }
  }

  logger.info(
    { organizationId, imported, skipped, skippedConflicts, skippedNotOwned, failed },
    '[bitrix] Importação seletiva concluída',
  );
  return { imported, skipped, skippedConflicts, skippedNotOwned, failed, importedLeadIds };
}
