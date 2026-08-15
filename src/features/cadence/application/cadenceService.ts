import { logger } from '../../../lib/logger.js';
import {
    decideCadenceAction,
    recordTouchAttempt,
    type CadenceDecision,
    type CadenceRunState,
    type CadenceSequenceDefinition,
    type CadenceTouch,
} from '../domain/cadence.js';
import { isOptedOut } from './optOutService.js';
import type { OptOutRepository, OptOutSubject } from '../domain/optOut.js';

/**
 * Orquestra um ciclo da cadência: decide a ação (`decideCadenceAction`), consulta o opt-out
 * unificado (entrega 1) para o canal do próximo toque, despacha via a porta `CadenceDispatcher`
 * (implementada por cada canal — 05/06/12, fora do meu escopo de arquivo) e grava o resultado
 * real. Nenhuma escrita de "enviado" acontece sem confirmação do `CadenceDispatcher`.
 */

export interface CadenceRunRepository {
    save(run: CadenceRunState): Promise<void>;
    findById(organizationId: string, id: string): Promise<CadenceRunState | null>;
}

/** Implementado por cada canal — a ligação real com e-mail/WhatsApp/voz não é responsabilidade deste domínio. */
export interface CadenceDispatcher {
    dispatch(
        touch: CadenceTouch,
        run: CadenceRunState,
    ): Promise<{ result: 'sent' | 'failed'; error?: string | null }>;
}

/** Resolve o sujeito de opt-out (leadId + e-mail + telefone) a partir do lead — evita repetir a busca em cada chamada. */
export interface LeadSubjectResolver {
    resolve(organizationId: string, leadId: string): Promise<OptOutSubject>;
}

export interface AdvanceCadenceRunDeps {
    runRepo: CadenceRunRepository;
    optOutRepo: OptOutRepository;
    subjectResolver: LeadSubjectResolver;
    dispatcher: CadenceDispatcher;
    isWithinBusinessWindow: (now: Date) => boolean;
    hasLeadReplied: (organizationId: string, leadId: string) => Promise<boolean>;
}

export interface AdvanceCadenceRunResult {
    run: CadenceRunState;
    decision: CadenceDecision;
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
    if (!run) throw new Error(`CadenceRun ${runId} não encontrado para a organização ${organizationId}.`);

    const hasLeadReplied = await deps.hasLeadReplied(organizationId, run.leadId);

    // Opt-out é checado para o canal do PRÓXIMO toque (ou global, coberto por isOptedOut) — se o
    // run já terminou (sem próximo toque), não há canal a checar e `decideCadenceAction` resolve
    // isso sozinho como 'completed'.
    const upcomingTouch = sequence.touches.find((t) => t.order === run.currentTouchOrder);
    let isOptedOutForUpcoming = false;
    if (upcomingTouch) {
        const subject = await deps.subjectResolver.resolve(organizationId, run.leadId);
        isOptedOutForUpcoming = await isOptedOut(deps.optOutRepo, organizationId, subject, upcomingTouch.channel);
    }

    const decision = decideCadenceAction(run, sequence, now, {
        isOptedOut: isOptedOutForUpcoming,
        hasLeadReplied,
        isWithinBusinessWindow: deps.isWithinBusinessWindow,
    });

    if (decision.type === 'stop') {
        const stopped: CadenceRunState =
            run.status === 'stopped' ? run : { ...run, status: 'stopped', stopReason: decision.reason, stoppedAt: now };
        await deps.runRepo.save(stopped);
        if (run.status !== 'stopped') {
            logger.info({ organizationId, runId, leadId: run.leadId, reason: decision.reason }, 'Cadência encerrada.');
        }
        return { run: stopped, decision };
    }

    if (decision.type === 'wait') {
        return { run, decision };
    }

    // decision.type === 'dispatch'
    const outcome = await deps.dispatcher.dispatch(decision.touch, run);
    const updated = recordTouchAttempt(run, sequence, decision.touch, now, {
        result: outcome.result,
        error: outcome.error ?? null,
    });
    await deps.runRepo.save(updated);

    logger.info(
        { organizationId, runId, leadId: run.leadId, touchOrder: decision.touch.order, channel: decision.touch.channel, result: outcome.result },
        outcome.result === 'sent' ? 'Toque de cadência enviado.' : 'Toque de cadência falhou.',
    );

    return { run: updated, decision };
}
