import { logger } from '../../../lib/logger.js';
import {
  applyStopDecision,
  decideCadenceAction,
  recordTouchAttempt,
  type CadenceDecision,
  type CadenceRunState,
  type CadenceRunStatus,
  type CadenceSequenceDefinition,
  type CadenceTouch,
} from '../domain/cadence.js';
import { isOptedOut } from './optOutService.js';
import type { OptOutRepository, OptOutSubject } from '../domain/optOut.js';
import {
  evaluateRateLimitForUpcomingTouch,
  type CadenceRateLimitPort,
} from './rateLimitService.js';
import type { CadenceRateLimitPolicy, RateLimitBlockReason } from '../domain/rateLimit.js';

/**
 * Orquestra um ciclo da cadência: decide a ação (`decideCadenceAction`), consulta o opt-out
 * unificado (entrega 1) para o canal do próximo toque, despacha via a porta `CadenceDispatcher`
 * (implementada por cada canal — 05/06/12, fora do meu escopo de arquivo) e grava o resultado
 * real. Nenhuma escrita de "enviado" acontece sem confirmação do `CadenceDispatcher`.
 */

export interface CadenceRunListFilter {
  status?: CadenceRunStatus[];
}

export interface CadenceRunRepository {
  save(run: CadenceRunState): Promise<void>;
  findById(organizationId: string, id: string): Promise<CadenceRunState | null>;
  /**
   * Lista os runs de uma organização — adicionado na Onda 10 (Agente 17) para alimentar
   * `CadenceHub.tsx`/`GET /api/cadence/runs`. `save`/`findById` sozinhos bastavam para o
   * scheduler (que sempre sabe o `runId` de antemão), mas não para popular uma tela: o vendedor
   * não chega com um id de run, chega olhando "quais cadências estão rodando/pausadas/paradas
   * agora". Sem filtro de status devolve tudo (até o cap interno de cada adaptador).
   */
  listByOrganization(
    organizationId: string,
    filter?: CadenceRunListFilter,
  ): Promise<CadenceRunState[]>;
}

/** Implementado por cada canal — a ligação real com e-mail/WhatsApp/voz não é responsabilidade deste domínio. */
export interface CadenceDispatcher {
  dispatch(
    touch: CadenceTouch,
    run: CadenceRunState,
  ): Promise<{
    result: 'sent' | 'failed';
    error?: string | null;
    providerMessageId?: string | null;
  }>;
}

/** Resolve o sujeito de opt-out (leadId + e-mail + telefone) a partir do lead — evita repetir a busca em cada chamada. */
export interface LeadSubjectResolver {
  resolve(organizationId: string, leadId: string): Promise<OptOutSubject>;
}

/**
 * Trava de execução por run — corrige CYC-008 (onda-18): antes desta porta, `advanceCadenceRun`
 * não tinha nenhum mecanismo impedindo dois ciclos concorrentes (dois workers, ou um retry de
 * fila) para o MESMO `runId` de chamarem `dispatcher.dispatch` duas vezes para o mesmo toque —
 * nada gravava "em andamento" antes do envio real. `acquire` deve devolver `acquired: false`
 * quando outro ciclo já detém a trava para este `runId` (nunca bloquear esperando); `release`
 * deve ser idempotente e seguro de chamar mesmo se a trava já expirou por TTL.
 */
export interface CadenceRunLockPort {
  acquire(runId: string): Promise<{ acquired: boolean; release: () => Promise<void> }>;
}

export interface AdvanceCadenceRunDeps {
  runRepo: CadenceRunRepository;
  optOutRepo: OptOutRepository;
  subjectResolver: LeadSubjectResolver;
  dispatcher: CadenceDispatcher;
  lock: CadenceRunLockPort;
  isWithinBusinessWindow: (now: Date) => boolean;
  hasLeadReplied: (organizationId: string, leadId: string) => Promise<boolean>;
  /** Porta de contagem do rate limit por contato/domínio (auditoria transversal, Agente 17) — ver `rateLimitService.ts`. */
  rateLimit: CadenceRateLimitPort;
  /** Override de política de rate limit — omitido usa `loadCadenceRateLimitPolicy()` (env var com default), ver `rateLimitConfig.ts`. */
  rateLimitPolicy?: CadenceRateLimitPolicy;
}

export type { CadenceRateLimitPort };

export interface AdvanceCadenceRunResult {
  run: CadenceRunState;
  decision: CadenceDecision;
}

/**
 * Grava o resultado do ciclo com algumas tentativas de retry (backoff curto). Existe só para o
 * caminho pós-dispatch: quando `dispatcher.dispatch` já confirmou um envio real (`result: 'sent'`
 * ou `'failed'`) e a gravação em seguida falha por um blip transitório de banco, o run fica
 * `currentTouchOrder` inalterado — o próximo ciclo do scheduler leria o mesmo estado, decidiria
 * `dispatch` de novo e chamaria o canal real uma SEGUNDA vez para o mesmo toque, duplicando a
 * mensagem enviada ao lead. Isso não é hipotético: nada entre `dispatcher.dispatch` e
 * `runRepo.save` é transacional (o envio real e a gravação local não são a mesma operação
 * atômica). Um retry curto cobre o caso comum (blip de conexão); se mesmo assim falhar, o erro é
 * relançado — quem chama loga em nível crítico distinto (ver `advanceCadenceRun`) para que uma
 * falha persistente vire alerta operacional, não silêncio.
 */
async function saveWithRetry(
  runRepo: CadenceRunRepository,
  run: CadenceRunState,
  attempts = 3,
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await runRepo.save(run);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      }
    }
  }
  throw lastErr;
}

/**
 * `true` quando a ÚLTIMA tentativa já registrada para `touchOrder` já é um `skipped` com o MESMO
 * motivo de rate limit desta decisão — usado para não gravar uma linha nova de
 * `CadenceTouchAttempt` a cada tick do scheduler enquanto o bloqueio persiste (ver comentário em
 * `advanceCadenceRun`). Um motivo diferente (ex.: passou de `domain-rate-limit` para
 * `contact-rate-limit`) ainda grava, porque é informação nova.
 */
function isRedundantRateLimitSkip(
  run: CadenceRunState,
  touchOrder: number,
  reason: RateLimitBlockReason,
): boolean {
  const attemptsForTouch = run.attempts.filter((a) => a.touchOrder === touchOrder);
  const last = attemptsForTouch[attemptsForTouch.length - 1];
  return last?.result === 'skipped' && last.skipReason === reason;
}

/**
 * Roda um ciclo de avaliação/despacho para um run existente. Idempotente de chamar mais de uma
 * vez no mesmo instante quando a decisão é `wait`/`stop` (nada é escrito além do estado já
 * persistido); quando a decisão é `dispatch`, o resultado real do canal é sempre gravado, nunca
 * assumido.
 */
export async function advanceCadenceRun(
  deps: AdvanceCadenceRunDeps,
  organizationId: string,
  runId: string,
  sequence: CadenceSequenceDefinition,
  now: Date,
): Promise<AdvanceCadenceRunResult> {
  const run = await deps.runRepo.findById(organizationId, runId);
  if (!run)
    throw new Error(`CadenceRun ${runId} não encontrado para a organização ${organizationId}.`);

  // Trava todo o ciclo (leitura já feita → decisão → despacho real → gravação) para este runId.
  // Sem isso, dois ciclos concorrentes (dois workers, ou um retry de fila) para o MESMO run podiam
  // ler o mesmo `currentTouchOrder`, os dois decidirem 'dispatch', e os dois chamarem
  // `dispatcher.dispatch` — duplicando o envio real ao lead antes que qualquer gravação existisse
  // para o segundo checar (CYC-008, onda-18). Se não conseguir a trava, este ciclo não faz nada:
  // o run já está sendo avançado por outro processo agora, e o próximo tick tenta de novo.
  const lock = await deps.lock.acquire(runId);
  if (!lock.acquired) {
    logger.warn(
      { organizationId, runId },
      'Ciclo de cadência pulado: outro processo já está avançando este run.',
    );
    return { run, decision: { type: 'wait', reason: 'locked' } };
  }

  try {
    const hasLeadReplied = await deps.hasLeadReplied(organizationId, run.leadId);

    // Opt-out e rate limit são checados para o canal do PRÓXIMO toque (ou global, coberto por
    // isOptedOut) — se o run já terminou (sem próximo toque), não há canal a checar e
    // `decideCadenceAction` resolve isso sozinho como 'completed'.
    const upcomingTouch = sequence.touches.find((t) => t.order === run.currentTouchOrder);
    let isOptedOutForUpcoming = false;
    let rateLimitBlock: RateLimitBlockReason | null = null;
    if (upcomingTouch) {
      const subject = await deps.subjectResolver.resolve(organizationId, run.leadId);
      isOptedOutForUpcoming = await isOptedOut(
        deps.optOutRepo,
        organizationId,
        subject,
        upcomingTouch.channel,
      );
      // Rate limit por contato/domínio (auditoria transversal, Agente 17) — cruza QUALQUER
      // cadência/run do mesmo lead, não só este run: o lock `deps.lock` só serializa dois
      // ciclos concorrentes do MESMO runId, nunca protegeu contra o mesmo contato sendo
      // atingido por cadências DIFERENTES em sequência. Checado por último (mesma ordem de
      // `decideCadenceAction`): só vale a pena consultar quando o toque despacharia de
      // qualquer outro jeito.
      rateLimitBlock = await evaluateRateLimitForUpcomingTouch(deps.rateLimit, {
        organizationId,
        leadId: run.leadId,
        email: subject.email ?? null,
        channel: upcomingTouch.channel,
        now,
        policy: deps.rateLimitPolicy,
      });
    }

    const decision = decideCadenceAction(run, sequence, now, {
      isOptedOut: isOptedOutForUpcoming,
      hasLeadReplied,
      isWithinBusinessWindow: deps.isWithinBusinessWindow,
      rateLimitBlock,
    });

    if (decision.type === 'stop') {
      const stopped: CadenceRunState = applyStopDecision(run, decision.reason, now);
      await deps.runRepo.save(stopped);
      if (stopped !== run) {
        logger.info(
          {
            organizationId,
            runId,
            leadId: run.leadId,
            reason: decision.reason,
            status: stopped.status,
          },
          'Cadência encerrada.',
        );
      }
      return { run: stopped, decision };
    }

    if (decision.type === 'wait') {
      // Registra o bloqueio de rate limit UMA vez por "episódio" (nunca falha silenciosamente
      // — requisito da auditoria), não a cada tick do scheduler (5 min): sem essa deduplicação,
      // um contato bloqueado por horas acumularia uma linha de `CadenceTouchAttempt` por
      // ciclo. `isRedundantRateLimitSkip` compara com a ÚLTIMA tentativa já registrada para
      // este `touchOrder` — só grava de novo se o motivo mudou (ex.: de domínio para contato)
      // ou não havia registro ainda.
      const reason = decision.reason;
      if (
        (reason === 'contact-rate-limit' || reason === 'domain-rate-limit') &&
        upcomingTouch &&
        !isRedundantRateLimitSkip(run, upcomingTouch.order, reason)
      ) {
        const skipped = recordTouchAttempt(run, sequence, upcomingTouch, now, {
          result: 'skipped',
          skipReason: reason,
        });
        await deps.runRepo.save(skipped);
        logger.warn(
          {
            organizationId,
            runId,
            leadId: run.leadId,
            touchOrder: upcomingTouch.order,
            channel: upcomingTouch.channel,
            reason,
          },
          'Toque de cadência bloqueado por rate limit — motivo registrado; cadência permanece ativa para nova tentativa no próximo ciclo elegível.',
        );
        return { run: skipped, decision };
      }
      return { run, decision };
    }

    // decision.type === 'dispatch'
    const outcome = await deps.dispatcher.dispatch(decision.touch, run);
    const updated = recordTouchAttempt(run, sequence, decision.touch, now, {
      result: outcome.result,
      error: outcome.error ?? null,
      providerMessageId: outcome.providerMessageId ?? null,
    });
    try {
      await saveWithRetry(deps.runRepo, updated);
    } catch (persistErr) {
      // O canal já foi chamado de verdade (outcome já existe) — a gravação é que não
      // confirmou mesmo após retry. Log distinto e de alta severidade: sem isto, o próximo
      // ciclo simplesmente re-despacharia o mesmo toque para o mesmo lead, e ninguém saberia
      // por quê. Continua propagando o erro (não finge sucesso) para o chamador tratar como
      // falha de ciclo, mas o log abaixo é o que torna o risco de duplicidade observável.
      logger.error(
        {
          err: persistErr,
          organizationId,
          runId,
          leadId: run.leadId,
          touchOrder: decision.touch.order,
          channel: decision.touch.channel,
          dispatchResult: outcome.result,
        },
        'Toque de cadência despachado ao canal real, mas não foi possível persistir o resultado após retry — risco de reenvio duplicado no próximo ciclo. Requer verificação manual.',
      );
      throw persistErr;
    }

    logger.info(
      {
        organizationId,
        runId,
        leadId: run.leadId,
        touchOrder: decision.touch.order,
        channel: decision.touch.channel,
        result: outcome.result,
      },
      outcome.result === 'sent' ? 'Toque de cadência enviado.' : 'Toque de cadência falhou.',
    );

    return { run: updated, decision };
  } finally {
    await lock.release();
  }
}
