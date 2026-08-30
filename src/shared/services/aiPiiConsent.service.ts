import { env } from '../../config/env.js';

/**
 * Erro específico (em vez de um `Error` genérico) para que quem chama consiga distinguir "faltou
 * base legal" de qualquer outra falha de execução — e para que o teste que prova a trava não
 * dependa de comparar a mensagem de texto.
 */
export class PiiConsentRequiredError extends Error {
  constructor(organizationId: string | null) {
    super(
      `Consentimento/base legal LGPD não registrado para a organização ${organizationId ?? '(desconhecida)'} ` +
        'enviar dado pessoal de titular a um provedor de IA externo.',
    );
    this.name = 'PiiConsentRequiredError';
  }
}

/**
 * Ponto único de verificação da base legal antes de qualquer dado pessoal de um titular real
 * (nome, e-mail, telefone do Contact, transcrição de conversa) ser processado por um provedor de
 * IA externo (Groq/OpenAI/LiteLLM) — ver `AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS` em
 * src/config/env.ts.
 *
 * Vive em src/shared/ (não em src/features/intelligence/) porque mais de um módulo vertical
 * precisa do mesmo gate antes de enviar PII a um provedor externo — hoje `intelligence` (agentes
 * do enxame, `ai.service.ts`) e `integrations/whatsapp` (`conversation-intelligence.service.ts`,
 * Onda 43). `guardrails.service.ts` reexporta daqui para não quebrar os imports já existentes
 * dentro de `intelligence/`.
 *
 * Fail-closed: nenhuma organização passa até aparecer explicitamente na lista.
 */
export function hasPiiExternalConsent(organizationId: string | null | undefined): boolean {
  if (!organizationId) return false;
  const raw = (env.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS ?? '').trim();
  if (!raw) return false;
  if (raw === '*' || raw === 'all') return true;
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(organizationId);
}

/** Lança `PiiConsentRequiredError` quando a organização não tem base legal registrada. */
export function assertPiiExternalConsent(organizationId: string | null | undefined): void {
  if (!hasPiiExternalConsent(organizationId)) {
    throw new PiiConsentRequiredError(organizationId ?? null);
  }
}
