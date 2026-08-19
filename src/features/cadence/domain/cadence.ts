/**
 * Máquina de estados da cadência multicanal — entrega 2 do Agente 17
 * (`.agents/prompts/17-cadencia-ciclo-receita.md`).
 *
 * Puro de propósito, mesmo espírito de `coldCall.policy.ts`: sem banco, sem rede, sem relógio
 * implícito (todo "agora" entra como parâmetro). O que decide se um toque sai ou não é
 * `decideCadenceAction`; tudo que muda o estado do "run" depois de uma decisão é uma das funções
 * `apply*`, que sempre devolvem um novo objeto (nunca mutam o estado recebido).
 *
 * Requisitos duros do prompt, todos aplicados aqui:
 * - resposta do lead encerra a cadência, em qualquer canal (`applyReplyStop`);
 * - opt-out encerra imediatamente (`applyOptOutStop`) — checado ANTES de qualquer outra regra em
 *   `decideCadenceAction`, porque é a trava mais importante do domínio;
 * - janela comercial vale para todo contato externo (`ctx.isWithinBusinessWindow`, injetada —
 *   reaproveite `isWithinCallWindow` de `coldCall.policy.ts` como implementação real);
 * - cada toque registra tentativa, resultado real e erro — nunca "enviado" otimista
 *   (`CadenceTouchAttempt`, `recordTouchAttempt` só marca `sent` quando o chamador confirma);
 * - pausa e retomada manual disponíveis para o vendedor (`pauseCadenceRun`/`resumeCadenceRun`).
 */

import type { CadenceChannel } from './optOut.js';

export type { CadenceChannel };

/** Um passo da sequência configurável (e-mail → WhatsApp → voz → e-mail…). */
export interface CadenceTouch {
    /** 1-based, ordem de execução dentro da sequência. */
    order: number;
    channel: CadenceChannel;
    /** Horas desde o toque anterior (0 para o primeiro toque — dispara assim que o run começa, respeitada a janela comercial). */
    delayHoursFromPrevious: number;
    /** Quantas tentativas este toque aceita antes de desistir dele e avançar (falha de provedor não pode travar a cadência para sempre). Default 1 = sem retry. */
    maxAttempts?: number;
    /** Referência ao conteúdo (id de template/roteiro) — resolvido pelo canal, não por este domínio. */
    templateRef?: string | null;
}

export interface CadenceSequenceDefinition {
    id: string;
    name: string;
    /** Ordenado por `order`, sem lacunas nem repetição — ver `validateSequence`. */
    touches: CadenceTouch[];
}

/**
 * 5 estados do roadmap (CYC-002): `completed`/`failed` são terminais distintos de `stopped` —
 * `completed` é o fim natural da sequência (todos os toques resolvidos), `failed` é uma falha
 * estrutural do próprio run (hoje, só a sequência associada ter ficado inválida/inacessível —
 * ver `applyPolicyGuardrailFailure`), `stopped` é encerramento por sinal externo (opt-out,
 * resposta do lead, ou parada manual do vendedor).
 */
export type CadenceRunStatus = 'active' | 'paused' | 'stopped' | 'completed' | 'failed';
export type CadenceStopReason = 'opt-out' | 'lead-reply' | 'completed' | 'manual-stop' | 'policy-guardrail';
export type CadenceTouchResult = 'sent' | 'failed' | 'skipped';
export type CadenceSkipReason = 'outside-business-window' | 'opt-out' | 'lead-replied' | 'paused';

export interface CadenceTouchAttempt {
    touchOrder: number;
    /** 1-based, conta quantas linhas (de qualquer resultado) já existem para este `touchOrder` — inclui esta. Nunca reseta entre tentativas com/sem sucesso; é o "tentativa nº X deste toque" citado no roadmap (CYC-002). */
    attemptNumber: number;
    channel: CadenceChannel;
    attemptedAt: Date;
    result: CadenceTouchResult;
    skipReason?: CadenceSkipReason;
    error?: string | null;
    /** Id da mensagem devolvido pelo provedor (WhatsApp/e-mail) quando `result === 'sent'` — correlação para suporte/depuração, nunca usado para decidir estado. */
    providerMessageId?: string | null;
}

export interface CadenceRunState {
    id: string;
    organizationId: string;
    leadId: string;
    sequenceId: string;
    status: CadenceRunStatus;
    /** Próximo toque a tentar (`order` de `CadenceTouch`). Sequência concluída quando não existe touch com este `order`. */
    currentTouchOrder: number;
    stopReason: CadenceStopReason | null;
    startedAt: Date;
    lastTouchAt: Date | null;
    pausedAt: Date | null;
    stoppedAt: Date | null;
    attempts: CadenceTouchAttempt[];
}

export interface CadenceDecisionContext {
    isOptedOut: boolean;
    hasLeadReplied: boolean;
    /** Injeção da regra de janela comercial (reaproveite `isWithinCallWindow`, não reimplemente aqui). */
    isWithinBusinessWindow: (now: Date) => boolean;
}

export type CadenceDecision =
    | { type: 'stop'; reason: CadenceStopReason }
    | { type: 'wait'; reason: CadenceSkipReason | 'delay-not-elapsed' | 'locked'; nextEligibleAt?: Date }
    | { type: 'dispatch'; touch: CadenceTouch };

/** Sequência válida: `touches` não vazio, ordenado 1..N sem lacunas nem repetição. */
export function validateSequence(sequence: CadenceSequenceDefinition): string[] {
    const errors: string[] = [];
    if (sequence.touches.length === 0) errors.push('Sequência sem nenhum toque.');
    const orders = [...sequence.touches].map((t) => t.order).sort((a, b) => a - b);
    orders.forEach((order, index) => {
        if (order !== index + 1) errors.push(`Ordem de toques com lacuna/duplicidade perto da posição ${index + 1} (encontrado ${order}).`);
    });
    return errors;
}

function touchesForOrder(sequence: CadenceSequenceDefinition, order: number): CadenceTouch | undefined {
    return sequence.touches.find((t) => t.order === order);
}

function attemptsForTouch(run: CadenceRunState, touchOrder: number): CadenceTouchAttempt[] {
    return run.attempts.filter((a) => a.touchOrder === touchOrder);
}

/** `stopped`/`completed`/`failed` são todos terminais — nenhum admite nova ação nem retomada (só `paused` retoma, via `resumeCadenceRun`). */
function isTerminalStatus(status: CadenceRunStatus): boolean {
    return status === 'stopped' || status === 'completed' || status === 'failed';
}

/** `completed` é o único motivo de parada que corresponde ao status `completed` (fim natural da sequência); todos os outros motivos levam a `stopped`. `policy-guardrail` nunca passa por aqui — é sempre `failed`, ver `applyPolicyGuardrailFailure`. */
function terminalStatusForStopReason(reason: CadenceStopReason): 'completed' | 'stopped' {
    return reason === 'completed' ? 'completed' : 'stopped';
}

/**
 * Decide a próxima ação para este run, sem alterar nada. A ordem das checagens é a regra de
 * negócio: opt-out e resposta do lead vêm antes de status `paused`/`stopped` de propósito — um
 * run pausado que na verdade já devia estar encerrado por opt-out não deve reabrir na retomada
 * manual sem essa checagem acontecer de novo (por isso o chamador deve rodar esta função também
 * no momento do `resumeCadenceRun`, não só no scheduler).
 */
export function decideCadenceAction(
    run: CadenceRunState,
    sequence: CadenceSequenceDefinition,
    now: Date,
    ctx: CadenceDecisionContext,
): CadenceDecision {
    if (ctx.isOptedOut) return { type: 'stop', reason: 'opt-out' };
    if (ctx.hasLeadReplied) return { type: 'stop', reason: 'lead-reply' };

    if (isTerminalStatus(run.status)) return { type: 'stop', reason: run.stopReason ?? 'completed' };
    if (run.status === 'paused') return { type: 'wait', reason: 'paused' };

    const touch = touchesForOrder(sequence, run.currentTouchOrder);
    if (!touch) return { type: 'stop', reason: 'completed' };

    const earliestEligible = run.lastTouchAt
        ? new Date(run.lastTouchAt.getTime() + touch.delayHoursFromPrevious * 3_600_000)
        : run.startedAt;
    if (now.getTime() < earliestEligible.getTime()) {
        return { type: 'wait', reason: 'delay-not-elapsed', nextEligibleAt: earliestEligible };
    }

    if (!ctx.isWithinBusinessWindow(now)) {
        return { type: 'wait', reason: 'outside-business-window' };
    }

    return { type: 'dispatch', touch };
}

/** Novo run, no primeiro toque, ativo. */
export function startCadenceRun(input: {
    id: string;
    organizationId: string;
    leadId: string;
    sequenceId: string;
    startedAt: Date;
}): CadenceRunState {
    return {
        id: input.id,
        organizationId: input.organizationId,
        leadId: input.leadId,
        sequenceId: input.sequenceId,
        status: 'active',
        currentTouchOrder: 1,
        stopReason: null,
        startedAt: input.startedAt,
        lastTouchAt: null,
        pausedAt: null,
        stoppedAt: null,
        attempts: [],
    };
}

function stop(run: CadenceRunState, reason: CadenceStopReason, now: Date): CadenceRunState {
    if (isTerminalStatus(run.status)) return run; // já num estado terminal — idempotente, não sobrescreve o motivo original
    return { ...run, status: terminalStatusForStopReason(reason), stopReason: reason, stoppedAt: now };
}

/** Aplica o resultado de uma decisão `{type:'stop'}` de `decideCadenceAction` — único ponto que decide se o motivo leva a `completed` ou `stopped`. Exportado para `cadenceService.ts` não duplicar essa regra. */
export function applyStopDecision(run: CadenceRunState, reason: CadenceStopReason, now: Date): CadenceRunState {
    return stop(run, reason, now);
}

/** Opt-out encerra imediatamente — nenhuma outra regra tem precedência sobre esta. */
export function applyOptOutStop(run: CadenceRunState, now: Date): CadenceRunState {
    return stop(run, 'opt-out', now);
}

/** Resposta do lead (em qualquer canal) encerra a cadência — a intenção passou a ser conversa humana, não sequência automática. */
export function applyReplyStop(run: CadenceRunState, now: Date): CadenceRunState {
    return stop(run, 'lead-reply', now);
}

/** Parada manual pelo vendedor — distinta de pausa: não tem retomada. */
export function stopCadenceManually(run: CadenceRunState, now: Date): CadenceRunState {
    return stop(run, 'manual-stop', now);
}

/**
 * Falha estrutural do run — não é uma decisão humana nem um sinal do lead, é o sistema
 * constatando que não pode mais avançar esta cadência com segurança (hoje, o único gatilho real:
 * a `CadenceSequence` associada ficou malformada/inacessível entre uma varredura e outra — ver
 * `scanAndAdvanceCadenceRuns` em `cadenceRun.worker.ts`). Terminal e não retomável, mesmo espírito
 * de `stopCadenceManually`; único caminho que leva a `status: 'failed'`.
 */
export function applyPolicyGuardrailFailure(run: CadenceRunState, now: Date): CadenceRunState {
    if (isTerminalStatus(run.status)) return run;
    return { ...run, status: 'failed', stopReason: 'policy-guardrail', stoppedAt: now };
}

/** Pausa manual — retomável, diferente de `stop` (que é definitivo). Idempotente. */
export function pauseCadenceRun(run: CadenceRunState, now: Date): CadenceRunState {
    if (run.status !== 'active') return run;
    return { ...run, status: 'paused', pausedAt: now };
}

/**
 * Retomada manual. Só sai de `paused`; nunca reabre um run `stopped` (opt-out/reply/completed são
 * definitivos por design — reabrir exigiria uma decisão de negócio nova, não uma retomada).
 */
export function resumeCadenceRun(run: CadenceRunState): CadenceRunState {
    if (run.status !== 'paused') return run;
    return { ...run, status: 'active', pausedAt: null };
}

/**
 * Registra o resultado real de uma tentativa de toque — nunca chame isto com `result: 'sent'`
 * sem confirmação real do provedor (mesma disciplina de honestidade corrigida em
 * `cold-email.service.ts`, commit `2e42a557`).
 *
 * Avança `currentTouchOrder` quando o toque foi enviado, ou quando falhou e já esgotou as
 * tentativas permitidas (`maxAttempts`, default 1). Uma falha que ainda tem tentativa disponível
 * mantém o mesmo `currentTouchOrder` — o scheduler tenta de novo no próximo ciclo elegível
 * (respeitando de novo janela comercial e o próprio `delayHoursFromPrevious` como intervalo
 * mínimo de retry, por simplicidade — não há backoff diferente configurado nesta entrega).
 */
export function recordTouchAttempt(
    run: CadenceRunState,
    sequence: CadenceSequenceDefinition,
    touch: CadenceTouch,
    now: Date,
    outcome: { result: CadenceTouchResult; skipReason?: CadenceSkipReason; error?: string | null; providerMessageId?: string | null },
): CadenceRunState {
    const attempt: CadenceTouchAttempt = {
        touchOrder: touch.order,
        attemptNumber: attemptsForTouch(run, touch.order).length + 1,
        channel: touch.channel,
        attemptedAt: now,
        result: outcome.result,
        skipReason: outcome.skipReason,
        error: sanitizeTouchError(outcome.error),
        providerMessageId: outcome.providerMessageId ?? null,
    };
    const attempts = [...run.attempts, attempt];

    if (outcome.result === 'skipped') {
        // Uma tentativa pulada (fora da janela, pausado) não consome o toque nem avança a sequência.
        return { ...run, attempts };
    }

    const maxAttempts = touch.maxAttempts ?? 1;
    const attemptsSoFar = attemptsForTouch({ ...run, attempts }, touch.order).filter((a) => a.result !== 'skipped').length;
    const exhausted = outcome.result === 'failed' && attemptsSoFar >= maxAttempts;
    const shouldAdvance = outcome.result === 'sent' || exhausted;

    if (!shouldAdvance) {
        return { ...run, attempts, lastTouchAt: now };
    }

    const nextOrder = touch.order + 1;
    const hasNext = touchesForOrder(sequence, nextOrder) !== undefined;
    return {
        ...run,
        attempts,
        lastTouchAt: now,
        currentTouchOrder: nextOrder,
        ...(hasNext ? {} : { status: 'completed' as const, stopReason: 'completed' as const, stoppedAt: now }),
    };
}

const MAX_TOUCH_ERROR_LENGTH = 500;

/**
 * Sanitização defensiva do texto de erro antes de persistir (CYC-002: "erro sanitizado" é
 * requisito do roadmap para cada toque). Provedores externos (WhatsApp/e-mail/voz) às vezes ecoam
 * o próprio payload da requisição no corpo de erro — nunca grave e-mail/telefone/CPF do lead nem
 * credencial que por acaso apareça nessa mensagem. Trunca para não deixar um stack trace gigante
 * numa coluna de auditoria.
 */
export function sanitizeTouchError(rawError: string | null | undefined): string | null {
    if (!rawError) return null;
    // CPF exige a pontuação (XXX.XXX.XXX-XX) para não colidir com um telefone de 11 dígitos sem
    // formatação — ambos têm a mesma contagem de dígitos, e um número sem pontuação neste
    // contexto (erro de dispatcher de canal) é quase sempre telefone, não CPF.
    const redacted = rawError
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email redigido]')
        .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[cpf redigido]')
        .replace(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}\b/g, '[telefone redigido]')
        .replace(/\b(?:bearer|token|api[_-]?key)\s*[:=]?\s*['"]?[A-Za-z0-9._-]{8,}['"]?/gi, '[credencial redigida]');
    return redacted.length > MAX_TOUCH_ERROR_LENGTH ? `${redacted.slice(0, MAX_TOUCH_ERROR_LENGTH)}…` : redacted;
}
