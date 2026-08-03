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
