import { prisma } from '../../../lib/prisma.js';
import { toE164BR } from '../../../lib/phone.js';
import type { LeadSubjectResolver } from '../application/cadenceService.js';

/**
 * Resolve o sujeito de opt-out (e-mail/telefone) a partir do `Lead.contact` — o único lugar onde
 * esses dados vivem hoje (`Lead` não tem e-mail/telefone próprio, só via `Contact`). Usado pelo
 * worker de cadência (CYC-008, onda-19) antes de checar `isOptedOut` para o canal do próximo toque.
 */
export const prismaLeadSubjectResolver: LeadSubjectResolver = {
    async resolve(organizationId, leadId) {
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, organizationId },
            select: { contact: { select: { email: true, whatsapp: true, phone: true } } },
        });

        return {
            leadId,
            email: lead?.contact?.email ?? null,
            phoneE164: toE164BR(lead?.contact?.whatsapp ?? lead?.contact?.phone ?? undefined),
        };
    },
};
