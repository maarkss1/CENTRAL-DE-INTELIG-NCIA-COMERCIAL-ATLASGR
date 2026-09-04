import { describe, it, expect } from 'vitest';
import { parseLeadLookupQuery } from '../leadLookup';

describe('parseLeadLookupQuery', () => {
  it('reconhece URL de lead do Bitrix24 e extrai o id numérico', () => {
    const result = parseLeadLookupQuery(
      'https://atlasgr.bitrix24.com.br/crm/lead/details/482/',
    );
    expect(result).toEqual({ type: 'bitrix', id: '482' });
  });

  it('reconhece URL de negócio (deal) do Bitrix24', () => {
    const result = parseLeadLookupQuery(
      'https://atlasgr.bitrix24.com.br/crm/deal/details/1930/',
    );
    expect(result).toEqual({ type: 'bitrix', id: '1930' });
  });

  it('reconhece a URL mesmo sem a barra final ou com query string', () => {
    expect(
      parseLeadLookupQuery('https://x.bitrix24.com.br/crm/lead/details/7?param=1'),
    ).toEqual({ type: 'bitrix', id: '7' });
  });

  it('reconhece e-mail quando não bate com a URL do Bitrix24', () => {
    expect(parseLeadLookupQuery('contato@empresa.com.br')).toEqual({
      type: 'email',
      value: 'contato@empresa.com.br',
    });
  });

  it('cai para id cru quando não é URL do Bitrix nem tem @', () => {
    expect(parseLeadLookupQuery('cltest1234567890')).toEqual({
      type: 'rawId',
      value: 'cltest1234567890',
    });
  });

  it('remove espaços nas pontas antes de classificar', () => {
    expect(parseLeadLookupQuery('  contato@empresa.com  ')).toEqual({
      type: 'email',
      value: 'contato@empresa.com',
    });
  });
});
