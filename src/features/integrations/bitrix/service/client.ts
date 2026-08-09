import { randomUUID } from 'node:crypto';
import { prisma } from '../../../../lib/prisma.js';
import { logger } from '../../../../lib/logger.js';
import { AppError } from '../../../../shared/middlewares/errorHandler.js';
import { assertSafeWebhookUrl } from '../../../../lib/adapters/crm/Bitrix24Adapter.js';

export function normalizeWebhookUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

// ── Resiliência de chamadas ao Bitrix24 (bloqueador #11 do AGENTS.md: "sincronização não pode
// falhar silenciosamente") ──────────────────────────────────────────────────────────────────────
//
// Parâmetros alinhados ao extrator de referência do usuário (extrator_bitrix.html) e ao limite
// documentado do Bitrix (~2 chamadas/seg em ritmo sustentado por webhook): timeout por tentativa,
// backoff exponencial com jitter, teto de tentativas, e classificação explícita de erro
// recuperável (rede, timeout, 429/QUERY_LIMIT_EXCEEDED, 5xx) vs. definitivo (401/403/token
// revogado, filtro/campo inválido) — erro definitivo nunca é retentado, porque bater na mesma
// causa 4 vezes só atrasa o feedback ao usuário sem chance real de sucesso.
export const BITRIX_MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;
const REQUEST_TIMEOUT_MS = 15_000;

/** Erro definitivo do Bitrix (não recuperável por retry) — carrega o correlationId para rastreio nos logs. */
export class BitrixDefinitiveError extends AppError {
    constructor(message: string, statusCode: number, public readonly correlationId: string) {
        super(message, statusCode);
    }
}

function backoffDelayMs(attempt: number): number {
    const exp = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
    // Jitter de até 25% — evita que múltiplas regras/organizações reintentem exatamente no mesmo
    // instante e gerem um pico coordenado de chamadas contra o mesmo portal.
    return exp + Math.random() * exp * 0.25;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extrai o Retry-After (segundos) de uma resposta 429, quando o Bitrix o envia. */
function retryAfterMs(response: Response): number | null {
    const header = response.headers.get('retry-after');
    if (!header) return null;
    const seconds = Number(header);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
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

export interface BitrixCallOptions {
    /** Amarra todas as tentativas de uma mesma chamada lógica (e, se o chamador propagar, todo o
     * lote/tick de sincronização) num único id — sem isso, cinco tentativas da mesma chamada viram
     * cinco linhas de log soltas, impossíveis de correlacionar numa falha intermitente. */
    correlationId?: string;
    /** Sobrescreve o teto de tentativas — usado nos testes para não esperar segundos de backoff real. */
    maxAttempts?: number;
}

/** Um único attempt HTTP contra o Bitrix — sem retry, sem classificação. `callBitrix` orquestra por cima disto. */
async function attemptBitrixCall<T>(webhookUrl: string, method: string, params: Record<string, unknown> | undefined, correlationId: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
        response = await fetch(`${webhookUrl}${method}.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params || {}),
            signal: controller.signal,
        });
    } catch (err) {
        clearTimeout(timeout);
        if (controller.signal.aborted) {
            throw new TransientBitrixError(`Tempo limite esgotado ao comunicar com o Bitrix24 (timeout ${REQUEST_TIMEOUT_MS / 1000}s).`, 504);
        }
        // Falha de rede (DNS, conexão recusada, etc.) — recuperável, o próximo attempt pode ter sucesso.
        throw new TransientBitrixError('Falha de rede ao comunicar com o Bitrix24.', 502, err);
    }
    clearTimeout(timeout);

    if (response.status === 429) {
        throw new TransientBitrixError('Bitrix24 aplicou limite de chamadas (HTTP 429).', 429, undefined, retryAfterMs(response) ?? undefined);
    }
    if (response.status >= 500) {
        throw new TransientBitrixError(`Bitrix24 respondeu com erro de servidor (HTTP ${response.status}).`, 502);
    }
    if (response.status === 401 || response.status === 403) {
        throw new BitrixDefinitiveError('Webhook do Bitrix24 sem permissão ou token revogado — reconecte o portal.', response.status, correlationId);
    }

    const data = (await response.json().catch(() => null)) as (T & { error?: string; error_description?: string }) | null;
    if (!response.ok) {
        throw new BitrixDefinitiveError(`Bitrix24 respondeu com erro (HTTP ${response.status}).`, 502, correlationId);
    }
    const apiError = (data as unknown as BitrixApiError | null)?.error;
    if (apiError) {
        // QUERY_LIMIT_EXCEEDED é o rate-limit "soft" reportado no corpo (em vez de HTTP 429) — mesmo
        // tratamento de recuperável. Qualquer outro erro do Bitrix (filtro inválido, campo
        // inexistente, permissão insuficiente) é definitivo: retentar não muda o resultado.
        if (apiError === 'QUERY_LIMIT_EXCEEDED') {
            throw new TransientBitrixError('Bitrix24 aplicou limite de chamadas (QUERY_LIMIT_EXCEEDED).', 429);
        }
        const description = (data as unknown as BitrixApiError).error_description;
        throw new BitrixDefinitiveError(description || `Bitrix24 recusou a chamada (${apiError}).`, 400, correlationId);
    }
    if (!data) {
        throw new BitrixDefinitiveError('Bitrix24 devolveu uma resposta vazia/ilegível.', 502, correlationId);
    }
    return data;
}

/** Erro recuperável — `callBitrix` reintenta com backoff até `maxAttempts`. Nunca chega ao chamador. */
class TransientBitrixError extends Error {
    constructor(message: string, public readonly statusCode: number, public readonly cause?: unknown, public readonly retryAfterMsHint?: number) {
        super(message);
    }
}

/**
 * Cliente HTTP de baixo nível para a REST API do Bitrix24 (via webhook de entrada). Reintenta
 * automaticamente falha de rede, timeout, HTTP 429/5xx e `QUERY_LIMIT_EXCEEDED`, com backoff
 * exponencial + jitter; erro de autenticação/autorização ou erro definitivo do Bitrix (filtro,
 * campo, permissão) falha imediatamente, sem consumir tentativas à toa.
 */
export async function callBitrix<T>(webhookUrl: string, method: string, params?: Record<string, unknown>, options: BitrixCallOptions = {}): Promise<T> {
    await assertSafeWebhookUrl(webhookUrl);
    const correlationId = options.correlationId ?? randomUUID();
    const maxAttempts = options.maxAttempts ?? BITRIX_MAX_ATTEMPTS;

    let lastError: TransientBitrixError | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await attemptBitrixCall<T>(webhookUrl, method, params, correlationId);
        } catch (err) {
            if (err instanceof BitrixDefinitiveError) {
                logger.warn({ correlationId, method, statusCode: err.statusCode, attempt }, '[bitrix] Erro definitivo — não será retentado');
                throw err;
            }
            if (!(err instanceof TransientBitrixError)) throw err; // erro inesperado (bug de código) — propaga cru
            lastError = err;
            logger.warn({ correlationId, method, statusCode: err.statusCode, attempt, maxAttempts }, '[bitrix] Falha recuperável — ' + (attempt < maxAttempts ? 'retentando' : 'tentativas esgotadas'));
            if (attempt < maxAttempts) {
                await sleep(err.retryAfterMsHint ?? backoffDelayMs(attempt));
            }
        }
    }

    // Tentativas esgotadas: converte pro tipo de erro público (AppError) que o resto do app espera,
    // preservando o correlationId no log (nunca na mensagem devolvida ao usuário, que não deve
    // carregar detalhe técnico de infraestrutura).
    logger.error({ correlationId, method, statusCode: lastError?.statusCode }, '[bitrix] Chamada falhou após todas as tentativas');
    throw new AppError(
        lastError?.statusCode === 429
            ? 'Bitrix24 está limitando as chamadas no momento — tente novamente em alguns instantes.'
            : 'Não foi possível comunicar com o Bitrix24 após várias tentativas.',
        lastError?.statusCode ?? 502,
    );
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
