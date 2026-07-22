import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    // Em produção, envia logs estruturados para o Loki
    // Em dev, formata para ficar legível no terminal.
    transport: isProduction
        ? {
            target: 'pino-loki',
            options: {
                batching: true,
                interval: 5,
                host: process.env.LOKI_HOST || 'http://loki:3100' // Dentro do docker-compose
            }
        }
        : {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname'
            }
        },
    base: {
        env: process.env.NODE_ENV,
        service: 'prospector-atlas-api',
    }
});
