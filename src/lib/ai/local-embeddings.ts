import path from 'node:path';
import { logger } from '../logger.js';

/**
 * Embeddings gerados localmente, sem chave de API e sem chamada de rede.
 *
 * Por que local: as duas rotas externas do projeto falharam em produção de desenvolvimento — o
 * proxy LiteLLM fora do ar e a GEMINI_API_KEY com a Generative Language API bloqueada por
 * restrição do projeto Google. Rodar o modelo aqui elimina essa classe de falha e, num CRM, tem o
 * ganho de que o conteúdo dos documentos nunca sai da infraestrutura.
 *
 * Modelo: multilingual-e5-base — 768 dimensões, exatamente o que a coluna `vector(768)` espera,
 * então trocar de provedor não exigiu migration.
 */

/** O e5 foi treinado com estes prefixos; sem eles a qualidade da recuperação cai bastante. */
export type EmbeddingKind = 'query' | 'passage';

const MODEL_ID = process.env.LOCAL_EMBEDDING_MODEL || 'Xenova/multilingual-e5-base';

/** Dimensão esperada. Serve de guarda: se o modelo mudar e não bater, falha alto em vez de gravar lixo. */
export const EMBEDDING_DIMENSIONS = 768;

type FeatureExtractor = (
    text: string,
    opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

let carregando: Promise<FeatureExtractor> | null = null;

/**
 * Carrega o modelo uma única vez por processo.
 *
 * A primeira chamada baixa ~400 MB e leva dezenas de segundos; as seguintes usam o cache em disco
 * e sobem em poucos segundos. Por isso o carregamento é preguiçoso — subir o servidor não deve
 * esperar por um modelo que talvez ninguém use naquela execução.
 */
function obterExtrator(): Promise<FeatureExtractor> {
    if (carregando) return carregando;

    carregando = (async () => {
        const t0 = Date.now();
        const { pipeline, env } = await import('@xenova/transformers');

        // Sem isso o Transformers.js procura o modelo em disco antes de buscar no Hub e polui o log.
        env.allowLocalModels = false;
        // Cache fora de node_modules: um `npm ci` não deve forçar novo download de 400 MB.
        env.cacheDir = process.env.LOCAL_EMBEDDING_CACHE || path.resolve(process.cwd(), '.cache/models');

        logger.info({ model: MODEL_ID }, 'Carregando modelo de embeddings local (primeira vez baixa ~400 MB)');
        const extrator = (await pipeline('feature-extraction', MODEL_ID)) as unknown as FeatureExtractor;
        logger.info({ model: MODEL_ID, ms: Date.now() - t0 }, 'Modelo de embeddings local pronto');
        return extrator;
    })();

    // Falha no carregamento não pode envenenar o cache: sem isto, um erro transitório de rede
    // deixaria a promise rejeitada memorizada e nenhuma tentativa futura funcionaria.
    carregando.catch(() => { carregando = null; });

    return carregando;
}

/** Gera o vetor de um texto. `kind` define o prefixo exigido pelo e5. */
export async function embedLocal(text: string, kind: EmbeddingKind = 'passage'): Promise<number[]> {
    const normalizado = text.trim();
    if (!normalizado) throw new Error('O texto do embedding não pode ser vazio.');

    const extrator = await obterExtrator();
    const saida = await extrator(`${kind}: ${normalizado}`, { pooling: 'mean', normalize: true });
    const vetor = Array.from(saida.data as ArrayLike<number>);

    if (vetor.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
            `O modelo ${MODEL_ID} devolveu ${vetor.length} dimensões, mas a coluna espera ${EMBEDDING_DIMENSIONS}.`,
        );
    }
    if (!vetor.every(Number.isFinite)) {
        throw new Error('O modelo devolveu um embedding com valores inválidos.');
    }

    return vetor;
}

/** Usado nos testes para reiniciar o estado do carregamento. */
export function resetLocalEmbeddings(): void {
    carregando = null;
}

export const LOCAL_EMBEDDING_MODEL_ID = MODEL_ID;
