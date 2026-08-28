import type { Express } from 'express';
import path from 'path';
import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import swaggerUi from 'swagger-ui-express';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * DOC-002: a API não tinha nenhuma documentação além do código-fonte das rotas. Montada em dev
 * por padrão, ou em qualquer ambiente quando EXPOSE_API_DOCS=true é setado explicitamente —
 * mesmo padrão de opt-in explícito usado por EXPOSE_METRICS/ENABLE_SEARCH (nunca ligado
 * implicitamente em produção). Falha ao carregar o YAML é tratada como não-fatal: loga e segue
 * sem montar /api-docs, em vez de derrubar o boot do servidor inteiro por causa de documentação.
 */
export function mountApiDocs(app: Express): void {
  if (env.NODE_ENV === 'production' && !env.EXPOSE_API_DOCS) return;

  try {
    const openApiYaml = readFileSync(path.join(process.cwd(), 'docs', 'openapi.yaml'), 'utf-8');
    const openApiDocument = parseYaml(openApiYaml);
    // Spec bruta, registrada antes da Swagger UI abaixo para não ser interceptada pelo
    // middleware estático dela — é o que scanners como o ZAP (docker-compose.opensource.yml,
    // security:zap) precisam buscar; a UI em si serve HTML, não o YAML.
    app.get('/api-docs/openapi.yaml', (_req, res) => {
      res.type('application/yaml').send(openApiYaml);
    });
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  } catch (err) {
    logger.warn({ err }, 'Falha ao carregar docs/openapi.yaml — /api-docs não foi montado');
  }
}
