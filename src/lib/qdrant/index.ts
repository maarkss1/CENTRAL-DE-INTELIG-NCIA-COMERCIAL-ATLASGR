import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';

/**
 * Cliente Qdrant (OS-5, docker-compose.services.yml) — registrado seguindo o mesmo formato de
 * src/lib/search/index.ts (client export + isConfigured + timeout), mas deliberadamente SEM
 * nenhuma feature plugada nele ainda.
 *
 * Por quê: este projeto já tem pgvector em produção (`prisma/schema.prisma`, colunas
 * `Unsupported("vector(768)")`, usado por company lookalike scoring e busca de conhecimento) para
 * embeddings. Adicionar Qdrant como um SEGUNDO banco vetorial sem um caso de uso concreto que o
 * pgvector não cubra seria só complexidade e superfície de operação extra — o mesmo raciocínio que
 * levou a não instalar Typesense (redundante com o Meilisearch já em uso). Isto fica disponível
 * para quando (se) surgir uma necessidade real e distinta — coleção separada, filtro que o
 * pgvector não expressa bem, migração futura — sem exigir reinstalar o zero.
 */

const QDRANT_TIMEOUT_MS = 5_000;

export const qdrant = new QdrantClient({
  host: env.QDRANT_HOST,
  port: env.QDRANT_PORT,
  apiKey: env.QDRANT_API_KEY,
  timeout: QDRANT_TIMEOUT_MS,
});

/** `true` quando um host foi explicitamente configurado (env padrão aponta pro localhost de dev). */
export function isQdrantConfigured(): boolean {
  return Boolean(env.QDRANT_HOST);
}

/**
 * Confere se o serviço está de pé — nunca lança, mesmo padrão de "degrada em vez de derrubar"
 * usado pelas buscas do Meilisearch (searchCompanyIds/searchLeadIds).
 */
export async function checkQdrantHealth(): Promise<boolean> {
  try {
    await qdrant.getCollections();
    return true;
  } catch (err) {
    logger.debug({ err }, '[qdrant] health check falhou — serviço indisponível ou não configurado.');
    return false;
  }
}
