import { prisma } from '../../../lib/prisma.js';
import type { DealClosureEventType } from '../../cadence/domain/dealClosure.js';
import type { DealClosureEvidencePort } from '../application/dealClosureGate.js';

/**
 * Implementação real de `DealClosureEvidencePort` (CYC-007, onda 24) — mesmo padrão de
 * `prismaCadenceRunRepository`: enum Postgres (PascalCase) mapeado aqui, nunca propagado cru para
 * o domínio. `DealClosureEvent` era uma das "tabelas mortas confirmadas" listadas em
 * `docs/CADENCE-CYCLE-AUDIT.md` (schema existia, zero leitura/escrita em código) até esta rodada.
 */

const TYPE_TO_DB: Record<DealClosureEventType, 'SignatureCompleted' | 'PaymentConfirmed' | 'ManualCrmConfirmation'> = {
    signature_completed: 'SignatureCompleted',
    payment_confirmed: 'PaymentConfirmed',
    manual_crm_confirmation: 'ManualCrmConfirmation',
};

export const prismaDealClosureGate: DealClosureEvidencePort = {
    async createConfirmationNote({ leadId, authorUserId }) {
        const note = await prisma.note.create({
            data: {
                leadId,
                author: authorUserId,
                content: 'Negócio movido para "Negócios Ganhos" — confirmação manual registrada automaticamente ao fechar.',
            },
            select: { id: true },
        });
        return { id: note.id };
    },

    async saveDealClosureEvent(event) {
        await prisma.dealClosureEvent.create({
            data: {
                id: event.id,
                organizationId: event.organizationId,
                leadId: event.leadId,
                type: TYPE_TO_DB[event.type],
                evidenceRef: event.evidenceRef,
                triggeredBy: event.triggeredBy,
                occurredAt: event.occurredAt,
            },
        });
    },
};
