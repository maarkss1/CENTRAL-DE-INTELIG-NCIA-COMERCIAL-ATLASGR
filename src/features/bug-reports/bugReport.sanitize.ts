/**
 * Sanitização do contexto técnico capturado automaticamente pelo botão "Reportar problema"
 * (src/components/ui/BugReportButton.tsx) antes de persistir em BugReport.context.
 *
 * O contexto inclui as últimas entradas do clientLogger (ring buffer, ver
 * src/lib/clientLogger.ts) — mensagens de erro que, em código de terceiros ou de integração,
 * ocasionalmente interpolam um token/segredo por engano (ex.: um erro de fetch que ecoa a URL
 * completa da requisição, incluindo query string com token OAuth). Não há como garantir 100% de
 * remoção de qualquer segredo possível, mas redigir os padrões mais comuns (Bearer token, JWT,
 * chave estilo "sk-...") antes de gravar reduz o risco real sem impedir o relato de ser útil.
 */

const REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED]' },
    // JWT: três segmentos base64url separados por ponto.
    { pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: '[REDACTED_JWT]' },
    { pattern: /sk-[A-Za-z0-9]{16,}/g, replacement: '[REDACTED_KEY]' },
    { pattern: /("?(?:password|senha|secret|token|apiKey|api_key)"?\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi, replacement: '$1"[REDACTED]"' },
];

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_LOG_ENTRIES = 20;
const MAX_LOG_MESSAGE_LENGTH = 500;

export function redactText(value: string): string {
    let result = value;
    for (const { pattern, replacement } of REDACTION_PATTERNS) {
        result = result.replace(pattern, replacement);
    }
    return result;
}

export function sanitizeTitle(title: string): string {
    return redactText(title).trim().slice(0, MAX_TITLE_LENGTH);
}

export function sanitizeDescription(description: string): string {
    return redactText(description).trim().slice(0, MAX_DESCRIPTION_LENGTH);
}

export interface RawLogEntry {
    level?: unknown;
    message?: unknown;
    timestamp?: unknown;
}

export interface SanitizedLogEntry {
    level: string;
    message: string;
    timestamp: string;
}

/** Aceita o que o frontend mandar sem confiar no formato — nunca deixa um campo não-string
 *  vazar pro JSON persistido, e limita quantidade/tamanho para não deixar `context` crescer sem
 *  limite (BugReport.context é JSONB sem cap de tamanho no schema). */
export function sanitizeRecentLogs(rawLogs: unknown): SanitizedLogEntry[] {
    if (!Array.isArray(rawLogs)) return [];

    return rawLogs
        .slice(-MAX_LOG_ENTRIES)
        .filter((entry): entry is RawLogEntry => typeof entry === 'object' && entry !== null)
        .map((entry) => ({
            level: typeof entry.level === 'string' ? entry.level.slice(0, 20) : 'info',
            message: typeof entry.message === 'string'
                ? redactText(entry.message).slice(0, MAX_LOG_MESSAGE_LENGTH)
                : '',
            timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
        }));
}
