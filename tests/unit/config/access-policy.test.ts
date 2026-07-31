import { describe, expect, it } from 'vitest';
import {
  AUTHORIZED_LOGIN_EMAILS,
  AUTHORIZED_LOGIN_DOMAINS,
  isAuthorizedLoginEmail,
  normalizeLoginEmail,
  getBrandFromEmail,
} from '../../../src/config/access-policy';

describe('access policy', () => {
  it('authorizes explicit accounts and domain corporate emails', () => {
    for (const email of AUTHORIZED_LOGIN_EMAILS) {
      expect(isAuthorizedLoginEmail(email)).toBe(true);
    }
    expect(isAuthorizedLoginEmail(' MARCELO.NASCIMENTO@ATLASGR.COM.BR ')).toBe(true);
    expect(isAuthorizedLoginEmail('novo.usuario@atlasgr.com.br')).toBe(true);
    expect(isAuthorizedLoginEmail('operador@totaltrac.com.br')).toBe(true);
    expect(isAuthorizedLoginEmail('suporte@totaltrack.com.br')).toBe(true);
  });

  it('rejects unauthorized external domains and missing identity', () => {
    expect(isAuthorizedLoginEmail('usuario@gmail.com')).toBe(false);
    expect(isAuthorizedLoginEmail('contato@empresaexterna.com')).toBe(false);
    expect(isAuthorizedLoginEmail(null)).toBe(false);
    expect(isAuthorizedLoginEmail(undefined)).toBe(false);
  });

  it('normalizes whitespace and letter casing', () => {
    expect(normalizeLoginEmail(' Joao.Reis@AtlasGR.com.br ')).toBe(
      'joao.reis@atlasgr.com.br',
    );
  });

  it('correctly identifies brand from corporate email domain', () => {
    expect(getBrandFromEmail('marcelo@atlasgr.com.br')).toBe('atlasgr');
    expect(getBrandFromEmail('suporte@totaltrac.com.br')).toBe('totaltrac');
    expect(getBrandFromEmail('caue@totaltrack.com.br')).toBe('totaltrac');
  });
});
