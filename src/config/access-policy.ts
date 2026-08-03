export const AUTHORIZED_LOGIN_EMAILS = [
  'marcelo.nascimento@atlasgr.com.br',
  'joao.reis@atlasgr.com.br',
] as const;

export const AUTHORIZED_LOGIN_DOMAINS = [
  'atlasgr.com.br',
  'totaltrac.com.br',
  // Mesma marca, grafia com "k" também usada em e-mails reais da equipe (ver TotalTrackLogo,
  // totaltrack-logo.png) — sem isso, contas como kaue.oliveira@totaltrack.com.br são
  // rejeitadas no login mesmo com a senha correta.
  'totaltrack.com.br',
] as const;

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAuthorizedLoginEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  const normalized = normalizeLoginEmail(email);

  // Verifica se o e-mail exato está na lista de e-mails autorizados
  if (AUTHORIZED_LOGIN_EMAILS.some((authorizedEmail) => normalized === authorizedEmail)) {
    return true;
  }

  // Verifica se o domínio do e-mail é de um dos domínios corporativos da AtlasGR ou TotalTrac
  const domain = normalized.split('@')[1];
  if (domain && AUTHORIZED_LOGIN_DOMAINS.some((allowedDomain) => domain === allowedDomain)) {
    return true;
  }

  return false;
}

export function getBrandFromEmail(email: string): 'atlasgr' | 'totaltrac' {
  const normalized = normalizeLoginEmail(email);
  if (normalized.includes('totaltrac') || normalized.includes('totaltrack')) {
    return 'totaltrac';
  }
  return 'atlasgr';
}

