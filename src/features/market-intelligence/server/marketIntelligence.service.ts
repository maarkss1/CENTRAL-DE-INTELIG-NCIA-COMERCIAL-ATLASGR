import { Prisma } from '@prisma/client';
import { performance } from 'node:perf_hooks';
import { logger } from '../../../lib/logger.js';
import { withRlsContext } from '../../../lib/prisma.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import {
    formatCnpj,
    normalizeSearch,
    type CompanyListQuery,
    type RankingsQuery,
    type TerritoriesQuery,
} from './marketIntelligence.schemas.js';
import { rntrcTerritorialSnapshot } from './rntrcTerritorial.js';

type DatasetRow = {
    id: string;
    dataset: string;
    competencia: string;
    source: string;
    sourceVersion: string | null;
    sourceUrl: string | null;
    hash: string;
    pipelineVersion: string;
    activatedAt: Date | null;
    recordsImported: bigint | number | string;
};

type CompanyListRow = {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    cnaePrincipal: string | null;
    cnaePrincipalDescricao: string | null;
    municipioIbge: string | null;
    municipioNome: string | null;
    uf: string | null;
    situacaoCadastral: string | null;
    porte: string | null;
    capitalSocial: string | number | null;
    icpTier: string | null;
    icpScore: number | null;
    hasRntrc: boolean | null;
    dataOrigin: string;
};

const ICP_RANK: Record<string, number> = {
    MUITO_ALTO: 4,
    ALTO: 3,
    MEDIO: 2,
    BAIXO: 1,
    FORA_DO_ICP: 0,
};

const SORT_COLUMNS: Record<CompanyListQuery['sort'], string> = {
    razaoSocial: 'c."razaoSocial"',
    nomeFantasia: 'c."nomeFantasia"',
    capitalSocial: 'c."capitalSocial"',
    icpScore: 'c."icpScore"',
    dataInicioAtividade: 'c."dataInicioAtividade"',
};

function countValue(value: bigint | number | string | null | undefined): number {
    return value == null ? 0 : Number(value);
}

function iso(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function moneyValue(value: unknown): number | null {
    if (value == null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

async function activeDataset(): Promise<DatasetRow> {
    const rows = await withRlsContext((tx) => tx.$queryRaw<DatasetRow[]>(Prisma.sql`
        SELECT "id","dataset","competencia","source","sourceVersion","sourceUrl","hash",
               "pipelineVersion","activatedAt","recordsImported"
        FROM "MarketIntelligenceDataset"
        WHERE "publicationSlot" = 'CNPJ_ACTIVE' AND "status" = 'READY'
        LIMIT 1
    `));
    if (!rows[0]) throw new AppError('Nenhum snapshot empresarial READY foi publicado.', 503);
    return rows[0];
}

function companyFilters(query: CompanyListQuery, datasetId: string): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [Prisma.sql`c."datasetId" = ${datasetId}`];
    if (query.cnpj) conditions.push(Prisma.sql`c."cnpj" = ${query.cnpj}`);
    if (query.razaoSocial) conditions.push(Prisma.sql`c."razaoSocialSearch" ILIKE ${`%${normalizeSearch(query.razaoSocial)}%`}`);
    if (query.nomeFantasia) conditions.push(Prisma.sql`c."nomeFantasiaSearch" ILIKE ${`%${normalizeSearch(query.nomeFantasia)}%`}`);
    if (query.cnae) {
        conditions.push(query.cnaeScope === 'principal'
            ? Prisma.sql`c."cnaePrincipal" = ${query.cnae}`
            : Prisma.sql`(c."cnaePrincipal" = ${query.cnae} OR c."cnaesSecundarios" @> ${JSON.stringify([{ code: query.cnae }])}::jsonb)`);
    }
    if (query.municipio) conditions.push(Prisma.sql`c."municipioNomeSearch" ILIKE ${`%${normalizeSearch(query.municipio)}%`}`);
    if (query.municipioIbge) conditions.push(Prisma.sql`c."municipioIbge" = ${query.municipioIbge}`);
    if (query.uf) conditions.push(Prisma.sql`c."uf" = ${query.uf}`);
    if (query.situacaoCadastral) conditions.push(Prisma.sql`c."situacaoCadastral" = ${query.situacaoCadastral}`);
    if (query.matrizFilial) conditions.push(Prisma.sql`c."matrizFilial" = ${query.matrizFilial}`);
    if (query.rntrc !== undefined) conditions.push(Prisma.sql`c."hasRntrc" = ${query.rntrc}`);
    if (query.porte) conditions.push(Prisma.sql`c."porte" = ${query.porte}`);
    if (query.simples) conditions.push(Prisma.sql`c."opcaoSimples" = ${query.simples}`);
    if (query.mei) conditions.push(Prisma.sql`c."opcaoMei" = ${query.mei}`);
    if (query.capitalSocialMin !== undefined) conditions.push(Prisma.sql`c."capitalSocial" >= ${query.capitalSocialMin}`);
    if (query.capitalSocialMax !== undefined) conditions.push(Prisma.sql`c."capitalSocial" <= ${query.capitalSocialMax}`);
    if (query.icpMinimo) {
        const minimum = ICP_RANK[query.icpMinimo];
        conditions.push(Prisma.sql`CASE c."icpTier"::text
            WHEN 'MUITO_ALTO' THEN 4 WHEN 'ALTO' THEN 3 WHEN 'MEDIO' THEN 2
            WHEN 'BAIXO' THEN 1 WHEN 'FORA_DO_ICP' THEN 0 ELSE -1 END >= ${minimum}`);
    }
    return conditions;
}

function datasetMetadata(dataset: DatasetRow) {
    return {
        competencia: dataset.competencia,
        source: dataset.source,
        sourceVersion: dataset.sourceVersion,
        datasetHash: dataset.hash,
        pipelineVersion: dataset.pipelineVersion,
        activatedAt: iso(dataset.activatedAt),
    };
}

export const marketIntelligenceService = {
    async listCompanies(query: CompanyListQuery) {
        const started = performance.now();
        const dataset = await activeDataset();
        const where = Prisma.join(companyFilters(query, dataset.id), ' AND ');
        const sort = Prisma.raw(SORT_COLUMNS[query.sort]);
        const order = Prisma.raw(query.order.toUpperCase());
        const offset = (query.page - 1) * query.pageSize;
        const result = await withRlsContext(async (tx) => {
            const rows = await tx.$queryRaw<CompanyListRow[]>(Prisma.sql`
                SELECT c."cnpj",c."razaoSocial",c."nomeFantasia",c."cnaePrincipal",
                       c."cnaePrincipalDescricao",c."municipioIbge",c."municipioNome",c."uf",
                       c."situacaoCadastral",c."porte",c."capitalSocial"::text,c."icpTier",
                       c."icpScore",c."hasRntrc",c."dataOrigin"
                FROM "MarketIntelligenceCompany" c
                WHERE ${where}
                ORDER BY ${sort} ${order} NULLS LAST, c."cnpj" ASC
                LIMIT ${query.pageSize} OFFSET ${offset}
            `);
            const totals = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
                SELECT count(*) AS total FROM "MarketIntelligenceCompany" c WHERE ${where}
            `);
            return { rows, total: countValue(totals[0]?.total) };
        });
        const totalPages = Math.ceil(result.total / query.pageSize);
        logger.info({
            event: 'market_intelligence_company_query', durationMs: Math.round(performance.now() - started),
            filters: { uf: query.uf, municipioIbge: query.municipioIbge, cnae: query.cnae,
                situacaoCadastral: query.situacaoCadastral, icpMinimo: query.icpMinimo },
            returned: result.rows.length, competencia: dataset.competencia,
        }, 'Market Intelligence company query');
        return {
            data: result.rows.map((row) => ({ ...row, cnpj: formatCnpj(row.cnpj), capitalSocial: moneyValue(row.capitalSocial) })),
            pagination: {
                page: query.page, pageSize: query.pageSize, total: result.total, totalPages,
                hasNext: query.page < totalPages, hasPrevious: query.page > 1,
            },
            filters: query,
            metadata: datasetMetadata(dataset),
        };
    },

    async getCompany(cnpj: string) {
        const started = performance.now();
        const dataset = await activeDataset();
        const rows = await withRlsContext((tx) => tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
            SELECT c.* FROM "MarketIntelligenceCompany" c
            WHERE c."datasetId"=${dataset.id} AND c."cnpj"=${cnpj} LIMIT 1
        `));
        const row = rows[0];
        if (!row) throw new AppError('Empresa não encontrada no snapshot publicado.', 404);
        logger.info({ event: 'market_intelligence_company_detail', durationMs: Math.round(performance.now() - started),
            competencia: dataset.competencia }, 'Market Intelligence company detail');
        return {
            cnpj: formatCnpj(String(row.cnpj)),
            razaoSocial: row.razaoSocial,
            nomeFantasia: row.nomeFantasia,
            situacaoCadastral: row.situacaoCadastral,
            matrizFilial: row.matrizFilial,
            datas: {
                situacaoCadastral: iso(row.dataSituacaoCadastral as Date | null),
                inicioAtividade: iso(row.dataInicioAtividade as Date | null),
            },
            cnae: { principal: { code: row.cnaePrincipal, description: row.cnaePrincipalDescricao },
                secundarios: row.cnaesSecundarios ?? [] },
            naturezaJuridica: { code: row.naturezaJuridicaCodigo, description: row.naturezaJuridica },
            porte: row.porte,
            capitalSocial: moneyValue(row.capitalSocial),
            address: {
                tipoLogradouro: row.tipoLogradouro, logradouro: row.logradouro, numero: row.numero,
                complemento: row.complemento, bairro: row.bairro, cep: row.cep,
                municipioCodigoReceita: row.municipioCodigoReceita, municipioIbge: row.municipioIbge,
                municipioNome: row.municipioNome, uf: row.uf,
            },
            contact: { ddd1: row.ddd1, telefone1: row.telefone1, ddd2: row.ddd2,
                telefone2: row.telefone2, dddFax: row.dddFax, fax: row.fax, email: row.email,
                status: 'DADO_CADASTRAL_PUBLICO_NAO_VALIDADO' },
            simples: { option: row.opcaoSimples, optionDate: iso(row.dataOpcaoSimples as Date | null),
                exclusionDate: iso(row.dataExclusaoSimples as Date | null) },
            mei: { option: row.opcaoMei, optionDate: iso(row.dataOpcaoMei as Date | null),
                exclusionDate: iso(row.dataExclusaoMei as Date | null) },
            icp: row.icpTier ? { tier: row.icpTier, score: row.icpScore, reasons: row.icpReasons ?? [],
                taxonomyVersion: row.icpTaxonomyVersion, calculatedAt: iso(row.icpCalculatedAt as Date | null),
                dataOrigin: 'DERIVED' } : null,
            rntrc: row.hasRntrc == null ? null : { hasRntrc: row.hasRntrc, status: row.rntrcStatus,
                type: row.rntrcType, number: row.rntrcNumber, source: row.rntrcSource,
                updatedAt: iso(row.rntrcUpdatedAt as Date | null) },
            provenance: { ...datasetMetadata(dataset), dataOrigin: row.dataOrigin, importedAt: iso(row.importedAt as Date) },
        };
    },

    async territories(query: TerritoriesQuery) {
        const dataset = await activeDataset();
        const rntrcSnapshot = rntrcTerritorialSnapshot();
        const conditions = [Prisma.sql`c."datasetId"=${dataset.id}`];
        if (query.uf) conditions.push(Prisma.sql`c."uf"=${query.uf}`);
        if (query.municipioIbge) conditions.push(Prisma.sql`c."municipioIbge"=${query.municipioIbge}`);
        const where = Prisma.join(conditions, ' AND ');
        const rows = await withRlsContext((tx) => tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
            SELECT c."municipioIbge",max(c."municipioNome") AS "municipioNome",c."uf",
                   max(m."region") AS "region",count(*) AS "companies",
                   count(*) FILTER (WHERE c."situacaoCadastral"='ATIVA') AS "activeCompanies",
                   count(*) FILTER (WHERE c."icpTier" IS NOT NULL) AS "icpCompanies",
                   count(*) FILTER (WHERE c."hasRntrc"=true) AS "rntrcCompanies"
            FROM "MarketIntelligenceCompany" c
            LEFT JOIN "MarketIntelligenceMunicipalityMapping" m ON m."receitaCode"=c."municipioCodigoReceita"
            WHERE ${where} AND c."municipioIbge" IS NOT NULL
            GROUP BY c."municipioIbge",c."uf" ORDER BY c."uf","municipioNome"
        `));
        return { hierarchy: 'BRASIL_REGIAO_UF_MUNICIPIO', data: rows.map((row) => {
            const territorial = rntrcSnapshot.byIbge.get(String(row.municipioIbge));
            return {
                ...row, companies: countValue(row.companies as bigint), activeCompanies: countValue(row.activeCompanies as bigint),
                icpCompanies: countValue(row.icpCompanies as bigint), rntrcCompanies: countValue(row.rntrcCompanies as bigint),
                rntrcTerritorial: territorial ? {
                    transporters: territorial.transporters, etc: territorial.etc, tac: territorial.tac,
                    ctc: territorial.ctc, etcEquiparada: territorial.etcEquiparada,
                    ...rntrcSnapshot.metadata,
                } : null,
            };
        }), metadata: { ...datasetMetadata(dataset), rntrcTerritorial: rntrcSnapshot.metadata } };
    },

    async rankings(query: RankingsQuery) {
        const dataset = await activeDataset();
        if (query.metric === 'RNTRC_TERRITORIAL') {
            const snapshot = rntrcTerritorialSnapshot();
            const rows = snapshot.rows
                .filter((row) => !query.uf || row.uf === query.uf)
                .sort((left, right) => right.transporters - left.transporters || left.name.localeCompare(right.name, 'pt-BR'))
                .slice(0, query.limit)
                .map((row, index) => ({
                    municipioIbge: row.ibgeCode, municipioNome: row.name, uf: row.uf, region: row.region,
                    rank: index + 1, value: row.transporters,
                }));
            return {
                metric: query.metric, data: rows,
                metadata: { ...datasetMetadata(dataset), indicator: snapshot.metadata },
            };
        }
        const metric = query.metric === 'EMPRESAS_ICP' ? Prisma.sql`count(*) FILTER (WHERE c."icpTier" IS NOT NULL)`
            : query.metric === 'RNTRC_EMPRESARIAL' ? Prisma.sql`count(*) FILTER (WHERE c."hasRntrc"=true)`
                : Prisma.sql`count(*) FILTER (WHERE c."situacaoCadastral"='ATIVA')`;
        const uf = query.uf ? Prisma.sql`AND c."uf"=${query.uf}` : Prisma.empty;
        const rows = await withRlsContext((tx) => tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
            SELECT c."municipioIbge",max(c."municipioNome") AS "municipioNome",c."uf",${metric} AS value
            FROM "MarketIntelligenceCompany" c
            WHERE c."datasetId"=${dataset.id} AND c."municipioIbge" IS NOT NULL ${uf}
            GROUP BY c."municipioIbge",c."uf" HAVING ${metric} > 0
            ORDER BY value DESC,"municipioNome" ASC LIMIT ${query.limit}
        `));
        return { metric: query.metric, data: rows.map((row, index) => ({ ...row, rank: index + 1,
            value: countValue(row.value as bigint) })), metadata: datasetMetadata(dataset) };
    },

    async sources() {
        const rows = await withRlsContext((tx) => tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
            SELECT "id","dataset","source","sourceVersion","sourceUrl","competencia","status","hash",
                   "pipelineVersion","recordsImported","recordsRejected","recordsActive","startedAt",
                   "finishedAt","activatedAt",coalesce("publicationSlot"='CNPJ_ACTIVE',false) AS active
            FROM "MarketIntelligenceDataset" ORDER BY "createdAt" DESC
        `));
        const rntrc = rntrcTerritorialSnapshot();
        return { sources: [...rows.map((row) => ({ ...row, name: 'Dados Abertos do CNPJ', provider: 'Receita Federal',
            granularity: 'COMPANY', records: countValue(row.recordsImported as bigint),
            recordsRejected: countValue(row.recordsRejected as bigint), recordsActive: countValue(row.recordsActive as bigint),
            startedAt: iso(row.startedAt as Date | null), finishedAt: iso(row.finishedAt as Date | null),
            activatedAt: iso(row.activatedAt as Date | null) })), {
            id: 'antt-rntrc-territorial', dataset: rntrc.metadata.dataset,
            name: 'Registro Nacional de Transportadores Rodoviários de Cargas', provider: 'ANTT',
            source: 'ANTT_RNTRC', sourceVersion: rntrc.metadata.competencia,
            sourceUrl: rntrc.metadata.sourceUrl, competencia: rntrc.metadata.competencia,
            status: rntrc.rows.length ? 'READY' : 'NOT_AVAILABLE', hash: rntrc.metadata.hash,
            pipelineVersion: 'rntrc-municipal-v1', granularity: 'MUNICIPAL', records: rntrc.rows.length,
            recordsRejected: 0, recordsActive: rntrc.rows.length, active: rntrc.rows.length > 0,
            startedAt: null, finishedAt: null, activatedAt: null, dataOrigin: rntrc.metadata.dataOrigin,
        }] };
    },
};
