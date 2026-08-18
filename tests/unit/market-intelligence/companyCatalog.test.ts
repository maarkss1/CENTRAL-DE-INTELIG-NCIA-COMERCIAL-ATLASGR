import { describe, expect, it } from 'vitest';

import {
  CompanyCatalogValidationError,
  normalizeCatalogCnpj,
  normalizeCatalogSearch,
  parseCompanyCatalogQuery,
} from '../../../src/features/market-intelligence/server/marketIntelligenceCompany.service';

describe('Market Intelligence company catalog query', () => {
  it('aceita CNPJ alfanumérico e normaliza máscara', () => {
    expect(normalizeCatalogCnpj('A2.345.678/0001-95')).toBe('A2345678000195');
    const parsed = parseCompanyCatalogQuery({ cnpj: 'A2.345.678/0001-95' });
    expect(parsed.cnpj).toBe('A2345678000195');
    expect(parsed.situacao).toBe('ATIVA');
  });

  it('normaliza busca textual para o mesmo contrato do ETL', () => {
    expect(normalizeCatalogSearch('Ribeirão Preto / São Paulo')).toBe('RIBEIRAO PRETO SAO PAULO');
  });

  it('limita paginação e aceita situação TODAS sem inventar filtro', () => {
    const parsed = parseCompanyCatalogQuery({ page: '2', pageSize: '9999', situacao: 'TODAS' });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(100);
    expect(parsed.situacao).toBeNull();
  });

  it('rejeita CNPJ fora do contrato de 14 posições', () => {
    expect(() => parseCompanyCatalogQuery({ cnpj: '123' })).toThrow(CompanyCatalogValidationError);
  });

  it('valida filtros estruturados', () => {
    const parsed = parseCompanyCatalogQuery({
      uf: 'sp',
      municipioIbge: '3543402',
      cnae: '49.30-2/02',
      matrizFilial: 'matriz',
      icpTier: 'alto',
      sort: 'icp',
    });
    expect(parsed.uf).toBe('SP');
    expect(parsed.municipioIbge).toBe('3543402');
    expect(parsed.cnae).toBe('4930202');
    expect(parsed.matrizFilial).toBe('MATRIZ');
    expect(parsed.icpTier).toBe('ALTO');
    expect(parsed.sort).toBe('icp');
  });
});
