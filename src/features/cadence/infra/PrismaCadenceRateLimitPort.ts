import { prisma } from '../../../lib/prisma.js';
import type { CadenceRateLimitPort } from '../application/rateLimitService.js';

/**
 * Adaptador Prisma real de `CadenceRateLimitPort` — tabelas `CadenceTouchAttempt`/`CadenceRun`
 * (`prisma/schema.prisma` §"Cadência multicanal") mais o e-mail em `Lead.contact.email`, sem
 * exigir nenhuma coluna nova nem migration: tudo que o rate limit precisa contar já está
 * persistido pelas entregas anteriores do Agente 17.
 *
 * `countSentTouchesForContact` cruza QUALQUER `CadenceRun` do lead (`cadenceRun.leadId`), não só o
 * run que está sendo avançado agora — é assim que um contato que já recebeu toques de uma cadência
 * PARALELA/ANTERIOR diferente é pego pelo limite.
 *
 * `countDistinctEmailRecipientsForDomain` casa o domínio comparando `Contact.email` com
 * `endsWith('@' + domínio)` (case-insensitive) — mesma tolerância pragmática usada em outras
 * buscas por substring do repositório (`PrismaCompanyRepository`, `PrismaLeadRepository`): não
 * distingue um local-part com `@` internamente (RFC 5322 permite entre aspas, mas é praticamente
 * inexistente em e-mail corporativo real).
 */
export class PrismaCadenceRateLimitPort implements CadenceRateLimitPort {
    async countSentTouchesForContact(organizationId: string, leadId: string, since: Date, until: Date): Promise<number> {
        return prisma.cadenceTouchAttempt.count({
            where: {
                organizationId,
                result: 'Sent',
                attemptedAt: { gte: since, lte: until },
                cadenceRun: { leadId, organizationId },
            },
        });
    }

    async countDistinctEmailRecipientsForDomain(
        organizationId: string,
        emailDomain: string,
        since: Date,
        until: Date,
        leadId: string,
    ): Promise<{ distinctRecipientsToday: number; currentLeadAlreadyCounted: boolean }> {
        const rows = await prisma.cadenceTouchAttempt.findMany({
            where: {
                organizationId,
                channel: 'Email',
                result: 'Sent',
                attemptedAt: { gte: since, lte: until },
                cadenceRun: {
                    organizationId,
                    lead: { contact: { email: { endsWith: `@${emailDomain}`, mode: 'insensitive' } } },
                },
            },
            select: { cadenceRun: { select: { leadId: true } } },
        });

        const distinctLeadIds = new Set(rows.map((r) => r.cadenceRun.leadId));
        return {
            distinctRecipientsToday: distinctLeadIds.size,
            currentLeadAlreadyCounted: distinctLeadIds.has(leadId),
        };
    }
}

/** Instância única, sem estado próprio além da conexão Prisma já compartilhada pelo app. */
export const prismaCadenceRateLimitPort = new PrismaCadenceRateLimitPort();
