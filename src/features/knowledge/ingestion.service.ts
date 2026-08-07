import { Prisma } from '@prisma/client';
import { prisma, withRlsContext } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { generateEmbedding } from '../../lib/ai/gateway.js';
import { chunkText } from './chunking.js';
import { hasVectorSupport } from './vector-support.js';

/** Quantos embeddings pedimos em paralelo ao provedor. Acima disso o LiteLLM começa a dar 429. */
const EMBEDDING_CONCURRENCY = 4;

/** Teto de trechos por documento — evita que um PDF gigante consuma a cota de embeddings inteira. */
const MAX_CHUNKS_PER_DOCUMENT = 400;

export interface IngestOptions {
    organizationId: string;
    title: string;
    content: string;
    sourceType?: 'text' | 'file';
    sourceName?: string;
    createdBy?: string;
}

export interface IngestResult {
    id: string;
    title: string;
    chunkCount: number;
    /** Trechos que ficaram sem vetor porque o provedor de embeddings falhou. */
    embeddingFailures: number;
}

/**
 * Executa `worker` sobre `items` com paralelismo limitado, preservando a ordem do resultado.
 * Um `Promise.all` puro dispararia centenas de chamadas de embedding de uma vez.
 */
async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;

    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await worker(items[index], index);
        }
    });

    await Promise.all(runners);
    return results;
}

/** Formata o vetor no literal que o pgvector aceita: `[0.1,0.2,...]`. */
function toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
}

export class IngestionService {
    /**
     * Cria um documento, fatia o conteúdo e gera os embeddings de cada trecho.
     *
     * Falha de embedding NÃO aborta a ingestão: o trecho é gravado com vetor nulo, continua
     * pesquisável por palavra-chave e pode ser revetorizado depois com `reembedDocument`. Perder o
     * documento inteiro porque a API de embeddings piscou seria um péssimo negócio para o usuário.
     */
    async ingestText(options: IngestOptions): Promise<IngestResult> {
        const { organizationId, title, content, sourceType = 'text', sourceName, createdBy } = options;

        const normalizedTitle = title.trim();
        if (!normalizedTitle) throw new Error('O título do documento é obrigatório.');
        if (!content.trim()) throw new Error('O conteúdo do documento está vazio.');

        const allChunks = chunkText(content);
        if (allChunks.length === 0) throw new Error('Não foi possível extrair texto deste documento.');

        const chunks = allChunks.slice(0, MAX_CHUNKS_PER_DOCUMENT);
        if (allChunks.length > chunks.length) {
            logger.warn(
                { title: normalizedTitle, total: allChunks.length, kept: chunks.length },
                'Documento excedeu o limite de trechos; o excedente foi descartado',
            );
        }

        const document = await prisma.document.create({
            data: {
                title: normalizedTitle,
                content,
                organizationId,
                sourceType,
                sourceName,
                createdBy,
                chunkCount: 0,
                metadata: {
                    originalChunkCount: allChunks.length,
                    truncated: allChunks.length > chunks.length,
                },
            },
        });

        // Num banco sem pgvector não adianta nem pedir os embeddings: não há onde gravá-los.
        const vectorReady = await hasVectorSupport();

        // O título entra junto de cada trecho no texto embedado (mas não no conteúdo gravado):
        // dá contexto ao vetor sem poluir o texto que será exibido como resultado da busca.
        const embeddings = vectorReady
            ? await mapWithConcurrency(chunks, EMBEDDING_CONCURRENCY, async (chunk) => {
                try {
                    return await generateEmbedding(`${normalizedTitle}\n\n${chunk}`, 'passage');
                } catch (err) {
                    logger.error({ err, documentId: document.id }, 'Falha ao gerar embedding do trecho');
                    return null;
                }
            })
            : chunks.map(() => null);

        let embeddingFailures = 0;
        for (let i = 0; i < chunks.length; i++) {
            const embedding = embeddings[i];
            if (vectorReady && !embedding) embeddingFailures++;

            // `Unsupported("vector")` não é expressável no client tipado do Prisma, então a coluna
            // vector só pode ser escrita por SQL cru. Os valores seguem parametrizados.
            if (vectorReady) {
                await prisma.$executeRaw`
                    INSERT INTO "DocumentChunk" ("id", "documentId", "content", "chunkIndex", "vector")
                    VALUES (
                        gen_random_uuid()::text,
                        ${document.id},
                        ${chunks[i]},
                        ${i},
                        ${embedding ? toVectorLiteral(embedding) : null}::vector
                    )
                `;
            } else {
                // Sem a extensão, o cast `::vector` é um erro de sintaxe no Postgres: grava-se só o
                // texto, que continua pesquisável por palavra-chave.
                await prisma.$executeRaw`
                    INSERT INTO "DocumentChunk" ("id", "documentId", "content", "chunkIndex")
                    VALUES (gen_random_uuid()::text, ${document.id}, ${chunks[i]}, ${i})
                `;
            }
        }

        const updated = await prisma.document.update({
            where: { id: document.id },
            data: { chunkCount: chunks.length },
        });

        logger.info(
            { documentId: document.id, chunks: chunks.length, embeddingFailures },
            'Documento ingerido na Base de Conhecimento',
        );

        return {
            id: updated.id,
            title: updated.title,
            chunkCount: chunks.length,
            embeddingFailures,
        };
    }

    /**
     * Atualiza título e/ou conteúdo de um documento.
     *
     * Quando o conteúdo muda, os trechos antigos são apagados e o documento é refatiado e
     * revetorizado — manter chunks de um texto que não existe mais faria a busca devolver
     * passagens que o usuário já corrigiu.
     */
    async updateDocument(
        organizationId: string,
        documentId: string,
        patch: { title?: string; content?: string },
    ): Promise<IngestResult> {
        const document = await this.get(organizationId, documentId);
        if (!document) throw new Error('Documento não encontrado.');

        const title = patch.title?.trim() || document.title;
        const contentChanged = patch.content != null && patch.content !== document.content;
        const content = contentChanged ? patch.content! : document.content;

        if (!content.trim()) throw new Error('O conteúdo do documento não pode ficar vazio.');

        if (!contentChanged) {
            // Só o título mudou: não há por que gastar embeddings de novo.
            const updated = await prisma.document.update({
                where: { id: documentId },
                data: { title },
            });
            return { id: updated.id, title: updated.title, chunkCount: updated.chunkCount, embeddingFailures: 0 };
        }

        const allChunks = chunkText(content);
        if (allChunks.length === 0) throw new Error('Não foi possível extrair texto deste conteúdo.');
        const chunks = allChunks.slice(0, MAX_CHUNKS_PER_DOCUMENT);

        const vectorReady = await hasVectorSupport();
        const embeddings = vectorReady
            ? await mapWithConcurrency(chunks, EMBEDDING_CONCURRENCY, async (chunk) => {
                try {
                    return await generateEmbedding(`${title}\n\n${chunk}`, 'passage');
                } catch (err) {
                    logger.error({ err, documentId }, 'Falha ao gerar embedding na reindexação');
                    return null;
                }
            })
            : chunks.map(() => null);

        // Só apaga os trechos antigos depois de ter os novos embeddings em mãos: se o provedor
        // estivesse fora, o documento ficaria sem nenhum trecho pesquisável.
        await prisma.$executeRaw`DELETE FROM "DocumentChunk" WHERE "documentId" = ${documentId}`;

        let embeddingFailures = 0;
        for (let i = 0; i < chunks.length; i++) {
            const embedding = embeddings[i];
            if (vectorReady && !embedding) embeddingFailures++;

            if (vectorReady) {
                await prisma.$executeRaw`
                    INSERT INTO "DocumentChunk" ("id", "documentId", "content", "chunkIndex", "vector")
                    VALUES (
                        gen_random_uuid()::text, ${documentId}, ${chunks[i]}, ${i},
                        ${embedding ? toVectorLiteral(embedding) : null}::vector
                    )
                `;
            } else {
                await prisma.$executeRaw`
                    INSERT INTO "DocumentChunk" ("id", "documentId", "content", "chunkIndex")
                    VALUES (gen_random_uuid()::text, ${documentId}, ${chunks[i]}, ${i})
                `;
            }
        }

        const updated = await prisma.document.update({
            where: { id: documentId },
            data: { title, content, chunkCount: chunks.length },
        });

        logger.info({ documentId, chunks: chunks.length }, 'Documento reindexado');
        return { id: updated.id, title: updated.title, chunkCount: chunks.length, embeddingFailures };
    }

    /** Lista os documentos do tenant, sem trazer o conteúdo inteiro (a listagem só usa metadados). */
    async list(organizationId: string) {
        return prisma.document.findMany({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                sourceType: true,
                sourceName: true,
                chunkCount: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    /** Busca um documento com o conteúdo completo, restrito ao tenant. */
    async get(organizationId: string, documentId: string) {
        return prisma.document.findFirst({
            where: { id: documentId, organizationId },
        });
    }

    /**
     * Remove o documento. Os trechos caem por cascade (onDelete: Cascade no schema).
     * O `deleteMany` com organizationId no where garante que um id de outro tenant não apague nada.
     */
    async delete(organizationId: string, documentId: string): Promise<boolean> {
        const { count } = await prisma.document.deleteMany({
            where: { id: documentId, organizationId },
        });
        return count > 0;
    }

    /**
     * Regera os embeddings dos trechos que estão sem vetor — usado quando a ingestão aconteceu com
     * o provedor de embeddings fora do ar.
     */
    async reembedDocument(organizationId: string, documentId: string): Promise<{ repaired: number; remaining: number }> {
        const document = await this.get(organizationId, documentId);
        if (!document) throw new Error('Documento não encontrado.');

        if (!(await hasVectorSupport())) {
            throw new Error(
                'Este banco não tem a extensão pgvector ativa, então não há busca semântica para reparar.',
            );
        }

        const pending = await prisma.$queryRaw<Array<{ id: string; content: string }>>`
            SELECT "id", "content" FROM "DocumentChunk"
            WHERE "documentId" = ${documentId} AND "vector" IS NULL
            ORDER BY "chunkIndex" ASC
        `;

        let repaired = 0;
        await mapWithConcurrency(pending, EMBEDDING_CONCURRENCY, async (chunk) => {
            try {
                const embedding = await generateEmbedding(`${document.title}\n\n${chunk.content}`, 'passage');
                await prisma.$executeRaw`
                    UPDATE "DocumentChunk"
                    SET "vector" = ${toVectorLiteral(embedding)}::vector
                    WHERE "id" = ${chunk.id}
                `;
                repaired++;
            } catch (err) {
                logger.error({ err, chunkId: chunk.id }, 'Falha ao revetorizar trecho');
            }
        });

        return { repaired, remaining: pending.length - repaired };
    }
}

export const ingestionService = new IngestionService();

// Reexportado para os testes e para quem precisar montar o literal fora daqui.
export { toVectorLiteral };
export type { Prisma };
