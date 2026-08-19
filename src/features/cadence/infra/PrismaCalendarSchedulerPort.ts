import { randomUUID } from 'node:crypto';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import type { CalendarEventDraft, CalendarSchedulerPort, ConfirmationEvidenceType } from '../domain/scheduling.js';

/**
 * CYC-004 (onda 27) — implementação real de `CalendarSchedulerPort` (`scheduling.ts`). **Stub de
 * transporte** (mesma decisão de produto de CYC-003/CYC-006, confirmada com o usuário): nenhuma
 * chamada real à API do Google Calendar acontece ainda. A infraestrutura OAuth real já existe e
 * funciona para LEITURA (`google.service.ts::getUpcomingCalendarEvents` — `getValidAccessToken` +
 * `fetchWithTimeout`), mas o escopo hoje conectado é `calendar.readonly`; escrever eventos exigiria
 * pedir `calendar.events` e forçar reconsentimento de toda organização já conectada — mudança de
 * produto real, não uma decisão para tomar sozinho dentro desta rodada. Quando o escopo for
 * ampliado, o `createEvent` real segue exatamente o padrão de `getUpcomingCalendarEvents`: POST
 * `https://www.googleapis.com/calendar/v3/calendars/primary/events` com o access token da
 * organização.
 *
 * O que este stub já faz de verdade — e é o que o roadmap CYC-004 ("confirmação verificável") pede
 * — é gravar o registro comercial local (`CadenceCalendarEvent`, tabela morta até esta onda): o
 * Google é sincronização best-effort, não a fonte de verdade do agendamento comercial (ver
 * comentário do campo `googleEventId` no schema).
 */

const EVIDENCE_TYPE_TO_DB: Record<ConfirmationEvidenceType, 'LeadCalendarReply' | 'LeadSchedulingLinkClick' | 'ManualVerified'> = {
    'lead-calendar-reply': 'LeadCalendarReply',
    'lead-scheduling-link-click': 'LeadSchedulingLinkClick',
    'manual-verified': 'ManualVerified',
};

export const prismaCalendarSchedulerPort: CalendarSchedulerPort = {
    async createEvent(draft: CalendarEventDraft) {
        const googleEventId = `stub-google-event-${randomUUID()}`;
        logger.info(
            { organizationId: draft.organizationId, leadId: draft.leadId, googleEventId },
            '[CYC-004] Evento de calendário — stub de transporte (Google Calendar real ainda não plugado, ver PrismaCalendarSchedulerPort.ts)',
        );

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
