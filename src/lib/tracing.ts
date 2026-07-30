import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { logger } from './logger.js';

export const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(), // Uses OTEL_EXPORTER_OTLP_ENDPOINT from env
    instrumentations: [getNodeAutoInstrumentations()],
});

// Start SDK before any other modules load
export function initTracing() {
    sdk.start();
    logger.info('OpenTelemetry initialized');
    
    process.on('SIGTERM', () => {
        sdk.shutdown()
            .then(() => logger.info('Tracing terminated'))
            .catch((error) => logger.error({ err: error }, 'Error terminating tracing'))
            .finally(() => process.exit(0));
    });
}
