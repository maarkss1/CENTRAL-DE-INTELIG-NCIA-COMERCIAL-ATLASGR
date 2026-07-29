export const AUTHORIZED_LOGIN_EMAIL = 'comercial@atlasgr.com.br';

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAuthorizedLoginEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && normalizeLoginEmail(email) === AUTHORIZED_LOGIN_EMAIL;
}
