/**
 * Política de retry para chamadas de IA. Isolado do circuit breaker (circuit-breaker.ts) e dos
 * adapters de provedor (providers/*) de propósito: retry decide "essa falha específica vale a
 * pena tentar de novo agora?"; circuit breaker decide "esse provedor já falhou demais, nem tente
 * mandar tráfego pra ele por um tempo". São políticas independentes que se compõem em
 * `circuit-breaker.ts#callProvider`.
 */

// Retry só compensa para falhas que podem ser passageiras (timeout, sobrecarga do provedor).
// Uma falha de rede/conexão (provedor fora do ar) não some com uma segunda tentativa imediata —
// nesse caso é melhor cair pro próximo provedor da cadeia o quanto antes.
// 3 tentativas (não 2): um enxame chega a fazer ~6-9 chamadas Groq em poucos segundos (roteamento
// do supervisor + cada especialista + síntese final), então é comum bater no limite de TPM do
// tier gratuito (6000/min) no meio de uma missão — o próprio Groq já informa o tempo de espera
// necessário ("Please try again in 440ms"), então vale a pena esperar exatamente isso e tentar de
// novo em vez de derrubar a etapa inteira do enxame.
export const MAX_ATTEMPTS_PER_LEG = 3;
export const RETRY_BASE_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extrai o tempo de espera sugerido pelo próprio provedor num erro de rate limit, ex.:
 * "Please try again in 440ms" ou "Please try again in 2.5s" (formato do Groq/OpenAI). Sem isso,
 * um backoff fixo pode ser curto demais (a janela de TPM ainda não resetou) ou desperdiçar tempo
 * esperando mais do que o necessário.
 */
export function extractSuggestedRetryDelayMs(message: string): number | null {
  const msMatch = message.match(/try again in\s+([\d.]+)\s*ms/i);
  if (msMatch) return Math.ceil(Number(msMatch[1]));
  const secondsMatch = message.match(/try again in\s+([\d.]+)\s*s\b/i);
  if (secondsMatch) return Math.ceil(Number(secondsMatch[1]) * 1000);
  return null;
}

/**
 * Classifica se um erro vale a pena reexecutar. Timeout/abort NÃO é reexecutado aqui: por
 * definição já esperamos o tempo máximo configurado (até 120s) para chegar a esse erro, então
 * repetir dobraria a espera do usuário/agente sem ganho real — o gateway já cai para a próxima
 * camada de provedor nesse caso. Só vale a pena reexecutar erros que falham RÁPIDO (resposta HTTP
 * com status de erro, ou recusa de conexão).
 */
export function isRetryableAiError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (/HTTP (429|5\d{2}):/.test(error.message)) return true;
  if (error.name === 'TypeError' && /fetch|network/i.test(error.message)) return true;
  return false;
}

/**
 * Reexecuta `fn` após uma falha claramente transitória e rápida (HTTP 429/5xx, recusa de conexão)
 * antes de desistir. Timeout não é reexecutado (já esperamos o tempo máximo configurado pra chegar
 * lá) e erros de validação/autenticação (4xx) também não — repetir uma chave inválida ou um payload
 * malformado só adiciona latência sem chance de sucesso.
 * Em erros de rate limit (429), respeita o tempo de espera que o próprio provedor sugeriu em vez do
 * backoff fixo, quando disponível — ver `extractSuggestedRetryDelayMs`.
 * Usado pelo próprio gateway (cada camada de provedor) e reaproveitado por outros serviços de IA
 * (ex.: geração de conteúdo em ai.service.ts) para não precisarem reimplementar a mesma lógica.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 1,
  backoffMs: number = 400,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableAiError(error)) throw error;
      const suggestedMs =
        error instanceof Error ? extractSuggestedRetryDelayMs(error.message) : null;
      const delay =
        suggestedMs !== null ? Math.max(suggestedMs + 50, backoffMs) : backoffMs * (attempt + 1);
      await sleep(delay);
    }
  }
  throw lastError;
}
