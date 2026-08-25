/**
 * Redação/sanitização de mensagens de erro vindas de provedores externos de IA. Isolado porque é
 * a única linha de defesa entre "o provedor ecoou nosso payload de volta no erro" e um log/erro
 * de aplicação — nenhuma chave de API, bearer token ou segredo pode escapar daqui.
 */

/**
 * Remove chaves de API, bearer tokens e pares chave=valor sensíveis de uma mensagem de erro antes
 * dela circular por logs, telemetria (Langfuse) ou a resposta de erro agregada ao chamador.
 */
export function sanitizeProviderMessage(value: unknown): string {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return (text || 'Erro sem detalhes fornecidos pelo provedor')
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [REDACTED]')
        .replace(/\b(?:gsk|sk)[_-][A-Za-z0-9_-]{12,}\b/gi, '[REDACTED]')
        .replace(/(api[_-]?key|token|secret)\s*[:=]\s*["']?[^"',\s}]+/gi, '$1=[REDACTED]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
}

/** Lê e sanitiza o corpo de erro de uma resposta HTTP não-2xx de um provedor de IA. */
export async function readProviderError(response: Response): Promise<string> {
    const body = await response.text();
    try {
        const parsed = JSON.parse(body) as {
            error?: { message?: unknown } | unknown;
            message?: unknown;
        };
        const nestedError = typeof parsed.error === 'object' && parsed.error !== null && 'message' in parsed.error
            ? parsed.error.message
            : parsed.error;
        return sanitizeProviderMessage(nestedError || parsed.message || body);
    } catch {
        return sanitizeProviderMessage(body);
    }
}
