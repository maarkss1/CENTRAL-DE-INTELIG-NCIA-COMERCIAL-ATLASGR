import { describe, expect, it } from 'vitest';
import {
  cnpjRoot,
  normalizeCnpjDigits,
  matchEconomicGroupByCnpjRoot,
} from '@/features/market-intelligence/domain/accountEconomicGroup.js';

describe('normalizeCnpjDigits/cnpjRoot — nunca adivinha raiz de CNPJ malformado', () => {
  it('normaliza CNPJ pontuado e cru para o mesmo resultado', () => {
    expect(normalizeCnpjDigits('12.345.678/0001-90')).toBe('12345678000190');
    expect(normalizeCnpjDigits('12345678000190')).toBe('12345678000190');
  });

  it('devolve null para CNPJ com menos ou mais de 14 dígitos', () => {
    expect(normalizeCnpjDigits('123')).toBeNull();
    expect(normalizeCnpjDigits('123456780001900')).toBeNull();
    expect(normalizeCnpjDigits(null)).toBeNull();
    expect(normalizeCnpjDigits('')).toBeNull();
  });

  it('extrai a raiz de 8 dígitos de um CNPJ válido, em qualquer formatação', () => {
    expect(cnpjRoot('12.345.678/0001-90')).toBe('12345678');
    expect(cnpjRoot('12.345.678/0002-71')).toBe('12345678');
  });

  it('devolve null de raiz para CNPJ malformado', () => {
    expect(cnpjRoot('não é um cnpj')).toBeNull();
  });
});

describe('matchEconomicGroupByCnpjRoot — só relação matematicamente derivável do CNPJ', () => {
  it('não gera relação para uma única empresa', () => {
    const matches = matchEconomicGroupByCnpjRoot([{ id: 'a', cnpj: '12.345.678/0001-90' }]);
    expect(matches).toHaveLength(0);
  });

  it('gera um par estável (ordenado por id) para duas empresas com a mesma raiz de CNPJ, em qualquer ordem de entrada', () => {
    const forward = matchEconomicGroupByCnpjRoot([
      { id: 'company-a', cnpj: '12.345.678/0001-90' },
      { id: 'company-b', cnpj: '12.345.678/0002-71' },
    ]);
    const reversed = matchEconomicGroupByCnpjRoot([
      { id: 'company-b', cnpj: '12.345.678/0002-71' },
      { id: 'company-a', cnpj: '12.345.678/0001-90' },
    ]);
    expect(forward).toEqual([{ sourceCompanyId: 'company-a', targetCompanyId: 'company-b', cnpjRoot: '12345678' }]);
    expect(reversed).toEqual(forward);
  });

  it('gera todos os pares dentro de um grupo de 3+ empresas com a mesma raiz', () => {
    const matches = matchEconomicGroupByCnpjRoot([
      { id: 'a', cnpj: '11.111.111/0001-11' },
      { id: 'b', cnpj: '11.111.111/0002-92' },
      { id: 'c', cnpj: '11.111.111/0003-73' },
    ]);
    expect(matches).toHaveLength(3);
  });

  it('nunca cruza empresas de raízes de CNPJ diferentes', () => {
    const matches = matchEconomicGroupByCnpjRoot([
      { id: 'a', cnpj: '11.111.111/0001-11' },
      { id: 'b', cnpj: '22.222.222/0001-22' },
    ]);
    expect(matches).toHaveLength(0);
  });

  it('ignora empresa com CNPJ ausente ou malformado, mesmo dentro de um grupo real', () => {
    const matches = matchEconomicGroupByCnpjRoot([
      { id: 'a', cnpj: '11.111.111/0001-11' },
      { id: 'b', cnpj: '11.111.111/0002-92' },
      { id: 'sem-cnpj', cnpj: null },
      { id: 'malformado', cnpj: '123' },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ sourceCompanyId: 'a', targetCompanyId: 'b' });
  });
});
