import type { CadenceChannel } from './optOut.js';

/**
 * Rate limit de cadência — auditoria transversal do Agente 17: o módulo já tinha opt-out
 * multicanal, stop on response/conversion, lock de concorrência por run e janela comercial real,
 * mas nenhuma proteção contra o MESMO contato (ou o MESMO domínio de e-mail) receber toques em
 * excesso quando várias cadências/campanhas diferentes miram o mesmo lead em sequência — o lock
 * existente (`CadenceRunLockPort`) só serializa dois ciclos concorrentes do MESMO `runId`, não
 * enxerga outros runs.
 *
 * Puro de propósito, mesmo espírito de `optOut.ts`/`coldCall.policy.ts`: as CONTAGENS (quantos
 * toques um contato já recebeu, quantos contatos de um domínio já receberam e-mail hoje) exigem
 * I/O (consultar `CadenceTouchAttempt`/`CadenceRun` de QUALQUER run, não só o run atual) e por
 * isso vivem em `application/rateLimitService.ts` (porta `CadenceRateLimitPort`); a decisão sobre
 * o que fazer com essas contagens — bloquear ou não — é lógica pura e testável aqui.
 */

/**
 * Motivo de bloqueio por rate limit — subconjunto de `CadenceSkipReason` (ver `domain/cadence.ts`).
 * `channel-spacing` (achado da auditoria, PR #328, item fora de escopo original): o limite por
 * contato acima é um CAP DE VOLUME (só bloqueia a partir do Nº toque em 24h) — não impede dois
 * `CadenceRun`s diferentes do mesmo lead (ex.: sequência de e-mail e sequência de WhatsApp, cada
 * uma com `delayHoursFromPrevious: 0` no primeiro toque) de despachar quase simultaneamente no
 * mesmo ciclo do scheduler, o que para o destinatário parece perseguição mesmo sem estourar
 * nenhuma cota.
 */
export type RateLimitBlockReason = 'contact-rate-limit' | 'channel-spacing' | 'domain-rate-limit';

export interface CadenceRateLimitPolicy {
  /** N: máximo de toques com `result: 'sent'`, em QUALQUER canal e QUALQUER cadência/run, por contato dentro da janela (`contactWindowHours`). */
  maxTouchesPerContactWindow: number;
  /** Duração da janela deslizante do limite por contato, em horas. */
  contactWindowHours: number;
  /** M: máximo de contatos DISTINTOS do mesmo domínio de e-mail recebendo e-mail (`result: 'sent'`, canal `email`) no mesmo dia. */
  maxEmailRecipientsPerDomainPerDay: number;
  /**
   * Intervalo mínimo, em minutos, entre dois toques 'sent' de CANAIS DIFERENTES para o mesmo
   * contato — cruza QUALQUER `CadenceRun`/cadência, mesmo espírito de `maxTouchesPerContactWindow`.
   * Um segundo toque no MESMO canal do último enviado nunca é bloqueado por este motivo (é o que
   * `delayHoursFromPrevious` do próprio toque já governa, dentro do mesmo run).
   */
  minMinutesBetweenChannelTouches: number;
}

/**
 * Default: 3 toques/24h por contato, 20 destinatários distintos/dia por domínio.
 *
 * - `3` é o mínimo realista de uma cadência comercial de verdade (ex.: e-mail → WhatsApp → voz,
 *   a sequência padrão deste produto) sem abrir margem para 2+ cadências/campanhas cobrindo o
 *   mesmo lead ao mesmo tempo inundarem-no de toques que cada uma, isoladamente, considera normal.
 * - `24h` é a janela deslizante mais simples de explicar para o vendedor ("esse contato já levou
 *   3 toques nas últimas 24h") e casa com o ciclo diário do funil comercial deste produto.
 * - `20` contatos/domínio/dia é conservador o bastante para não sinalizar como spam a provedores
 *   corporativos de e-mail (Google Workspace/Microsoft 365 monitoram volume por domínio de
 *   destino, não só por remetente) mas ainda permite prospecção real de contas grandes (uma
 *   transportadora com múltiplos decisores no mesmo domínio).
 * - `30` minutos entre canais diferentes é o suficiente para nunca parecer disparo simultâneo
 *   (o scheduler roda a cada 5 minutos, `SCAN_INTERVAL_MS` em `cadenceRun.worker.ts` — 30min é 6
 *   ciclos, folga real, não um valor no limite) sem atrasar de forma perceptível uma cadência
 *   legítima de e-mail → WhatsApp no mesmo dia.
 *
 * Nenhum destes quatro é hardcoded sem nome no ponto de uso — configuráveis por env var, ver
 * `application/rateLimitConfig.ts`.
 */
export const DEFAULT_RATE_LIMIT_POLICY: CadenceRateLimitPolicy = {
  maxTouchesPerContactWindow: 3,
  contactWindowHours: 24,
  maxEmailRecipientsPerDomainPerDay: 20,
  minMinutesBetweenChannelTouches: 30,
};

/**
 * Domínio (minúsculo) de um e-mail, ou `null` quando o valor não é um e-mail reconhecível. Mesma
 * tolerância de `normalizeOptOutSubject` (`domain/optOut.ts`): melhor não aplicar o limite de
 * domínio por um dado ruim do que travar uma cadência inteira por engano de parsing.
 */
export function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  return trimmed.slice(at + 1);
}

/** Contato já recebeu `sentTouchesInWindow` toques 'sent' (qualquer canal/cadência) dentro da janela — no limite ou acima dele bloqueia o próximo. */
export function isContactRateLimited(
  sentTouchesInWindow: number,
  policy: CadenceRateLimitPolicy = DEFAULT_RATE_LIMIT_POLICY,
): boolean {
  return sentTouchesInWindow >= policy.maxTouchesPerContactWindow;
}

/**
 * Domínio já tem `distinctRecipientsToday` contatos distintos com e-mail 'sent' hoje. Um contato
 * que JÁ está entre os contados (`currentLeadAlreadyCounted`) nunca é bloqueado por este motivo —
 * ele não é um destinatário NOVO que estouraria a cota do domínio; o limite por contato acima é
 * quem decide se ele já recebeu e-mail demais.
 */
export function isDomainRateLimited(
  distinctRecipientsToday: number,
  currentLeadAlreadyCounted: boolean,
  policy: CadenceRateLimitPolicy = DEFAULT_RATE_LIMIT_POLICY,
): boolean {
  if (currentLeadAlreadyCounted) return false;
  return distinctRecipientsToday >= policy.maxEmailRecipientsPerDomainPerDay;
}

export interface DomainRateLimitCheck {
  distinctRecipientsToday: number;
  currentLeadAlreadyCounted: boolean;
}

export interface LastSentTouch {
  channel: CadenceChannel;
  attemptedAt: Date;
}

/**
 * O último toque 'sent' (qualquer canal/cadência/run) que este contato recebeu ainda está a menos
 * de `minMinutesBetweenChannelTouches` do candidato — só bloqueia quando o CANAL é diferente (dois
 * toques seguidos no mesmo canal já são governados por `delayHoursFromPrevious` do próprio toque,
 * dentro do run; não é papel deste limite duplicar essa regra).
 */
export function isChannelSpacingLimited(
  candidateChannel: CadenceChannel,
  lastTouch: LastSentTouch | null,
  now: Date,
  policy: CadenceRateLimitPolicy = DEFAULT_RATE_LIMIT_POLICY,
): boolean {
  if (!lastTouch || lastTouch.channel === candidateChannel) return false;
  const elapsedMinutes = (now.getTime() - lastTouch.attemptedAt.getTime()) / 60_000;
  return elapsedMinutes < policy.minMinutesBetweenChannelTouches;
}

export interface DecideRateLimitBlockInput {
  channel: CadenceChannel;
  sentTouchesInWindow: number;
  /** `null` quando o canal não é `email` ou o e-mail do contato não pôde ser resolvido/normalizado — nesse caso só o limite por contato se aplica. */
  domainCheck: DomainRateLimitCheck | null;
  /** `null` quando este é o primeiro toque 'sent' já registrado para o contato — nada a espaçar. */
  lastTouch: LastSentTouch | null;
  now: Date;
  policy?: CadenceRateLimitPolicy;
}

/**
 * Decide, a partir das contagens já obtidas (I/O feito por quem chama), qual bloqueio de rate
 * limit (se algum) se aplica ao próximo toque. Ordem de precedência (motivo mais específico ao
 * contato primeiro): limite de volume por contato → espaçamento entre canais → limite de domínio.
 * Um contato que já estourou o próprio limite de volume não precisa do motivo de espaçamento nem
 * de domínio para ser bloqueado.
 */
export function decideRateLimitBlock(
  input: DecideRateLimitBlockInput,
): RateLimitBlockReason | null {
  const policy = input.policy ?? DEFAULT_RATE_LIMIT_POLICY;
  if (isContactRateLimited(input.sentTouchesInWindow, policy)) return 'contact-rate-limit';
  if (isChannelSpacingLimited(input.channel, input.lastTouch, input.now, policy)) {
    return 'channel-spacing';
  }
  if (
    input.channel === 'email' &&
    input.domainCheck &&
    isDomainRateLimited(
      input.domainCheck.distinctRecipientsToday,
      input.domainCheck.currentLeadAlreadyCounted,
      policy,
    )
  ) {
    return 'domain-rate-limit';
  }
  return null;
}
