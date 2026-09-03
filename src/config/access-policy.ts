export const AUTHORIZED_LOGIN_EMAILS = [
  'marcelo.nascimento@atlasgr.com.br',
  'joao.reis@atlasgr.com.br',
] as const;

export const AUTHORIZED_LOGIN_DOMAINS = ['atlasgr.com.br', 'totaltrac.com.br'] as const;

// Gate de acervo executivo pessoal (RequireUserAllowed), usado em App.tsx (rotas social-selling,
// treinamento-atlasgr, proposta-comercial, hub-inteligencia-marketing), Sidebar.tsx (grupo de nav
// exclusivo) e CommandPalette.tsx (filtro dos módulos executivos). É um sistema DIFERENTE de
// AUTHORIZED_LOGIN_EMAILS acima — aquele controla quem pode fazer login, este controla quem vê um
// conjunto específico de telas depois de logado. As duas listas hoje coincidem na mesma pessoa
// (marcelo.nascimento@atlasgr.com.br) por coincidência de papel, não porque são o mesmo gate.
export const EXECUTIVE_HUB_ALLOWED_EMAIL = 'marcelo.nascimento@atlasgr.com.br';

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
