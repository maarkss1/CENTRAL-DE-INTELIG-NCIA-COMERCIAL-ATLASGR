import { Meilisearch } from 'meilisearch';
import { logger } from '../logger.js';

const MEILI_HOST = process.env.MEILI_HOST || 'http://localhost:7700';
const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY || 'prospector_meili_master_key';

export const meili = new Meilisearch({
    host: MEILI_HOST,
    apiKey: MEILI_MASTER_KEY,
});

/**
 * Enterprise Search Implementation
 * Indexes to maintain: 'leads', 'companies', 'contacts'
 */

export const initMeiliIndexes = async () => {
    try {
        await meili.createIndex('companies', { primaryKey: 'id' });
        // organizationId é obrigatório entre os atributos filtráveis: toda busca precisa restringir
        // por tenant (ver searchCompanyIds abaixo) — sem isto, o filtro seria rejeitado pelo Meilisearch
        // e, se alguém esquecesse de filtrar, empresas de organizações diferentes vazariam na busca.
        await meili.index('companies').updateFilterableAttributes(['organizationId', 'segment', 'city', 'state', 'status']);
        await meili.index('companies').updateSearchableAttributes(['tradeName', 'legalName', 'cnpj', 'segment', 'city']);

        await meili.createIndex('leads', { primaryKey: 'id' });
        await meili.index('leads').updateFilterableAttributes(['organizationId', 'status', 'temperature', 'owner']);
        await meili.index('leads').updateSearchableAttributes(['company.tradeName', 'contact.name', 'contact.email']);

        logger.info('Meilisearch indexes initialized');
    } catch (err) {
        logger.error({ err }, 'Failed to initialize Meilisearch indexes');
    }
};

/** Escapa aspas duplas para uso seguro dentro de uma expressão de filtro do Meilisearch. */
function escapeMeiliFilterValue(value: string): string {
    return value.replace(/"/g, '\\"');
}

const MEILI_SEARCH_TIMEOUT_MS = 3_000;

/**
 * Busca full-text tolerante a erros de digitação, sempre restrita ao tenant. Retorna `null` (em
 * vez de lançar) quando o Meilisearch está indisponível ou a busca falha — o chamador deve tratar
 * isso como "sem resultado de busca disponível" e cair de volta para a busca padrão no Postgres,
 * nunca como "nenhuma empresa encontrada".
 */
export async function searchCompanyIds(
    organizationId: string,
    query: string,
    limit = 50
): Promise<string[] | null> {
    try {
        const result = await withMeiliTimeout(
            meili.index('companies').search(query, {
                filter: `organizationId = "${escapeMeiliFilterValue(organizationId)}"`,
                limit,
                attributesToRetrieve: ['id'],
            })
        );
        return result.hits.map((hit) => (hit as { id: string }).id);
    } catch (err) {
        logger.warn({ err }, 'Busca no Meilisearch indisponível — usando fallback do Postgres');
        return null;
    }
}

function withMeiliTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Meilisearch excedeu ${MEILI_SEARCH_TIMEOUT_MS}ms`)), MEILI_SEARCH_TIMEOUT_MS);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); },
        );
    });
}
