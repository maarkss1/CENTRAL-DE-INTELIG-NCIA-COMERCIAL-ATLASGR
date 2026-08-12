import { randomBytes } from 'node:crypto';
import { prisma } from '../../../../lib/prisma.js';
import { logger } from '../../../../lib/logger.js';
import { env } from '../../../../config/env.js';
import { AppError } from '../../../../shared/middlewares/errorHandler.js';
import { AuditService } from '../../../../lib/audit/audit.service.js';
import { assertSafeWebhookUrl } from '../../../../lib/adapters/crm/Bitrix24Adapter.js';
import { normalizeWebhookUrl, testWebhook, hostnameOf, getConnectionWebhookUrl } from './client.js';

export interface BitrixConnectionSummary {
    id: string;
    label: string;
    portalDomain: string | null;
    /** Endpoint que este portal deve chamar (webhook de saída/"исходящий вебхук" no admin do Bitrix). */
    webhookReceiverUrl: string;
    hasWebhookSecret: boolean;
    inboundEventsEnabled: boolean;
}

function buildWebhookReceiverUrl(connectionId: string): string {
    // Mesma variável já usada pelo callback OAuth do Google (ver .env.example) — o servidor não
    // sabe seu próprio domínio público (proxy reverso/Render), então sem isto a URL mostrada na
    // tela seria sempre um caminho relativo/localhost, inútil pra colar num Bitrix real.
    const base = (env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    return `${base}/api/integrations/bitrix/webhook/${connectionId}`;
}

export const ATLAS_BITRIX_WEBHOOK_URL = process.env.BITRIX_WEBHOOK_URL || 'https://atlasgr.bitrix24.com.br/rest/450/xa4srbrft9jpe880/';
export const TOTALTRAC_BITRIX_WEBHOOK_URL = process.env.TOTALTRAC_BITRIX_WEBHOOK_URL || 'https://totaltrac.bitrix24.com.br/rest/2486/qq9u2cn62c8sfkxy/';

/** Lista todos os portais Bitrix conectados desta organização — se não houver nenhum, autoconecta o webhook específico da empresa (TotalTrac x AtlasGR). */
export async function listBitrixConnections(organizationId: string): Promise<BitrixConnectionSummary[]> {
    let connections = await prisma.bitrixConnection.findMany({
        where: { organizationId },
        select: { id: true, label: true, webhookUrl: true, webhookSecret: true, inboundEventsEnabled: true },
        orderBy: { createdAt: 'asc' },
    });

    if (connections.length === 0) {
        try {
            const org = await prisma.organization.findUnique({
                where: { id: organizationId },
                select: { name: true },
            });
            const orgName = (org?.name || '').toLowerCase();
            const isTotalTrac = orgName.includes('totaltrac') || orgName.includes('total track');

            const defaultWebhook = isTotalTrac ? TOTALTRAC_BITRIX_WEBHOOK_URL : ATLAS_BITRIX_WEBHOOK_URL;
            const defaultLabel = isTotalTrac ? 'TotalTrac Bitrix24' : 'AtlasGR Bitrix24';

            await connectBitrix(organizationId, defaultWebhook, defaultLabel);
            connections = await prisma.bitrixConnection.findMany({
                where: { organizationId },
                select: { id: true, label: true, webhookUrl: true, webhookSecret: true, inboundEventsEnabled: true },
                orderBy: { createdAt: 'asc' },
            });
        } catch (err) {
            logger.warn({ err, organizationId }, 'Não foi possível autoconectar o webhook padrão do Bitrix24.');
        }
    }

    return connections.map((c) => ({
        id: c.id,
        label: c.label,
        portalDomain: hostnameOf(c.webhookUrl),
        webhookReceiverUrl: buildWebhookReceiverUrl(c.id),
        hasWebhookSecret: Boolean(c.webhookSecret),
        inboundEventsEnabled: c.inboundEventsEnabled,
    }));
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

    await AuditService.log({ action: 'INTEGRATION_CONNECTED', entity: 'BitrixConnection', entityId: connection.id, tenantId: organizationId, afterState: { portalDomain, label } });
    logger.info({ organizationId, connectionId: connection.id, portalDomain }, '[bitrix] Webhook conectado');
    return { id: connection.id, portalDomain };
}

export async function disconnectBitrix(organizationId: string, connectionId: string): Promise<void> {
    const { count } = await prisma.bitrixConnection.deleteMany({ where: { id: connectionId, organizationId } });
    if (count > 0) {
        await AuditService.log({ action: 'DELETE', entity: 'BitrixConnection', entityId: connectionId, tenantId: organizationId });
    }
}

/**
 * Gera (ou substitui) o segredo do webhook de ENTRADA — comparado contra `auth.application_token`
 * de todo evento recebido em bitrix.webhook.ts antes de aceitar o payload. Devolvido em texto puro
 * SÓ nesta resposta (a pessoa cola no admin do Bitrix agora); leituras seguintes só confirmam que
 * um segredo existe (`hasWebhookSecret`), nunca o valor.
 */
export async function regenerateWebhookSecret(organizationId: string, connectionId: string): Promise<{ webhookSecret: string; webhookReceiverUrl: string }> {
    const connection = await prisma.bitrixConnection.findFirst({ where: { id: connectionId, organizationId } });
    if (!connection) throw new AppError('Conexão Bitrix24 não encontrada para esta organização.', 404);

    const webhookSecret = randomBytes(32).toString('hex');
    await prisma.bitrixConnection.update({ where: { id: connectionId }, data: { webhookSecret } });
    await AuditService.log({ action: 'UPDATE', entity: 'BitrixConnection', entityId: connectionId, tenantId: organizationId, afterState: { webhookSecretRegenerated: true } });
    return { webhookSecret, webhookReceiverUrl: buildWebhookReceiverUrl(connectionId) };
}

export async function setInboundEventsEnabled(organizationId: string, connectionId: string, enabled: boolean): Promise<void> {
    const connection = await prisma.bitrixConnection.findFirst({ where: { id: connectionId, organizationId } });
    if (!connection) throw new AppError('Conexão Bitrix24 não encontrada para esta organização.', 404);
    if (enabled && !connection.webhookSecret) {
        throw new AppError('Gere o segredo do webhook de entrada antes de ativar o recebimento de eventos.', 400);
    }
    await prisma.bitrixConnection.update({ where: { id: connectionId }, data: { inboundEventsEnabled: enabled } });
    await AuditService.log({ action: 'UPDATE', entity: 'BitrixConnection', entityId: connectionId, tenantId: organizationId, afterState: { inboundEventsEnabled: enabled } });
}

/** Testar saúde de uma conexão existente contra o Bitrix24. */
export async function testBitrixConnection(organizationId: string, connectionId: string): Promise<{ success: boolean; portalDomain: string }> {
    const webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);
    const { portalDomain } = await testWebhook(webhookUrl);
    return { success: true, portalDomain };
}
