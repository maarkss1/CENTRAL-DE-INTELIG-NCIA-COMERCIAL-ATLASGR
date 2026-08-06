import { prisma } from '../../../../lib/prisma.js';
import { logger } from '../../../../lib/logger.js';
import { AppError } from '../../../../shared/middlewares/errorHandler.js';
import { assertSafeWebhookUrl } from '../../../../lib/adapters/crm/Bitrix24Adapter.js';
import { normalizeWebhookUrl, testWebhook, hostnameOf, getConnectionWebhookUrl } from './client.js';

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

/** Testar saúde de uma conexão existente contra o Bitrix24. */
export async function testBitrixConnection(organizationId: string, connectionId: string): Promise<{ success: boolean; portalDomain: string }> {
    const webhookUrl = await getConnectionWebhookUrl(organizationId, connectionId);
    const { portalDomain } = await testWebhook(webhookUrl);
    return { success: true, portalDomain };
}
