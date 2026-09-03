import type { CadenceChannel } from '../domain/optOut.js';
import {
  DEFAULT_RATE_LIMIT_POLICY,
  decideRateLimitBlock,
  extractEmailDomain,
  type CadenceRateLimitPolicy,
  type LastSentTouch,
  type RateLimitBlockReason,
} from '../domain/rateLimit.js';

/**
 * Porta de contagem para o rate limit de cadência (auditoria transversal, Agente 17). Deliberadamente
 * SEPARADA de `CadenceRunRepository`: as contagens abaixo cruzam TODOS os runs de um lead (qualquer
 * cadência/campanha), não só o run que está sendo avançado agora — é exatamente o que
 * `CadenceRunRepository.findById`/`save` não expõem (escopados a um único `runId`).
 *
 * Implementações: `infra/PrismaCadenceRateLimitPort.ts` (real, `CadenceTouchAttempt` join
 * `CadenceRun`/`Lead`/`Contact`) e `infra/InMemoryCadenceRateLimitPort.ts` (teste, deriva das
 * mesmas `CadenceRunState` já seedadas em `InMemoryCadenceRunRepository`).
 */
export interface CadenceRateLimitPort {
  /** Quantos toques com `result: 'sent'` este contato recebeu, em QUALQUER canal e QUALQUER cadência/run, dentro de `[since, until]`. */
  countSentTouchesForContact(
    organizationId: string,
    leadId: string,
    since: Date,
    until: Date,
  ): Promise<number>;
  /**
   * Quantos contatos DISTINTOS cujo e-mail termina em `@${emailDomain}` já receberam um toque de
   * e-mail `sent` dentro de `[since, until]`, e se `leadId` já está entre eles (nesse caso ele não
   * é um destinatário NOVO — ver `isDomainRateLimited`).
   */
  countDistinctEmailRecipientsForDomain(
    organizationId: string,
    emailDomain: string,
    since: Date,
    until: Date,
    leadId: string,
  ): Promise<{ distinctRecipientsToday: number; currentLeadAlreadyCounted: boolean }>;
  /**
   * O toque `result: 'sent'` mais recente deste contato, em QUALQUER canal e QUALQUER
   * cadência/run — base do limite de espaçamento entre canais (`channel-spacing`,
   * `domain/rateLimit.ts`). `null` quando o contato nunca recebeu nenhum toque 'sent'.
   */
  findLastSentTouch(organizationId: string, leadId: string): Promise<LastSentTouch | null>;
}

export interface EvaluateRateLimitInput {
  organizationId: string;
  leadId: string;
  /** E-mail do contato já resolvido pelo chamador (mesmo `LeadSubjectResolver` usado para opt-out) — evita resolver duas vezes. */
  email: string | null;
  channel: CadenceChannel;
  now: Date;
  policy?: CadenceRateLimitPolicy;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Orquestra a checagem de rate limit para o PRÓXIMO toque a despachar: calcula a janela do limite
 * por contato, consulta a porta, e — só para canal `email` com e-mail resolvido — consulta também
 * o limite por domínio (janela = dia corrente, mesmo padrão de "hoje" já usado em
 * `dailyExecutiveSummary.worker.ts`/`usage.service.ts`: `setHours(0,0,0,0)` no relógio do servidor,
 * não fuso do destinatário — não é o mesmo cuidado de `isWithinCallWindow`, que decide SE liga
 * agora; aqui é só "hoje" para fins de cota de volume, uma imprecisão de poucas horas na virada do
 * dia não muda o resultado prático). Devolve o motivo de bloqueio (se algum) já pronto para
 * `CadenceDecisionContext.rateLimitBlock`.
 */
export async function evaluateRateLimitForUpcomingTouch(
  port: CadenceRateLimitPort,
  input: EvaluateRateLimitInput,
): Promise<RateLimitBlockReason | null> {
  const policy = input.policy ?? DEFAULT_RATE_LIMIT_POLICY;

  const contactWindowStart = new Date(input.now.getTime() - policy.contactWindowHours * 3_600_000);
  const sentTouchesInWindow = await port.countSentTouchesForContact(
    input.organizationId,
    input.leadId,
    contactWindowStart,
    input.now,
  );

  let domainCheck: { distinctRecipientsToday: number; currentLeadAlreadyCounted: boolean } | null =
    null;
  if (input.channel === 'email') {
    const domain = extractEmailDomain(input.email);
    if (domain) {
      domainCheck = await port.countDistinctEmailRecipientsForDomain(
        input.organizationId,
        domain,
        startOfDay(input.now),
        input.now,
        input.leadId,
      );
    }
  }

  const lastTouch = await port.findLastSentTouch(input.organizationId, input.leadId);

  return decideRateLimitBlock({
    channel: input.channel,
    sentTouchesInWindow,
    domainCheck,
    lastTouch,
    now: input.now,
    policy,
  });
}
