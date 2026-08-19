import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../src/lib/prisma';
import {
  getMarketIntelligenceCompany,
  listMarketIntelligenceCompanies,
  normalizeCatalogSearch,
  parseCompanyCatalogQuery,
} from '../../src/features/market-intelligence/server/marketIntelligenceCompany.service';
import { withRlsBypass, withTenant } from '../helpers/rbac-e2e-helpers';

const DATASET_ID = 'mi-etapa2-integration-202608';
const TENANT_A = 'mi-etapa2-tenant-a';
const TENANT_B = 'mi-etapa2-tenant-b';

const activeRibeirao = {
  id: 'mic-etapa2-ribeirao-active',
  datasetId: DATASET_ID,
  cnpj: 'A2345678000195',
  cnpjBasico: 'A2345678',
  cnpjOrdem: '0001',
  cnpjDv: '95',
  razaoSocial: 'TRANSPORTADORA FIXTURE RIBEIRAO LTDA',
  razaoSocialSearch: normalizeCatalogSearch('TRANSPORTADORA FIXTURE RIBEIRAO LTDA'),
  nomeFantasia: 'FIXTURE LOG',
  nomeFantasiaSearch: normalizeCatalogSearch('FIXTURE LOG'),
  matrizFilial: 'MATRIZ',
  situacaoCadastralCodigo: '02',
  situacaoCadastral: 'ATIVA',
  cnaePrincipal: '4930202',
  cnaePrincipalDescricao: 'Transporte rodoviário de carga',
  porteCodigo: '03',
  porte: 'EMPRESA DE PEQUENO PORTE',
  capitalSocial: '1500000.00',
  municipioCodigoReceita: '6969',
  municipioIbge: '3543402',
  municipioNome: 'Ribeirão Preto',
  uf: 'SP',
  opcaoSimples: 'SIM',
  opcaoMei: 'NAO',
  icpTier: 'ALTO' as const,
  icpScore: 82,
  icpReasons: ['CNAE_PRIORITARIO', 'LOCALIZACAO_SP'],
  icpTaxonomyVersion: 'integration-fixture-v1',
  dataOrigin: 'OBSERVED' as const,
  competencia: '2026-08',
};

const inactiveRibeirao = {
  id: 'mic-etapa2-ribeirao-inactive',
  datasetId: DATASET_ID,
  cnpj: '12345678000199',
  cnpjBasico: '12345678',
  cnpjOrdem: '0001',
  cnpjDv: '99',
  razaoSocial: 'EMPRESA FIXTURE BAIXADA LTDA',
  razaoSocialSearch: normalizeCatalogSearch('EMPRESA FIXTURE BAIXADA LTDA'),
  matrizFilial: 'MATRIZ',
  situacaoCadastralCodigo: '08',
  situacaoCadastral: 'BAIXADA',
  cnaePrincipal: '4930202',
  municipioCodigoReceita: '6969',
  municipioIbge: '3543402',
  municipioNome: 'Ribeirão Preto',
  uf: 'SP',
  dataOrigin: 'OBSERVED' as const,
  competencia: '2026-08',
};

async function clearFixture() {
  await withRlsBypass(async () => {
    await prisma.marketIntelligenceCompany.deleteMany({ where: { datasetId: DATASET_ID } });
    await prisma.marketIntelligenceDataset.deleteMany({ where: { id: DATASET_ID } });
  });
}

describe('Market Intelligence empresarial — PostgreSQL/RLS real', () => {
  beforeAll(async () => {
    await clearFixture();
    await withRlsBypass(async () => {
      await prisma.marketIntelligenceDataset.create({
        data: {
          id: DATASET_ID,
          dataset: 'CNPJ_COMPANIES',
          competencia: '2026-08',
          source: 'RECEITA_FEDERAL_CNPJ',
          sourceVersion: '2026-08',
          sourceUrl: 'https://dados.gov.br/fixture-integration-only',
          status: 'READY',
          publicationSlot: 'CNPJ_ACTIVE',
          recordsRead: 2n,
          recordsImported: 2n,
          recordsRejected: 0n,
          recordsActive: 1n,
          hash: 'integration-etapa2-202608-ribeirao',
          pipelineVersion: 'integration-fixture-v1',
          activatedAt: new Date('2026-08-18T12:00:00.000Z'),
        },
      });
      await prisma.marketIntelligenceCompany.create({ data: activeRibeirao });
      await prisma.marketIntelligenceCompany.create({ data: inactiveRibeirao });
    });
  });

  afterAll(clearFixture);

  it('consulta Ribeirão Preto no snapshot ativo e aplica ATIVA por padrão', async () => {
    const result = await withTenant(TENANT_A, () => listMarketIntelligenceCompanies(
      parseCompanyCatalogQuery({ uf: 'SP', municipio: 'Ribeirão Preto' }),
    ));

    expect(result.dataset?.competencia).toBe('2026-08');
    expect(result.meta.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      cnpj: 'A2345678000195',
      municipioIbge: '3543402',
      municipioNome: 'Ribeirão Preto',
      situacaoCadastral: 'ATIVA',
      icpTier: 'ALTO',
    });
    expect(result.data[0]).not.toHaveProperty('email');
    expect(result.data[0]).not.toHaveProperty('telefone1');
    expect(result.data[0]).not.toHaveProperty('fax');
  });

  it('catálogo oficial não sensível é compartilhado para outro tenant autenticado', async () => {
    const result = await withTenant(TENANT_B, () => listMarketIntelligenceCompanies(
      parseCompanyCatalogQuery({ cnpj: 'A2.345.678/0001-95' }),
    ));
    expect(result.meta.total).toBe(1);
    expect(result.data[0]?.cnpj).toBe('A2345678000195');
  });

  it('detalhe mantém proveniência, RNTRC individual indisponível e contato global redigido', async () => {
    const result = await withTenant(TENANT_A, () => getMarketIntelligenceCompany('A2345678000195'));
    expect(result.company).not.toBeNull();
    expect(result.company?.provenance).toMatchObject({
      source: 'RECEITA_FEDERAL_CNPJ',
      competencia: '2026-08',
      companyFields: 'OBSERVED',
      rntrcCompany: 'NOT_AVAILABLE',
      publicContact: 'REDACTED_GLOBAL_CATALOG',
    });
    expect(result.company).not.toHaveProperty('email');
    expect(result.company).not.toHaveProperty('telefone1');
  });

  it('tenant comum não consegue escrever/publicar no catálogo global', async () => {
    await expect(withTenant(TENANT_A, () => prisma.marketIntelligenceCompany.create({
      data: {
        ...activeRibeirao,
        id: 'mic-etapa2-forbidden-write',
        cnpj: 'B2345678000194',
        cnpjBasico: 'B2345678',
        cnpjDv: '94',
      },
    }))).rejects.toThrow();
  });

  it('guardrail do banco rejeita telefone/e-mail mesmo quando o importador usa bypass RLS', async () => {
    await expect(withRlsBypass(() => prisma.marketIntelligenceCompany.create({
      data: {
        ...activeRibeirao,
        id: 'mic-etapa2-contact-guard',
        cnpj: 'C2345678000193',
        cnpjBasico: 'C2345678',
        cnpjDv: '93',
        email: 'contato@fixture.invalid',
        telefone1: '30000000',
      },
    }))).rejects.toThrow();
  });
});
