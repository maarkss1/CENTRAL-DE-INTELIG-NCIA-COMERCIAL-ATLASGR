import {
    isVerifiableConfirmation,
    scheduleMeetingIfConfirmed,
    type AvailabilityConfirmation,
    type CalendarSchedulerPort,
    type ScheduleMeetingResult,
} from '../domain/scheduling.js';

/**
 * CYC-004 (onda 27) — conecta `scheduling.ts` (domínio puro, guardrails contra confirmação
 * inferida por IA, entregue numa sprint anterior mas sem nenhum caller de produção per
 * `docs/CADENCE-CYCLE-AUDIT.md`) a um caminho de escrita real: confirmação manual do vendedor após
 * contato ao vivo (`evidenceType: 'manual-verified'`), o único dos 3 tipos de evidência aceitos que
 * não depende de um transporte externo ainda não construído (réplica de calendário por e-mail ou
 * link de agendamento self-service — nenhum dos dois existe hoje).
 *
 * O comentário do próprio domínio é explícito: confirmação manual "ainda assim exige nota, não é
 * confiança geral" — por isso este módulo sempre cria uma `Note` real (mesmo padrão de
 * `dealClosureGate.ts`) e usa o id dela como `evidenceRef`, nunca um valor solto.
 */

export interface MeetingConfirmationNotePort {
    /** Cria o registro de evidência real (Note do lead) referenciado pela confirmação. */
    createConfirmationNote(input: {
        organizationId: string;
        leadId: string;
        authorUserId: string;
        scheduledStart: Date;
        scheduledEnd: Date;
    }): Promise<{ id: string }>;
}

export interface ScheduleVerifiedMeetingInput {
    organizationId: string;
    leadId: string;
    actorUserId: string;
    proposedStart: Date;
    proposedEnd: Date;
    leadTitle: string;
    leadEmail: string;
    ownerEmail: string;
}

export type ScheduleVerifiedMeetingResult = ScheduleMeetingResult & { noteId: string | null };

/**
 * Fluxo completo: pré-checa a confirmação com uma referência qualquer (evita gravar uma `Note` de
 * "reunião confirmada" para um horário que nem é verificável — mesmo raciocínio de
 * `ensureManualDealClosureAllowed`), só então cria a nota real e chama `scheduleMeetingIfConfirmed`
 * com o id dela como evidência.
 */
export async function scheduleVerifiedMeeting(
    ports: { notes: MeetingConfirmationNotePort; scheduler: CalendarSchedulerPort },
    input: ScheduleVerifiedMeetingInput,
    now: Date,
): Promise<ScheduleVerifiedMeetingResult> {
    const preflight: AvailabilityConfirmation = {
        organizationId: input.organizationId,
        leadId: input.leadId,
        evidenceType: 'manual-verified',
        evidenceRef: input.actorUserId,
        proposedStart: input.proposedStart,
        proposedEnd: input.proposedEnd,
    };

    if (!isVerifiableConfirmation(preflight, now)) {
        return { scheduled: false, googleEventId: null, rejectedReason: 'not-verifiable', noteId: null };
    }

    const note = await ports.notes.createConfirmationNote({
        organizationId: input.organizationId,
        leadId: input.leadId,
        authorUserId: input.actorUserId,
        scheduledStart: input.proposedStart,
        scheduledEnd: input.proposedEnd,
    });

    const confirmation: AvailabilityConfirmation = { ...preflight, evidenceRef: note.id };
    const result = await scheduleMeetingIfConfirmed(
        confirmation,
        {
            leadTitle: input.leadTitle,
            leadEmail: input.leadEmail,
            ownerEmail: input.ownerEmail,
            ownerUserId: input.actorUserId,
        },
        ports.scheduler,
        now,
    );

    return { ...result, noteId: note.id };
}
