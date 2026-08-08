import { prisma } from '../../../../lib/prisma.js';
import { logger } from '../../../../lib/logger.js';
import { AppError } from '../../../../shared/middlewares/errorHandler.js';
import { assertSafeWebhookUrl } from '../../../../lib/adapters/crm/Bitrix24Adapter.js';

export function normalizeWebhookUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

/**
 * Confirma que a URL realmente fala com um portal Bitrix24 antes de salvar — sem isto, um typo
 * na URL ou um token revogado só apareceria na hora de exportar o primeiro lead, silenciosamente
 * salvo como "conectado".
 */
export async function testWebhook(webhookUrl: string): Promise<{ portalDomain: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
        response = await fetch(`${webhookUrl}profile.json`, { signal: controller.signal });
    } catch (error) {
        if (controller.signal.aborted) {
            throw new AppError('Tempo limite esgotado ao testar essa URL (timeout 15s).', 504);
        }
        logger.warn({ err: error }, '[bitrix] Falha de rede ao testar webhook');
        throw new AppError('Não foi possível conectar a essa URL. Confira o endereço do webhook.', 400);
    } finally {
        clearTimeout(timeout);
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

export function hostnameOf(webhookUrl: string): string | null {
    try {
        return new URL(webhookUrl).hostname;
    } catch {
        return null;
    }
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

interface BitrixApiError {
    error: string;
    error_description?: string;
}

/** Cliente HTTP de baixo nível para a REST API do Bitrix24 (via webhook de entrada). */
export async function callBitrix<T>(webhookUrl: string, method: string, params?: Record<string, unknown>): Promise<T> {
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

let statusLabelCache: { webhookUrl: string; labels: Map<string, string> } | null = null;

/** ID → nome de exibição de cada etapa (inclui as etapas customizadas do cliente, ex: "Novo Lead (Distribuidoras)"). */
export async function getStatusLabels(webhookUrl: string): Promise<Map<string, string>> {
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
