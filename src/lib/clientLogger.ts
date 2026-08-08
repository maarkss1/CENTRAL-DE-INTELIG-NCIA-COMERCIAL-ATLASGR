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

function format(fieldsOrMessage: LogFields | string, message?: string): [string, LogFields?] {
    if (typeof fieldsOrMessage === 'string') {
        return [fieldsOrMessage];
    }
    return [message ?? '', fieldsOrMessage];
}

function log(consoleMethod: (...args: unknown[]) => void, fieldsOrMessage: LogFields | string, message?: string): void {
    const [msg, fields] = format(fieldsOrMessage, message);
    if (fields && Object.keys(fields).length > 0) {
        consoleMethod(msg, fields);
    } else {
        consoleMethod(msg);
    }
}

export const clientLogger = {
    debug: (fieldsOrMessage: LogFields | string, message?: string) => log(console.debug, fieldsOrMessage, message),
    info: (fieldsOrMessage: LogFields | string, message?: string) => log(console.info, fieldsOrMessage, message),
    warn: (fieldsOrMessage: LogFields | string, message?: string) => log(console.warn, fieldsOrMessage, message),
    error: (fieldsOrMessage: LogFields | string, message?: string) => log(console.error, fieldsOrMessage, message),
};
