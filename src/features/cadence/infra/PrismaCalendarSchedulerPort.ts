import { randomUUID } from 'node:crypto';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import type { CalendarEventDraft, CalendarSchedulerPort, ConfirmationEvidenceType } from '../domain/scheduling.js';
import { createCalendarEvent } from '../../integrations/google/google.service.js';

/**
 * CYC-004 (onda 27) — implementação real de `CalendarSchedulerPort` (`scheduling.ts`).
 * O escopo OAuth foi alterado para `calendar.events` e a escrita agora é feita de verdade
 * via `createCalendarEvent`. Se a integração falhar, loga o erro e segue com o registro local
 * (best-effort sync, o Google não é a fonte da verdade do agendamento comercial).
 */

const EVIDENCE_TYPE_TO_DB: Record<ConfirmationEvidenceType, 'LeadCalendarReply' | 'LeadSchedulingLinkClick' | 'ManualVerified'> = {
    'lead-calendar-reply': 'LeadCalendarReply',
    'lead-scheduling-link-click': 'LeadSchedulingLinkClick',
    'manual-verified': 'ManualVerified',
};

export const prismaCalendarSchedulerPort: CalendarSchedulerPort = {
    async createEvent(draft: CalendarEventDraft) {
        let googleEventId = `fallback-event-${randomUUID()}`;

        try {
            const attendees = draft.attendeeEmails;
            const realId = await createCalendarEvent(draft.organizationId, {
                summary: draft.title,
                start: draft.start,
                end: draft.end,
                attendees,
            });
            googleEventId = realId;
            logger.info({ organizationId: draft.organizationId, leadId: draft.leadId, googleEventId }, '[CYC-004] Evento criado no Google Calendar com sucesso.');
        } catch (error) {
            logger.error({ err: error, organizationId: draft.organizationId, leadId: draft.leadId }, '[CYC-004] Falha ao criar evento no Google Calendar, usando fallback ID para o banco.');
        }

        const activeCadenceRun = await prisma.cadenceRun.findFirst({
            where: { organizationId: draft.organizationId, leadId: draft.leadId, status: 'Active' },
            select: { id: true },
        });

        await prisma.cadenceCalendarEvent.create({
            data: {
                organizationId: draft.organizationId,
                leadId: draft.leadId,
                cadenceRunId: activeCadenceRun?.id ?? null,
                googleEventId,
                confirmationEvidenceType: EVIDENCE_TYPE_TO_DB[draft.confirmationEvidenceType],
                confirmationEvidenceRef: draft.confirmationEvidenceRef,
                scheduledStart: draft.start,
                scheduledEnd: draft.end,
                ownerUserId: draft.ownerUserId,
            },
        });

        return { googleEventId };
    },
};
