import { describe, expect, it } from 'vitest';

import {
  buildAccountIntelligence,
  normalizeIcpReasons,
} from '../../../src/features/market-intelligence/server/accountIntelligence.service';

function companyFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mi-company-1',
    cnpj: '12345678000195',
    razaoSocial: 'ATLAS TESTE LTDA',
    nomeFantasia: 'ATLAS TESTE',
    matrizFilial: 'MATRIZ',
    situacaoCadastral: 'ATIVA',
    cnaePrincipal: '4930202',
    cnaePrincipalDescricao: 'Transporte rodoviário de carga',
    porte: 'DEMAIS',
    capitalSocial: '500000.00',
    municipioIbge: '3543402',
    municipioNome: 'RIBEIRAO PRETO',
    uf: 'SP',
    icpTier: 'ALTO',
    icpScore: 82,
    icpReasons: ['CNAE prioritário', 'Localização atendida'],
    icpTaxonomyVersion: 'v1',
    icpCalculatedAt: new Date('2026-08-18T12:00:00.000Z'),
    provenance: {
      source: 'Receita Federal',
      competencia: '2026-08',
      companyFields: 'OBSERVED',
      icp: 'DERIVED',
      publicContact: 'REDACTED_GLOBAL_CATALOG',
    },
    ...overrides,
  } as Parameters<typeof buildAccountIntelligence>[0];
}

const datasetFixture = {
  competencia: '2026-08',
  source: 'Receita Federal',
  sourceVersion: '2026-08',
  sourceUrl: 'https://dados.gov.br/',
  recordsImported: 1,
  recordsActive: 1,
  hash: 'sha256:test',
  pipelineVersion: 'test',
  activatedAt: new Date('2026-08-18T12:00:00.000Z'),
} as Parameters<typeof buildAccountIntelligence>[1];

describe('LDR Account Intelligence', () => {
  it('mantém Account Score parcial quando apenas o fit possui evidência', () => {
    const result = buildAccountIntelligence(companyFixture(), datasetFixture);

    expect(result.version).toBe('ldr-account-intelligence.v1');
    expect(result.accountScore.status).toBe('PARTIAL');
    expect(result.accountScore.total).toBe(82);
    expect(result.accountScore.components).toEqual({
      fit: 82,
      intent: null,
      timing: null,
      relationship: null,
    });
    expect(result.accountScore.missingComponents).toEqual(['intent', 'timing', 'relationship']);
    expect(result.nextBestAction.status).toBe('BLOCKED');
  });

  it('não transforma ausência de score em zero', () => {
    const result = buildAccountIntelligence(
      companyFixture({ icpTier: null, icpScore: null, icpReasons: null }),
      datasetFixture,
    );

    expect(result.qualification.status).toBe('NOT_AVAILABLE');
    expect(result.accountScore.status).toBe('NOT_AVAILABLE');
    expect(result.accountScore.total).toBeNull();
    expect(result.accountScore.components.fit).toBeNull();
    expect(result.accountScore.missingComponents).toContain('fit');
  });

  it('mantém PII fora do catálogo e marca decisores como indisponíveis', () => {
    const result = buildAccountIntelligence(companyFixture(), datasetFixture);

    expect(result.decisionMakers.status).toBe('NOT_AVAILABLE');
    expect(result.decisionMakers.items).toEqual([]);
    expect(result.provenance.publicContact).toBe('REDACTED_GLOBAL_CATALOG');
  });

  it('normaliza razões ICP somente quando há strings rastreáveis', () => {
    expect(normalizeIcpReasons(['A', '', 42, 'B'])).toEqual(['A', 'B']);
    expect(normalizeIcpReasons({ reasons: ['C'] })).toEqual(['C']);
    expect(normalizeIcpReasons({ value: 'sem razões' })).toEqual([]);
  });
});
