import { timingSafeEqual } from 'node:crypto';
import express, { Router, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { requestContext } from '../../../lib/async-context.js';
import { callBitrix } from './service/client.js';
import { resolveEnumMaps, applyInboundCustomFields } from './service/customFields.js';

// ── Webhook de ENTRADA (Bitrix → Atlas, "исходящий вебхук" no admin do portal) ──────────────────
//
// Antes desta rota, a sincronização Bitrix→Atlas era 100% poll (import manual + regra automática
// a cada 15 min, ver syncRules.ts) — nunca push. Esta rota é opt-in por conexão
// (BitrixConnection.inboundEventsEnabled, desligado por padrão) e propositalmente ESTREITA em
// escopo: ela só ATUALIZA leads/negócios JÁ IMPORTADOS (por bitrixLeadId/bitrixDealId existente),
// nunca cria um novo a partir de um evento cru — a mesma razão documentada em leads.ts pra
// importação nunca ser automática por padrão (o portal mistura prospecção real com notificações
// automáticas; um evento de webhook sozinho não tem contexto suficiente pra decidir se vale a
// pena virar um Lead novo no Atlas). Isso também fecha por construção o risco de loop
// Bitrix→webhook→Atlas→push→Bitrix→webhook: esta rota NUNCA chama pushLeadToBitrix/
// exportLeadToBitrixNow, só grava campos localmente.

const SUPPORTED_EVENTS: Record<string, { entity: 'lead' | 'deal'; idField: 'bitrixLeadId' | 'bitrixDealId' }> = {
    ONCRMLEADADD: { entity: 'lead', idField: 'bitrixLeadId' },
    ONCRMLEADUPDATE: { entity: 'lead', idField: 'bitrixLeadId' },
    ONCRMDEALADD: { entity: 'deal', idField: 'bitrixDealId' },
    ONCRMDEALUPDATE: { entity: 'deal', idField: 'bitrixDealId' },
};

function safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    // timingSafeEqual exige buffers do mesmo tamanho — um mismatch de tamanho já é "não bate",
    // sem vazar timing (o comprimento de um segredo gerado por nós não é informação sensível).
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}

async function logInbound(params: {
    organizationId: string; connectionId: string; entityType: 'lead' | 'deal';
    leadId: string | null; bitrixRecordId: string; status: 'success' | 'skipped' | 'failed'; errorMessage?: string;
}): Promise<void> {
    await prisma.bitrixSyncLog.create({
        data: {
            organizationId: params.organizationId,
            connectionId: params.connectionId,
            direction: 'inbound',
            entityType: params.entityType,
            leadId: params.leadId,
            bitrixRecordId: params.bitrixRecordId,
            status: params.status,
            errorMessage: params.errorMessage ?? null,
        },
    }).catch((err) => logger.error({ err, ...params }, '[bitrix] Falha ao gravar BitrixSyncLog do webhook de entrada'));
}

async function processEvent(
    organizationId: string,
    connectionId: string,
    webhookUrl: string,
    eventType: string,
    bitrixRecordId: string,
): Promise<void> {
    const spec = SUPPORTED_EVENTS[eventType];
    if (!spec) return;

    await requestContext.run({ tenantId: organizationId }, async () => {
        const lead = await prisma.lead.findFirst({ where: { organizationId, [spec.idField]: bitrixRecordId } });
        if (!lead) {
            // Registro ainda não importado — ver comentário de topo do arquivo sobre por que este
            // webhook nunca cria, só atualiza. Não é um erro: a pessoa pode nem querer este
            // registro no Atlas.
            await logInbound({ organizationId, connectionId, entityType: spec.entity, leadId: null, bitrixRecordId, status: 'skipped' });
            return;
        }

        try {
            const method = spec.entity === 'lead' ? 'crm.lead.get' : 'crm.deal.get';
            const { result: raw } = await callBitrix<{ result: Record<string, unknown> }>(webhookUrl, method, { id: bitrixRecordId });
            const enumMaps = await resolveEnumMaps(webhookUrl, spec.entity);
            const { qualification, leadFields: rawLeadFields, contactRole } = applyInboundCustomFields(raw, spec.entity, enumMaps);
            const { source: _ignorada, ...leadFields } = rawLeadFields;
            void _ignorada;

            const statusIdKey = spec.entity === 'lead' ? 'STATUS_ID' : 'STAGE_ID';
            const stageId = raw[statusIdKey] as string | undefined;

            await prisma.lead.update({
                where: { id: lead.id },
                data: {
                    ...(stageId ? { bitrixStageLabel: stageId } : {}),
                    ...(Object.keys(qualification).length > 0
                        ? { qualification: { ...(lead.qualification as Record<string, unknown> | null), ...qualification } }
                        : {}),
                    ...leadFields,
                } as Prisma.LeadUpdateInput,
            });

            if (contactRole && lead.contactId) {
                await prisma.contact.update({ where: { id: lead.contactId }, data: { role: contactRole } }).catch(() => { /* contato pode ter sido removido — não bloqueia o resto */ });
            }

            await logInbound({ organizationId, connectionId, entityType: spec.entity, leadId: lead.id, bitrixRecordId, status: 'success' });
            logger.info({ organizationId, connectionId, leadId: lead.id, bitrixRecordId, eventType }, '[bitrix] Lead atualizado via webhook de entrada');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            await logInbound({ organizationId, connectionId, entityType: spec.entity, leadId: lead.id, bitrixRecordId, status: 'failed', errorMessage });
            throw err;
        }
    });
}

async function handleWebhook(req: Request, res: Response): Promise<void> {
    const connectionId = req.params.connectionId;
    const body = req.body as Record<string, unknown>;
    const auth = body?.auth as Record<string, unknown> | undefined;
    const applicationToken = typeof auth?.application_token === 'string' ? auth.application_token : null;

    if (!applicationToken) {
        res.status(400).json({ success: false, error: 'application_token ausente.' });
        return;
    }

    // bypassRls só cobre ESTE lookup por id (ver allowlist em src/lib/prisma.ts) — não há tenant
    // conhecido ainda nesta linha, só o connectionId da URL. Toda leitura/escrita seguinte roda
    // dentro de requestContext.run({ tenantId: connection.organizationId }) com RLS normal.
    const connection = await requestContext.run({ bypassRls: true }, () =>
        prisma.bitrixConnection.findUnique({ where: { id: connectionId } }));

    if (!connection || !connection.inboundEventsEnabled || !connection.webhookSecret) {
        // 404 genérico — não confirma nem nega se o connectionId existe, para não dar pista a
        // quem estiver testando URLs às cegas.
        res.status(404).json({ success: false, error: 'Não encontrado.' });
        return;
    }

    if (!safeEqual(applicationToken, connection.webhookSecret)) {
        logger.warn({ connectionId }, '[bitrix] Webhook de entrada com application_token inválido — descartado');
        res.status(401).json({ success: false, error: 'Token inválido.' });
        return;
    }

    const eventType = typeof body.event === 'string' ? body.event : '';
    const dataFields = (body.data as Record<string, unknown> | undefined)?.FIELDS as Record<string, unknown> | undefined;
    const bitrixRecordId = dataFields?.ID != null ? String(dataFields.ID) : null;

    if (!SUPPORTED_EVENTS[eventType] || !bitrixRecordId) {
        // Eventos que não tratamos (ex.: ONCRMCONTACTADD) são aceitos de propósito — devolver erro
        // faria o admin do Bitrix mostrar o webhook como "falhando" por eventos que nunca vamos
        // processar. Mesmo padrão do webhook do SDR de voz (birthVoice.webhook.ts).
        res.status(200).json({ success: true, ignored: eventType || 'sem evento reconhecido' });
        return;
    }

    try {
        await processEvent(connection.organizationId, connection.id, connection.webhookUrl, eventType, bitrixRecordId);
        res.status(200).json({ success: true });
    } catch (error) {
        logger.error({ err: error, connectionId, eventType, bitrixRecordId }, '[bitrix] Falha ao processar evento do webhook de entrada');
        res.status(500).json({ success: false, error: 'Falha ao processar evento.' });
    }
}

const router = Router();

// express.urlencoded porque o webhook de saída do Bitrix ("исходящий вебхук") envia
// application/x-www-form-urlencoded por padrão, com chaves aninhadas (auth[application_token],
// data[FIELDS][ID]) — extended:true faz o qs expandir isso em objetos aninhados de verdade. Esta
// rota é montada antes do express.json() global em server.ts, mesmo padrão do webhook do SDR de
// voz (birthVoice.webhook.ts) e do 3CX.
router.post('/webhook/:connectionId', express.urlencoded({ extended: true, limit: '256kb' }), handleWebhook);

export const bitrixWebhookRoutes = router;
