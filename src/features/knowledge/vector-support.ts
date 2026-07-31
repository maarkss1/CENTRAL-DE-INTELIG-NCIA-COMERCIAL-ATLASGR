import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

/**
 * Detecta se o Postgres conectado tem a extensão pgvector ativa.
 *
 * Por que isso existe: o docker-compose do projeto sobe `pgvector/pgvector:pg16`, mas o banco que a
 * aplicação encontra em desenvolvimento pode ser um Postgres comum — e aí a coluna
 * `DocumentChunk.vector` é criada como TEXT e todo cast `::vector` estoura. Sem esta checagem, a
 * ingestão inteira falha num banco sem pgvector, em vez de simplesmente ficar sem busca semântica.
 *
 * O resultado é memorizado: é uma propriedade do servidor, não muda entre requisições.
 */
let cached: Promise<boolean> | null = null;

async function detect(): Promise<boolean> {
    try {
        const rows = await prisma.$queryRaw<Array<{ present: boolean }>>`
            SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS present
        `;
        const present = rows[0]?.present === true;
        if (!present) {
            logger.warn(
                'pgvector não está ativo neste banco: a Base de Conhecimento vai indexar e buscar ' +
                'apenas por palavra-chave. Suba o Postgres com a imagem pgvector para habilitar a ' +
                'busca semântica.',
            );
        }
        return present;
    } catch (err) {
        // Banco fora do ar ou sem permissão de leitura no catálogo: assume que não há suporte, que
        // é o caminho degradado e seguro.
        logger.error({ err }, 'Falha ao verificar suporte a pgvector');
        return false;
    }
}

export function hasVectorSupport(): Promise<boolean> {
    if (!cached) cached = detect();
    return cached;
}

/** Usado nos testes para reavaliar a capacidade. */
export function resetVectorSupportCache(): void {
    cached = null;
}
