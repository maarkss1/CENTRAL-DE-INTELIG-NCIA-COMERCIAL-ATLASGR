/**
 * OpenTelemetry SDK — instrumentação automática do Express + Prisma + BullMQ
 *
 * IMPORTANTE: este arquivo DEVE ser importado como primeiro import do server.ts
 * (antes de qualquer outro módulo) para que a instrumentação automática funcione.
 *
 * Já existe um otel-collector rodando (ver docker-compose.opensource.yml).
 * Este SDK conecta o Express/Node ao collector via OTLP HTTP (porta 4318).
 *
 * Configuração via variáveis de ambiente:
 *   OTEL_SERVICE_NAME=atlasgr-api       # Nome do serviço no Tempo/Grafana
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318  # Collector endpoint
 *   OTEL_TRACES_SAMPLER=always_on       # Em produção: parentbased_traceidratio=0.1
 */
import { trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { trace } from '@opentelemetry/api';

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'atlasgr-api';
const SERVICE_VERSION = process.env.npm_package_version ?? '0.0.1';

// Não inicializa em ambiente de teste (Vitest / Jest) para evitar interferência
// com timers/async e não poluir saída dos testes com logs de exportação.
const isTestEnv = process.env.NODE_ENV === 'test' || !!process.env.VITEST;

let sdk: NodeSDK | null = null;

if (!isTestEnv) {
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      'deployment.environment': process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${OTEL_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Desabilita instrumentações ruidosas que não agregam valor de rastreamento aqui
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        // Express — rastreia rotas, middleware e handlers automaticamente
        '@opentelemetry/instrumentation-express': { enabled: true },
        // HTTP — rastreia chamadas http.get/post (Bitrix, WhatsApp, LiteLLM)
        '@opentelemetry/instrumentation-http': { enabled: true },
        // Redis — rastreia comandos BullMQ/cache
        '@opentelemetry/instrumentation-redis': { enabled: true },
        // Pg — rastreia queries Prisma (driver nativo postgres)
        '@opentelemetry/instrumentation-pg': { enabled: true },
      }),
    ],
  });

  sdk.start();

  // Shutdown gracioso: flush de traces pendentes antes de fechar o processo.
  // Sem isso, o último batch de spans não exportados se perde no SIGTERM.
  const shutdown = () => {
    sdk?.shutdown().catch((err) => console.error('[OTel] Falha no shutdown:', err));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

/**
 * Cria um span manual para operações específicas que não são capturadas
 * automaticamente (ex: chamada ao LiteLLM por fetch, job BullMQ customizado).
 *
 * Uso:
 *   import { createSpan } from '@/lib/telemetry/otel';
 *   const span = createSpan('ai.litellm.chat', { model: 'groq/llama3' });
 *   try { ... } finally { span.end(); }
 */
export function createSpan(name: string, attributes?: Record<string, string | number | boolean>) {
  if (isTestEnv || !sdk) {
    return { end: () => {} }; // Noop em testes
  }
  const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
  const span = tracer.startSpan(name);
  if (attributes) {
    Object.entries(attributes).forEach(([k, v]) => span.setAttribute(k, v));
  }
  return span;
}

export { sdk };
