import { prisma } from '../../../lib/prisma.js';
import type { MeetingConfirmationNotePort } from '../application/scheduleMeeting.js';

/** CYC-004 (onda 27) — mesmo padrão de `PrismaDealClosureGate.createConfirmationNote`: a Note é a
 * evidência real e auditável de que um humano confirmou o horário, nunca um resumo gerado por IA. */

function formatRange(start: Date, end: Date): string {
    const fmt = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    return `${fmt(start)} até ${fmt(end)}`;
}

export const prismaMeetingConfirmationNotePort: MeetingConfirmationNotePort = {
    async createConfirmationNote({ leadId, authorUserId, scheduledStart, scheduledEnd }) {
        const note = await prisma.note.create({
            data: {
                leadId,
                author: authorUserId,
                content: `Reunião comercial confirmada manualmente para ${formatRange(scheduledStart, scheduledEnd)}.`,
            },
            select: { id: true },
        });
        return { id: note.id };
    },
};
