import { describe, expect, it } from 'vitest';
import {
  AUTHORIZED_LOGIN_EMAIL,
  isAuthorizedLoginEmail,
  normalizeLoginEmail,
} from '../../../src/config/access-policy';

describe('access policy', () => {
  it('authorizes only the configured commercial account', () => {
    expect(isAuthorizedLoginEmail(AUTHORIZED_LOGIN_EMAIL)).toBe(true);
    expect(isAuthorizedLoginEmail(' COMERCIAL@ATLASGR.COM.BR ')).toBe(true);
  });

  it('rejects every other account and missing identity', () => {
    expect(isAuthorizedLoginEmail('marcelo.nascimento@atlasgr.com.br')).toBe(false);
    expect(isAuthorizedLoginEmail('comercial@totaltrack.com.br')).toBe(false);
    expect(isAuthorizedLoginEmail(null)).toBe(false);
    expect(isAuthorizedLoginEmail(undefined)).toBe(false);
  });

  it('normalizes whitespace and letter casing', () => {
    expect(normalizeLoginEmail(' Comercial@AtlasGR.com.br ')).toBe(AUTHORIZED_LOGIN_EMAIL);
  });
});
