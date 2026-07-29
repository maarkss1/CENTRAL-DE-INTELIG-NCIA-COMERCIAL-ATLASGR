import { describe, expect, it } from 'vitest';
import {
  AUTHORIZED_LOGIN_EMAILS,
  isAuthorizedLoginEmail,
  normalizeLoginEmail,
} from '../../../src/config/access-policy';

describe('access policy', () => {
  it('authorizes exactly the configured AtlasGR accounts', () => {
    for (const email of AUTHORIZED_LOGIN_EMAILS) {
      expect(isAuthorizedLoginEmail(email)).toBe(true);
    }
    expect(isAuthorizedLoginEmail(' MARCELO.NASCIMENTO@ATLASGR.COM.BR ')).toBe(true);
  });

  it('rejects every other account and missing identity', () => {
    expect(isAuthorizedLoginEmail('comercial@atlasgr.com.br')).toBe(false);
    expect(isAuthorizedLoginEmail('comercial@totaltrack.com.br')).toBe(false);
    expect(isAuthorizedLoginEmail(null)).toBe(false);
    expect(isAuthorizedLoginEmail(undefined)).toBe(false);
  });

  it('normalizes whitespace and letter casing', () => {
    expect(normalizeLoginEmail(' Joao.Reis@AtlasGR.com.br ')).toBe(
      'joao.reis@atlasgr.com.br',
    );
  });
});
