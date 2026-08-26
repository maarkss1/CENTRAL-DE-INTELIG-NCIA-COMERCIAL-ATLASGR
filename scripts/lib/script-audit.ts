import os from 'node:os';

/**
 * Trilha de auditoria mínima para scripts operacionais destrutivos/sensíveis (reset de senha,
 * promoção de role etc. — ver ITEM-03 da remediação de dívida técnica). Estes scripts rodam fora
 * de qualquer request HTTP, então não existe sessão/usuário autenticado para registrar como ator:
 * o melhor sinal disponível é um ator explícito (variável de ambiente, preenchida por quem
 * dispara o runbook/pipeline) ou, na falta dele, o usuário do sistema operacional.
 *
 * IMPORTANTE: nunca passe segredo, hash de senha ou qualquer dado sensível para `logAuditEvent` —
 * ele é pensado para acabar em stdout/logs de CI, que não são um cofre.
 */
export function resolveScriptActor(envVarName: string): string {
  const fromEnv = process.env[envVarName]?.trim();
  if (fromEnv) return fromEnv;
  try {
    const osUser = os.userInfo().username?.trim();
    if (osUser) return osUser;
  } catch {
    // os.userInfo() pode falhar em alguns sandboxes/contêineres sem entrada em /etc/passwd —
    // cair para 'unknown' é melhor do que o script quebrar por causa da trilha de auditoria.
  }
  return 'unknown';
}

/** Registra um evento de auditoria estruturado (JSON) em stdout — nunca inclua segredos aqui. */
export function logAuditEvent(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ ...event, loggedAt: new Date().toISOString() }));
}
