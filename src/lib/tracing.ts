import { logger } from './logger.js';

let sdkInstance: { start: () => void; shutdown: () => Promise<void> } | null = null;

export function initTracing() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { NodeSDK } = require('@opentelemetry/sdk-node');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

        sdkInstance = new NodeSDK({
            traceExporter: new OTLPTraceExporter(),
            instrumentations: [getNodeAutoInstrumentations()],
        });

        sdkInstance?.start();
        logger.info('OpenTelemetry initialized');

        process.on('SIGTERM', () => {
            sdkInstance?.shutdown()
                .then(() => logger.info('Tracing terminated'))
                .catch((error) => logger.error({ err: error }, 'Error terminating tracing'))
                .finally(() => process.exit(0));
        });
    } catch {
        logger.warn('OpenTelemetry disabled or dependencies not installed.');
    }
}

