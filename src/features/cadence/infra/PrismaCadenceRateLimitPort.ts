import { prisma } from '../../../lib/prisma.js';
import type { CadenceRateLimitPort } from '../application/rateLimitService.js';
import { emailDomainIndexOf } from '../../../lib/crypto/piiIndex.js';
import type { CadenceChannel } from '../domain/optOut.js';
import type { LastSentTouch } from '../domain/rateLimit.js';

/** `CadenceChannel` do Prisma ('Email'/'WhatsApp'/'Voice') → domínio ('email'/'whatsapp'/'voice'). Só usado aqui — nenhum outro adapter deste módulo precisou de um mapa genérico até agora (ver `countDistinctEmailRecipientsForDomain` abaixo, que compara direto contra o literal `'Email'`). */
function fromPrismaCadenceChannel(value: string): CadenceChannel {
  return value.toLowerCase() as CadenceChannel;
}

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
  async countSentTouchesForContact(
    organizationId: string,
    leadId: string,
    since: Date,
    until: Date,
  ): Promise<number> {
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
    // Contact.email cifrado em repouso (ver src/lib/crypto/piiFields.ts) — o antigo
    // `endsWith('@dominio', insensitive)` contra o campo cifrado nunca mais casaria (IV
    // aleatório por valor); substituído por igualdade contra o índice cego do domínio (ver
    // src/lib/crypto/piiIndex.ts). Sem domínio válido, nenhum toque de e-mail tem como bater
    // (evita `{ emailDomainIndex: null }` casar com contatos sem e-mail).
    const emailDomainIndex = emailDomainIndexOf(emailDomain);
    if (!emailDomainIndex) return { distinctRecipientsToday: 0, currentLeadAlreadyCounted: false };
    const rows = await prisma.cadenceTouchAttempt.findMany({
      where: {
        organizationId,
        channel: 'Email',
        result: 'Sent',
        attemptedAt: { gte: since, lte: until },
        cadenceRun: {
          organizationId,
          lead: { contact: { emailDomainIndex } },
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

  async findLastSentTouch(organizationId: string, leadId: string): Promise<LastSentTouch | null> {
    const row = await prisma.cadenceTouchAttempt.findFirst({
      where: { organizationId, result: 'Sent', cadenceRun: { leadId, organizationId } },
      orderBy: { attemptedAt: 'desc' },
      select: { channel: true, attemptedAt: true },
    });
    if (!row) return null;
    return { channel: fromPrismaCadenceChannel(row.channel), attemptedAt: row.attemptedAt };
  }
}

/** Instância única, sem estado próprio além da conexão Prisma já compartilhada pelo app. */
export const prismaCadenceRateLimitPort = new PrismaCadenceRateLimitPort();
