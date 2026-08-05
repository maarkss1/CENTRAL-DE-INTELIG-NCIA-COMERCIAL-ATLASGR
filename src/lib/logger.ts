import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const lokiHost = process.env.LOKI_HOST;

// Só ativa pino-loki em produção se LOKI_HOST estiver explicitamente configurado (ex: docker-compose local).
// Em ambientes de cloud como Railway / Kubernetes sem Loki dedicado, o pino grava JSON diretamente no stdout,
// evitando crash por erro de resolução de DNS 'ENOTFOUND loki'.
const getTransport = () => {
    if (lokiHost) {
        return {
            target: 'pino-loki',
            options: {
                batching: true,
                interval: 5,
                host: lokiHost,
            },
        };
    }
    if (!isProduction) {
        return {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            },
        };
    }
    return undefined; // Standard JSON output to stdout in production
};

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: getTransport(),
    base: {
        env: process.env.NODE_ENV,
        service: 'prospector-atlas-api',
    },
});
