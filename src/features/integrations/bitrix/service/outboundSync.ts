import { randomUUID } from 'node:crypto';
import { prisma } from '../../../../lib/prisma.js';
import { logger } from '../../../../lib/logger.js';
import { AppError } from '../../../../shared/middlewares/errorHandler.js';
import { AuditService } from '../../../../lib/audit/audit.service.js';
import { fromPrismaLeadStatus } from '../../../../lib/enumMap.js';
import { callBitrix, getConnectionWebhookUrl } from './client.js';
import { resolveEnumMaps, buildOutboundCustomFields } from './customFields.js';
import { bitrixSyncFailuresTotal } from './metrics.js';

export interface SyncLeadOverrides {
  /** STATUS_ID de destino no Bitrix — sem isto, o Bitrix aplica o status padrão do funil ao criar. */
  statusId?: string;
  /** ASSIGNED_BY_ID de destino — sem isto, o lead fica sem responsável definido no Bitrix. */
  assignedById?: string;
}

async function logSync(params: {
  organizationId: string;
  connectionId: string;
  direction: 'outbound';
  entityType: 'lead' | 'deal';
  leadId: string;
  bitrixRecordId: string | null;
  status: 'success' | 'failed';
  errorMessage?: string | null;
  correlationId: string;
}): Promise<void> {
  // Sinal agregado/acionável por alerta (bloqueador #11 de /AGENTS.md) — antes desta métrica, uma
  // falha de push só existia como uma linha de BitrixSyncLog, sem nenhum jeito de disparar um
  // alerta quando o mesmo tenant acumulasse várias falhas seguidas. Ver metrics.ts.
  if (params.status === 'failed') {
    bitrixSyncFailuresTotal.inc({ tenant: params.organizationId, entity: params.entityType });
  }
  await prisma.bitrixSyncLog
    .create({
      data: {
        organizationId: params.organizationId,
        connectionId: params.connectionId,
        direction: params.direction,
        entityType: params.entityType,
        leadId: params.leadId,
        bitrixRecordId: params.bitrixRecordId,
        status: params.status,
        errorMessage: params.errorMessage ?? null,
        correlationId: params.correlationId,
      },
    })
    .catch((err) => logger.error({ err, ...params }, '[bitrix] Falha ao gravar BitrixSyncLog'));
}

/**
 * Reivindica o direito de criar um NOVO lead no Bitrix para este registro (transição atômica
 * `bitrixLeadId: null` → `bitrixSyncStatus: 'syncing'`). Fecha a corrida em que duas exportações
 * concorrentes do MESMO lead local (ex.: duas abas, ou o botão manual + uma futura reexportação
 * em lote ao mesmo tempo) leriam `bitrixLeadId: null` e ambas chamariam `crm.lead.add`, criando
 * dois registros no Bitrix. `updateMany` com um `where` que inclui a condição é atômico no nível
 * do Postgres — só uma das chamadas concorrentes consegue `count === 1`.
 */
async function claimOutboundSync(leadId: string, organizationId: string): Promise<boolean> {
  const { count } = await prisma.lead.updateMany({
    where: { id: leadId, organizationId, bitrixLeadId: null, bitrixSyncStatus: { not: 'syncing' } },
    data: { bitrixSyncStatus: 'syncing' },
  });
  return count === 1;
}

/**
 * Envia (ou atualiza) um lead do Atlas como Lead no Bitrix24. Núcleo compartilhado pelas duas
 * entradas públicas abaixo — lança AppError em qualquer falha; cada chamador decide se propaga
 * (botão manual) ou engole (push automático). Sempre grava o resultado (sucesso ou falha) em
 * `Lead.bitrixSyncStatus`/`bitrixSyncError`/`bitrixSyncedAt` e em BitrixSyncLog — antes desta
 * correção uma falha do push automático só existia no log de aplicação, nunca na tela (achado
 * P1-3 da auditoria).
 */
async function syncLeadToBitrix(
  organizationId: string,
  connectionId: string,
  webhookUrl: string,
  leadId: string,
  overrides: SyncLeadOverrides = {},
): Promise<{ bitrixLeadId: string }> {
  const correlationId = randomUUID();
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId },
    include: { company: true, contact: true },
  });
  if (!lead) throw new AppError('Lead não encontrado.', 404);

  try {
    const statusLabel = fromPrismaLeadStatus(lead.status);
    const enumMaps = await resolveEnumMaps(webhookUrl, 'lead');
    const customFields = buildOutboundCustomFields(
      lead as unknown as Record<string, unknown>,
      lead.qualification as Record<string, unknown> | null,
      lead.contact as unknown as Record<string, unknown> | null,
      'lead',
      enumMaps,
    );

    // COMMENTS mantém um resumo curto (não mais o dump inteiro da qualificação — isso agora
    // vai estruturado nos UF_CRM_* via customFields acima, filtrável/relatável no próprio
    // Bitrix em vez de preso num campo de texto livre).
    const commentsParts = [
      lead.company?.observations,
      `Etapa no Atlas: ${statusLabel}`,
      lead.temperature ? `Temperatura: ${lead.temperature}` : null,
      lead.score != null ? `Fit Score: ${lead.score}` : null,
      lead.pic ? `Perfil (PIC): ${lead.pic}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const fields: Record<string, unknown> = {
      ...customFields,
      TITLE: lead.company?.tradeName || lead.company?.legalName || 'Lead Atlas',
      NAME: lead.contact?.name?.split(' ')[0],
      LAST_NAME: lead.contact?.name?.split(' ').slice(1).join(' ') || undefined,
      COMPANY_TITLE: lead.company?.legalName || lead.company?.tradeName,
      PHONE:
        lead.contact?.phone || lead.company?.phones?.[0]
          ? [{ VALUE: lead.contact?.phone || lead.company?.phones?.[0], VALUE_TYPE: 'WORK' }]
          : undefined,
      EMAIL:
        lead.contact?.email || lead.company?.emails?.[0]
          ? [{ VALUE: lead.contact?.email || lead.company?.emails?.[0], VALUE_TYPE: 'WORK' }]
          : undefined,
      SOURCE_ID: 'WEB',
      SOURCE_DESCRIPTION: 'AtlasGR Prospector',
      COMMENTS: commentsParts || undefined,
      ...(overrides.statusId ? { STATUS_ID: overrides.statusId } : {}),
      ...(overrides.assignedById ? { ASSIGNED_BY_ID: overrides.assignedById } : {}),
    };

    if (lead.bitrixLeadId) {
      await callBitrix(
        webhookUrl,
        'crm.lead.update',
        { id: lead.bitrixLeadId, fields },
        { correlationId },
      );
      await prisma.lead.update({
        where: { id: lead.id },
        data: { bitrixSyncStatus: 'synced', bitrixSyncError: null, bitrixSyncedAt: new Date() },
      });
      await logSync({
        organizationId,
        connectionId,
        direction: 'outbound',
        entityType: 'lead',
        leadId,
        bitrixRecordId: lead.bitrixLeadId,
        status: 'success',
        correlationId,
      });
      return { bitrixLeadId: lead.bitrixLeadId };
    }

    // Corrida entre exportações concorrentes do MESMO lead local — ver claimOutboundSync.
    // Não é um erro do usuário (a exportação vai simplesmente virar update na próxima
    // chamada, assim que o bitrixLeadId concorrente terminar de ser gravado), mas precisa
    // parar aqui em vez de arriscar criar um segundo lead no Bitrix.
    const claimed = await claimOutboundSync(lead.id, organizationId);
    if (!claimed) {
      throw new AppError(
        'Este lead já está sendo sincronizado com o Bitrix24 — tente novamente em alguns segundos.',
        409,
      );
    }

    // Deduplicação contra o Bitrix antes de criar: se já existe um Lead lá com o mesmo
    // e-mail/telefone (cadastrado manualmente, importado por outra via, ou de uma tentativa
    // anterior cujo bitrixLeadId não foi persistido por algum motivo), reaproveita esse
    // registro via update em vez de criar um duplicado. Best-effort: se crm.duplicate.findbycomm
    // falhar por qualquer razão (portal antigo sem o método, permissão insuficiente), segue
    // para crm.lead.add normalmente — dedup é uma melhoria, não um requisito bloqueante.
    const email = lead.contact?.email || lead.company?.emails?.[0] || null;
    const phone = lead.contact?.phone || lead.company?.phones?.[0] || null;
    const existingBitrixId = await findDuplicateBitrixLeadId(
      webhookUrl,
      { email, phone },
      correlationId,
    );

    if (existingBitrixId) {
      await callBitrix(
        webhookUrl,
        'crm.lead.update',
        { id: existingBitrixId, fields },
        { correlationId },
      );
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          bitrixLeadId: existingBitrixId,
          bitrixSyncStatus: 'synced',
          bitrixSyncError: null,
          bitrixSyncedAt: new Date(),
        },
      });
      await logSync({
        organizationId,
        connectionId,
        direction: 'outbound',
        entityType: 'lead',
        leadId,
        bitrixRecordId: existingBitrixId,
        status: 'success',
        correlationId,
      });
      logger.info(
        { correlationId, organizationId, leadId, bitrixLeadId: existingBitrixId },
        '[bitrix] Duplicidade evitada — lead local vinculado a um Lead Bitrix já existente (crm.duplicate.findbycomm)',
      );
      return { bitrixLeadId: existingBitrixId };
    }

    const { result: newId } = await callBitrix<{ result: string }>(
      webhookUrl,
      'crm.lead.add',
      { fields },
      { correlationId },
    );
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        bitrixLeadId: String(newId),
        bitrixSyncStatus: 'synced',
        bitrixSyncError: null,
        bitrixSyncedAt: new Date(),
      },
    });
    await callBitrix(
      webhookUrl,
      'crm.timeline.comment.add',
      {
        fields: {
          ENTITY_ID: newId,
          ENTITY_TYPE: 'lead',
          COMMENT: `Lead criado pelo AtlasGR Prospector.\nEtapa: ${statusLabel}${lead.score != null ? `\nFit Score: ${lead.score}` : ''}`,
        },
      },
      { correlationId },
    );
    await logSync({
      organizationId,
      connectionId,
      direction: 'outbound',
      entityType: 'lead',
      leadId,
      bitrixRecordId: String(newId),
      status: 'success',
      correlationId,
    });
    return { bitrixLeadId: String(newId) };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // bitrixSyncStatus só some de 'syncing' aqui em caso de erro — o caminho de sucesso acima
    // já sobrescreve para 'synced' antes de chegar neste catch.
    await prisma.lead
      .update({
        where: { id: lead.id },
        data: { bitrixSyncStatus: 'failed', bitrixSyncError: errorMessage },
      })
      .catch((updateErr) => {
        logger.error(
          { err: updateErr, leadId },
          '[bitrix] Falha ao registrar status de sync (failed) no lead',
        );
      });
    await logSync({
      organizationId,
      connectionId,
      direction: 'outbound',
      entityType: 'lead',
      leadId,
      bitrixRecordId: lead.bitrixLeadId,
      status: 'failed',
      errorMessage,
      correlationId,
    });
    throw err;
  }
}

/**
 * Registra um comentário na timeline do registro Bitrix vinculado a este lead local — usado pelo
 * módulo Comercial Inteligente para notificar um risco (negócio estagnado, sem próxima ação etc.)
 * direto no Bitrix, sem exigir que quem está no cockpit abra o Bitrix separadamente. Prioriza o
 * vínculo de Deal (bitrixDealId) sobre o de Lead: Comercial Inteligente só opera sobre o funil
 * "Negócio", que é o que o Bitrix normalmente representa como Deal quando importado por lá.
 */
export async function postCommentToBitrix(
  organizationId: string,
  leadId: string,
  comment: string,
): Promise<{ entityType: 'lead' | 'deal'; bitrixRecordId: string }> {
  const correlationId = randomUUID();
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId },
    select: { bitrixLeadId: true, bitrixDealId: true },
  });
  if (!lead) throw new AppError('Negócio não encontrado.', 404);

  const entityType = lead.bitrixDealId ? 'deal' : lead.bitrixLeadId ? 'lead' : null;
  const bitrixRecordId = lead.bitrixDealId || lead.bitrixLeadId;
  if (!entityType || !bitrixRecordId) {
    throw new AppError('Este negócio ainda não está vinculado a um registro do Bitrix24.', 400);
  }

  const connection = await prisma.bitrixConnection.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
  });
  if (!connection) throw new AppError('Bitrix24 não está conectado para esta organização.', 400);

  try {
    await callBitrix(
      connection.webhookUrl,
      'crm.timeline.comment.add',
      {
        fields: { ENTITY_ID: bitrixRecordId, ENTITY_TYPE: entityType, COMMENT: comment },
      },
      { correlationId },
    );
    await logSync({
      organizationId,
      connectionId: connection.id,
      direction: 'outbound',
      entityType,
      leadId,
      bitrixRecordId,
      status: 'success',
      correlationId,
    });
    return { entityType, bitrixRecordId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await logSync({
      organizationId,
      connectionId: connection.id,
      direction: 'outbound',
      entityType,
      leadId,
      bitrixRecordId,
      status: 'failed',
      errorMessage,
      correlationId,
    });
    throw err;
  }
}

interface BitrixDuplicateFindResult {
  result?: { LEAD?: string[] };
}

/** Consulta crm.duplicate.findbycomm por e-mail e depois por telefone — devolve o primeiro Lead ID encontrado, ou null. */
async function findDuplicateBitrixLeadId(
  webhookUrl: string,
  contact: { email: string | null; phone: string | null },
  correlationId: string,
): Promise<string | null> {
  for (const [type, value] of [
    ['EMAIL', contact.email],
    ['PHONE', contact.phone],
  ] as const) {
    if (!value) continue;
    try {
      const data = await callBitrix<BitrixDuplicateFindResult>(
        webhookUrl,
        'crm.duplicate.findbycomm',
        { type, values: [value], entity_type: 'LEAD' },
        { correlationId, maxAttempts: 1 },
      );
      const found = data.result?.LEAD?.[0];
      if (found) return found;
    } catch (err) {
      logger.debug(
        { err, type, correlationId },
        '[bitrix] crm.duplicate.findbycomm indisponível ou sem permissão — seguindo sem checagem de duplicidade',
      );
    }
  }
  return null;
}

/**
 * Chamado automaticamente sempre que um lead nasce no Atlas (ver promoteToCrm) — não precisa de
 * clique manual. Fire-and-forget por design: nunca propaga erro, já que o Bitrix é um sistema
 * secundário e uma falha aqui não pode impedir o lead de existir no Atlas.
 *
 * O `catch` abaixo continua só logando (correto — o Atlas não pode travar por causa do Bitrix),
 * mas `syncLeadToBitrix` agora grava o resultado em `Lead.bitrixSyncStatus`/`bitrixSyncError` e em
 * BitrixSyncLog ANTES de propagar o erro pra cá — a falha deixou de ser invisível na tela: o
 * LeadDetailDrawer lê esses campos para mostrar "Falha ao sincronizar" com o motivo (achado P1-3
 * da auditoria, antes só resolvido no log).
 */
export async function pushLeadToBitrix(organizationId: string, leadId: string): Promise<void> {
  const correlationId = randomUUID();
  try {
    const connection = await prisma.bitrixConnection.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    if (!connection) return;
    await syncLeadToBitrix(organizationId, connection.id, connection.webhookUrl, leadId);
    logger.info(
      { correlationId, organizationId, connectionId: connection.id, leadId },
      '[bitrix] Lead enviado automaticamente',
    );
  } catch (err) {
    logger.warn(
      { err, correlationId, organizationId, leadId },
      '[bitrix] Falha ao enviar lead automaticamente — motivo salvo em Lead.bitrixSyncError e BitrixSyncLog',
    );
  }
}

/** Suporta exportação individual OU em lote (quando leadId é omitido/undefined). */
export async function exportLeadToBitrixNow(
  organizationId: string,
  leadId?: string,
  connectionId?: string,
  overrides: SyncLeadOverrides = {},
): Promise<{ bitrixLeadId?: string; exportedCount?: number; skippedCount?: number }> {
  let webhookUrl: string;
  let resolvedConnectionId: string;
  if (connectionId) {
    webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);
    resolvedConnectionId = connectionId;
  } else {
    const connection = await prisma.bitrixConnection.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    if (!connection) throw new AppError('Bitrix24 não está conectado para esta organização.', 400);
    webhookUrl = connection.webhookUrl;
    resolvedConnectionId = connection.id;
  }

  if (leadId && leadId !== 'all') {
    const result = await syncLeadToBitrix(
      organizationId,
      resolvedConnectionId,
      webhookUrl,
      leadId,
      overrides,
    );
    await AuditService.log({
      action: 'EXPORT',
      entity: 'Lead',
      entityId: leadId,
      tenantId: organizationId,
      afterState: { bitrixLeadId: result.bitrixLeadId },
    });
    return result;
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
      await syncLeadToBitrix(organizationId, resolvedConnectionId, webhookUrl, l.id, overrides);
      exportedCount++;
    } catch (err) {
      logger.warn({ err, leadId: l.id }, '[bitrix] Falha ao exportar lead em lote');
      skippedCount++;
    }
  }

  await AuditService.log({
    action: 'EXPORT',
    entity: 'Lead',
    tenantId: organizationId,
    afterState: { exportedCount, skippedCount, total: leads.length },
  });
  return { exportedCount, skippedCount };
}
