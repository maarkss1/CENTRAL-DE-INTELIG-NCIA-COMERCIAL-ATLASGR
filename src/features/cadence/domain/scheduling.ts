/**
 * Entrega 4 — agendamento no Google Calendar após disponibilidade confirmada
 * (`.agents/prompts/17-cadencia-ciclo-receita.md`).
 *
 * A integração Google Workspace (OAuth + Calendar) já existe
 * (`src/features/integrations/google/google.service.ts`, domínio do Agente 06 nesta onda — ver
 * matriz de propriedade). O que falta é o passo comercial, e é só esse passo que este módulo
 * cobre: decidir SE um evento pode ser criado, nunca como chamar a API do Google (isso é a porta
 * `CalendarSchedulerPort`, implementada por quem tem acesso a `google.service.ts`).
 *
 * Trava obrigatória do prompt, e a única razão de este arquivo existir separado de
 * `google.service.ts`: **"disponibilidade confirmada" é evento verificável do lead, não
 * inferência de um modelo sobre o texto de uma mensagem**. `isVerifiableConfirmation` é o único
 * portão de entrada — nenhum agendamento deveria acontecer sem passar por ele primeiro.
 */

/**
 * As únicas três formas de confirmação que este domínio aceita como verificáveis — todas exigem
 * uma referência a um registro real e imutável, nunca a interpretação de um modelo sobre uma
 * frase ("acho que ele topou").
 */
export type ConfirmationEvidenceType =
    /** Lead respondeu (e-mail/WhatsApp) confirmando explicitamente um horário específico já proposto. */
    | 'lead-calendar-reply'
    /** Lead escolheu um horário num link de agendamento self-service (ex.: página de slots). */
    | 'lead-scheduling-link-click'
    /** Vendedor confirmou manualmente após contato ao vivo (ligação/reunião) — ainda assim exige nota, não é "confiança geral". */
    | 'manual-verified';

/** Tipos explicitamente proibidos — existem só para o teste provar que são rejeitados, nunca devem aparecer num evento real. */
const FORBIDDEN_EVIDENCE_MARKERS = new Set(['ai-inferred', 'model-judgment', 'assumed', 'likely']);

export interface AvailabilityConfirmation {
    organizationId: string;
    leadId: string;
    evidenceType: ConfirmationEvidenceType | string;
    /** Id do registro que prova a confirmação (id de mensagem, id de clique no link de agendamento, id de nota do vendedor). Nunca um resumo gerado por IA. */
    evidenceRef: string;
    proposedStart: Date;
    proposedEnd: Date;
}

const VALID_EVIDENCE_TYPES = new Set<ConfirmationEvidenceType>([
    'lead-calendar-reply',
    'lead-scheduling-link-click',
    'manual-verified',
]);

/**
 * Único portão de decisão: só passa quando o tipo de evidência é um dos três aceitos, a
 * referência não é vazia/genérica, e o horário proposto é no futuro (não faz sentido "confirmar"
 * um slot que já passou).
 */
export function isVerifiableConfirmation(confirmation: AvailabilityConfirmation, now: Date): boolean {
    if (!VALID_EVIDENCE_TYPES.has(confirmation.evidenceType as ConfirmationEvidenceType)) return false;
    if (FORBIDDEN_EVIDENCE_MARKERS.has(confirmation.evidenceRef.trim().toLowerCase())) return false;
    if (!confirmation.evidenceRef || !confirmation.evidenceRef.trim()) return false;
    if (confirmation.proposedEnd.getTime() <= confirmation.proposedStart.getTime()) return false;
    if (confirmation.proposedStart.getTime() <= now.getTime()) return false;
    return true;
}

export interface CalendarEventDraft {
    organizationId: string;
    leadId: string;
    start: Date;
    end: Date;
    attendeeEmails: string[];
    ownerUserId: string;
    title: string;
    confirmationEvidenceType: ConfirmationEvidenceType;
    confirmationEvidenceRef: string;
}

/**
 * Monta o rascunho do evento a partir de uma confirmação já validada — nunca chame isto sem antes
 * checar `isVerifiableConfirmation`, ele não revalida por conta própria (fail loud: prefira o
 * chamador explodir por esquecer a checagem a este módulo silenciosamente aceitar qualquer coisa).
 */
export function buildCalendarEventDraft(
    confirmation: AvailabilityConfirmation,
    context: { leadTitle: string; leadEmail: string; ownerEmail: string; ownerUserId: string },
): CalendarEventDraft {
    return {
        organizationId: confirmation.organizationId,
        leadId: confirmation.leadId,
        start: confirmation.proposedStart,
        end: confirmation.proposedEnd,
        attendeeEmails: [context.leadEmail, context.ownerEmail].filter((e) => e && e.trim()),
        ownerUserId: context.ownerUserId,
        title: `Reunião comercial — ${context.leadTitle}`,
        confirmationEvidenceType: confirmation.evidenceType as ConfirmationEvidenceType,
        confirmationEvidenceRef: confirmation.evidenceRef,
    };
}

/** Porta implementada por quem tem acesso real ao Google Calendar (`google.service.ts`, 06) — cria o evento e devolve o id real do Google. */
export interface CalendarSchedulerPort {
    createEvent(draft: CalendarEventDraft): Promise<{ googleEventId: string }>;
}

export interface ScheduleMeetingResult {
    scheduled: boolean;
    googleEventId: string | null;
    rejectedReason: 'not-verifiable' | null;
}

/**
 * Fluxo completo: valida a confirmação, e só então chama a porta de agendamento real. Devolve
 * `scheduled: false` sem lançar quando a confirmação não é verificável — quem chama decide como
 * comunicar isso (nunca deveria ser tratado como sucesso silencioso).
 */
export async function scheduleMeetingIfConfirmed(
    confirmation: AvailabilityConfirmation,
    context: { leadTitle: string; leadEmail: string; ownerEmail: string; ownerUserId: string },
    scheduler: CalendarSchedulerPort,
    now: Date,
): Promise<ScheduleMeetingResult> {
    if (!isVerifiableConfirmation(confirmation, now)) {
        return { scheduled: false, googleEventId: null, rejectedReason: 'not-verifiable' };
    }

    const draft = buildCalendarEventDraft(confirmation, context);
    const { googleEventId } = await scheduler.createEvent(draft);
    return { scheduled: true, googleEventId, rejectedReason: null };
}
