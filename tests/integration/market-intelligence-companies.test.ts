import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { marketIntelligenceService } from '../../src/features/market-intelligence/server/marketIntelligence.service';
import { companyListQuerySchema } from '../../src/features/market-intelligence/server/marketIntelligence.schemas';

const DATASET_ID = 'test-mi-cnpj-2026-08';
const MAPPING_ID = 'test-mi-ribeirao-mapping';
const withBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
let previousActiveId: string | null = null;

async function cleanup() {
    await withBypass(async () => {
        await prisma.marketIntelligenceDataset.deleteMany({ where: { id: DATASET_ID } });
        await prisma.marketIntelligenceMunicipalityMapping.deleteMany({ where: { id: MAPPING_ID } });
        if (previousActiveId) {
            await prisma.marketIntelligenceDataset.updateMany({
                where: { id: previousActiveId },
                data: { status: 'READY', publicationSlot: 'CNPJ_ACTIVE' },
            });
            previousActiveId = null;
        }
    });
}

describe('Market Intelligence empresarial — PostgreSQL, RLS e consultas reais', () => {
    beforeEach(async () => {
        await cleanup();
        await withBypass(async () => {
            const active = await prisma.marketIntelligenceDataset.findFirst({
                where: { publicationSlot: 'CNPJ_ACTIVE' }, select: { id: true },
            });
            previousActiveId = active?.id ?? null;
            if (previousActiveId) {
                await prisma.marketIntelligenceDataset.update({
                    where: { id: previousActiveId },
                    data: { status: 'ARCHIVED', publicationSlot: null },
                });
            }
            await prisma.marketIntelligenceDataset.create({
                data: {
                    id: DATASET_ID,
                    dataset: 'CNPJ_COMPANIES',
                    competencia: '2026-08',
                    source: 'RECEITA_FEDERAL_CNPJ',
                    sourceVersion: '2026-08',
                    status: 'READY',
                    publicationSlot: 'CNPJ_ACTIVE',
                    recordsRead: 2,
                    recordsImported: 2,
                    recordsActive: 1,
                    hash: 'a'.repeat(64),
                    pipelineVersion: 'integration-fixture-v1',
                    activatedAt: new Date('2026-08-18T12:00:00Z'),
                },
            });
            await prisma.marketIntelligenceMunicipalityMapping.create({
                data: {
                    id: MAPPING_ID,
                    receitaCode: '6969',
                    receitaName: 'RIBEIRAO PRETO',
                    uf: 'SP',
                    ibgeCode: '3543402',
                    ibgeName: 'Ribeirão Preto',
                    region: 'Sudeste',
                    mappingMethod: 'TEST_FIXTURE',
                    sourceVersion: '2026-08',
                },
            });
            await prisma.marketIntelligenceCompany.createMany({
                data: [
                    {
                        id: 'test-mi-company-ribeirao', datasetId: DATASET_ID,
                        cnpj: '12345678000195', cnpjBasico: '12345678', cnpjOrdem: '0001', cnpjDv: '95',
                        razaoSocial: 'TRANSPORTADORA RIBEIRAO FIXTURE LTDA',
                        razaoSocialSearch: 'TRANSPORTADORA RIBEIRAO FIXTURE LTDA',
                        nomeFantasia: 'Ribeirão Cargas', nomeFantasiaSearch: 'RIBEIRAO CARGAS',
                        situacaoCadastral: 'ATIVA', matrizFilial: 'MATRIZ', cnaePrincipal: '4930202',
                        cnaesSecundarios: [{ code: '5229099', description: 'Outras atividades auxiliares' }],
                        porte: 'EMPRESA DE PEQUENO PORTE', capitalSocial: 100000,
                        opcaoSimples: 'NAO', opcaoMei: 'NAO',
                        municipioCodigoReceita: '6969', municipioIbge: '3543402',
                        municipioNome: 'Ribeirão Preto', municipioNomeSearch: 'RIBEIRAO PRETO', uf: 'SP',
                        dataOrigin: 'OBSERVED', competencia: '2026-08',
                    },
                    {
                        id: 'test-mi-company-campinas', datasetId: DATASET_ID,
                        cnpj: '98765432000198', cnpjBasico: '98765432', cnpjOrdem: '0001', cnpjDv: '98',
                        razaoSocial: 'EMPRESA CAMPINAS FIXTURE LTDA',
                        razaoSocialSearch: 'EMPRESA CAMPINAS FIXTURE LTDA',
                        situacaoCadastral: 'BAIXADA', matrizFilial: 'MATRIZ', cnaePrincipal: '6201501',
                        cnaesSecundarios: [{ code: '4930202', description: 'Transporte rodoviário de carga' }],
                        porte: 'DEMAIS', capitalSocial: 500000, opcaoSimples: 'SIM', opcaoMei: 'NAO',
                        icpTier: 'ALTO', icpScore: 80, hasRntrc: true,
                        municipioCodigoReceita: '6291', municipioIbge: '3509502',
                        municipioNome: 'Campinas', municipioNomeSearch: 'CAMPINAS', uf: 'SP',
                        dataOrigin: 'OBSERVED', competencia: '2026-08',
                    },
                ],
            });
        });
    });

    it('combina filtros de CNAE secundário, ICP mínimo, RNTRC, porte e capital no PostgreSQL', async () => {
        const result = await marketIntelligenceService.listCompanies(companyListQuerySchema.parse({
            razaoSocial: 'empresa campinas', nomeFantasia: undefined, cnae: '49.30-2-02', cnaeScope: 'all',
            municipioIbge: '3509502', uf: 'SP', situacaoCadastral: 'BAIXADA', matrizFilial: 'MATRIZ',
            icpMinimo: 'ALTO', rntrc: 'true', porte: 'DEMAIS', simples: 'SIM', mei: 'NAO',
            capitalSocialMin: '499999', capitalSocialMax: '500001', sort: 'capitalSocial', order: 'desc',
        }));
        expect(result.pagination.total).toBe(1);
        expect(result.data[0]).toMatchObject({
            cnpj: '98.765.432/0001-98', cnaePrincipal: '6201501', icpTier: 'ALTO', hasRntrc: true,
        });
    });

    afterEach(cleanup);

    it('filtra no servidor com busca municipal sem acento e paginação determinística', async () => {
        const result = await marketIntelligenceService.listCompanies(companyListQuerySchema.parse({
            municipio: 'ribeirao', situacaoCadastral: 'ATIVA', page: 1, pageSize: 1,
        }));
        expect(result.pagination).toMatchObject({ total: 1, totalPages: 1, hasNext: false });
        expect(result.data[0]).toMatchObject({
            cnpj: '12.345.678/0001-95', municipioIbge: '3543402', situacaoCadastral: 'ATIVA',
        });
        expect(result.metadata).toMatchObject({ competencia: '2026-08', source: 'RECEITA_FEDERAL_CNPJ' });
    });

    it('detalha empresa observada sem inventar ICP ou RNTRC empresarial', async () => {
        const detail = await marketIntelligenceService.getCompany('12345678000195');
        expect(detail.icp).toBeNull();
        expect(detail.rntrc).toBeNull();
        expect(detail.provenance).toMatchObject({ dataOrigin: 'OBSERVED', competencia: '2026-08' });
    });

    it('reconcilia o território empresarial e mantém a fonte RNTRC municipal separada', async () => {
        const territories = await marketIntelligenceService.territories({ municipioIbge: '3543402' });
        expect(territories.data[0]).toMatchObject({
            municipioIbge: '3543402', companies: 1, activeCompanies: 1, rntrcCompanies: 0,
            rntrcTerritorial: { transporters: 3663, competencia: '2026-07', granularity: 'MUNICIPAL' },
        });
        const sources = await marketIntelligenceService.sources();
        expect(sources.sources).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'antt-rntrc-territorial', granularity: 'MUNICIPAL', status: 'READY' }),
        ]));
    });

    it('RLS oculta o catálogo sem tenant e bloqueia escrita de uma sessão comum', async () => {
        await expect(requestContext.run({}, () => marketIntelligenceService.listCompanies(
            companyListQuerySchema.parse({}),
        ))).rejects.toMatchObject({ statusCode: 503 });

        await expect(prisma.marketIntelligenceCompany.create({
            data: {
                id: 'test-mi-forbidden-write', datasetId: DATASET_ID,
                cnpj: '11111111000191', cnpjBasico: '11111111', cnpjOrdem: '0001', cnpjDv: '91',
                razaoSocial: 'ESCRITA PROIBIDA', razaoSocialSearch: 'ESCRITA PROIBIDA',
                dataOrigin: 'OBSERVED', competencia: '2026-08',
            },
        })).rejects.toThrow();
    });

    it('mantém a constraint de CNPJ e os índices críticos da migration', async () => {
        await expect(withBypass(() => prisma.marketIntelligenceCompany.create({
            data: {
                id: 'test-mi-invalid-cnpj', datasetId: DATASET_ID,
                cnpj: '123', cnpjBasico: '123', cnpjOrdem: '0001', cnpjDv: '00',
                razaoSocial: 'CNPJ INVALIDO', razaoSocialSearch: 'CNPJ INVALIDO',
                dataOrigin: 'OBSERVED', competencia: '2026-08',
            },
        }))).rejects.toThrow();
        const indexes = await withBypass(() => prisma.$queryRaw<Array<{ indexname: string }>>`
            SELECT indexname FROM pg_indexes
            WHERE tablename='MarketIntelligenceCompany'
        `);
        const names = indexes.map((row) => row.indexname);
        expect(names).toEqual(expect.arrayContaining([
            'MarketIntelligenceCompany_razaoSocialSearch_trgm_idx',
            'MarketIntelligenceCompany_datasetId_uf_municipioIbge_idx',
            'MarketIntelligenceCompany_cnaesSecundarios_gin_idx',
        ]));
    });
});
