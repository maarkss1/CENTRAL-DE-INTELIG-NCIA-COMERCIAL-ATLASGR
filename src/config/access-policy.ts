export const AUTHORIZED_LOGIN_EMAILS = [
  'marcelo.nascimento@atlasgr.com.br',
  'joao.reis@atlasgr.com.br',
] as const;

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAuthorizedLoginEmail(email: string | null | undefined): boolean {
  return typeof email === 'string'
    && AUTHORIZED_LOGIN_EMAILS.some(
      (authorizedEmail) => normalizeLoginEmail(email) === authorizedEmail,
    );
}
