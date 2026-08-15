/**
 * Logger estruturado para código de navegador (componentes React sob src/).
 *
 * `src/lib/logger.ts` (pino) é Node-only — usa transports baseados em worker_threads
 * (pino-pretty/pino-loki) que não fazem sentido dentro do bundle do Vite e não devem ser
 * importados por componente algum. Este módulo dá aos componentes a mesma forma de chamada
 * (`logger.error({ err }, 'mensagem')`) que o pino do servidor, mas usando console.* por baixo —
 * estruturado e consistente entre componentes, sem puxar nada Node-only pro navegador.
 */

type LogFields = Record<string, unknown>;
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RecentLogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
}

// Ring buffer in-memory das últimas entradas warn/error — única razão de existir é alimentar o
// contexto automático do botão "Reportar problema" (BugReportButton.tsx) com o que aconteceu no
// navegador pouco antes do relato, sem precisar de nenhum serviço de error tracking externo
// (Sentry etc., que este projeto não usa — ver .claude/CLAUDE.md/seção de mídia externa: nada de
// dependência nova sem necessidade real). Só debug/info não entram no buffer: são ruído para
// depuração de bug, não sinal.
const RECENT_LOG_CAPACITY = 30;
const recentLogs: RecentLogEntry[] = [];

function remember(level: LogLevel, msg: string): void {
    if (level !== 'warn' && level !== 'error') return;
    recentLogs.push({ level, message: msg, timestamp: new Date().toISOString() });
    if (recentLogs.length > RECENT_LOG_CAPACITY) {
        recentLogs.shift();
    }
}

/** Cópia rasa das últimas entradas warn/error registradas nesta aba — consumida por
 *  bugReport.api.ts ao montar o contexto do relato. Nunca modifique o array retornado. */
export function getRecentLogs(): RecentLogEntry[] {
    return [...recentLogs];
}

function format(fieldsOrMessage: LogFields | string, message?: string): [string, LogFields?] {
    if (typeof fieldsOrMessage === 'string') {
        return [fieldsOrMessage];
    }
    return [message ?? '', fieldsOrMessage];
}

function log(level: LogLevel, consoleMethod: (...args: unknown[]) => void, fieldsOrMessage: LogFields | string, message?: string): void {
    const [msg, fields] = format(fieldsOrMessage, message);
    remember(level, msg);
    if (fields && Object.keys(fields).length > 0) {
        consoleMethod(msg, fields);
    } else {
        consoleMethod(msg);
    }
}

export const clientLogger = {
    debug: (fieldsOrMessage: LogFields | string, message?: string) => log('debug', console.debug, fieldsOrMessage, message),
    info: (fieldsOrMessage: LogFields | string, message?: string) => log('info', console.info, fieldsOrMessage, message),
    warn: (fieldsOrMessage: LogFields | string, message?: string) => log('warn', console.warn, fieldsOrMessage, message),
    error: (fieldsOrMessage: LogFields | string, message?: string) => log('error', console.error, fieldsOrMessage, message),
};
