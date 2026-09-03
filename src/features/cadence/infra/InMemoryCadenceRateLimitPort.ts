import { extractEmailDomain, type LastSentTouch } from '../domain/rateLimit.js';
import type { CadenceRateLimitPort } from '../application/rateLimitService.js';
import type { InMemoryCadenceRunRepository } from './InMemoryCadenceRunRepository.js';

/**
 * Implementação em memória de `CadenceRateLimitPort`, usada nos testes — deriva as contagens
 * diretamente dos `CadenceRunState` já seedados no MESMO `InMemoryCadenceRunRepository` usado pelo
 * teste (`runRepo.seed(...)`), em vez de manter uma estrutura paralela: assim, um cenário como
 * "duas cadências diferentes miram o mesmo lead" é montado do mesmo jeito que qualquer outro teste
 * deste módulo já monta (seedar mais de um `CadenceRunState` com o mesmo `leadId`, ids/sequenceIds
 * diferentes) — espelhando fielmente o que o adaptador Prisma real (`PrismaCadenceRateLimitPort`)
 * faz contra as tabelas de verdade.
 *
 * O único dado que `CadenceRunState`/`CadenceTouchAttempt` não carregam é o e-mail do contato (só
 * existe via `Lead.contact.email` no schema real) — por isso o construtor recebe um resolvedor de
 * e-mail por `leadId`, equivalente ao `LeadSubjectResolver` já usado pelo resto do teste.
 */
export class InMemoryCadenceRateLimitPort implements CadenceRateLimitPort {
  constructor(
    private readonly runRepo: InMemoryCadenceRunRepository,
    private readonly resolveEmail: (leadId: string) => string | null,
  ) {}

  async countSentTouchesForContact(
    organizationId: string,
    leadId: string,
    since: Date,
    until: Date,
  ): Promise<number> {
    const runs = await this.runRepo.listByOrganization(organizationId);
    let count = 0;
    for (const run of runs) {
      if (run.leadId !== leadId) continue;
      for (const attempt of run.attempts) {
        if (
          attempt.result === 'sent' &&
          attempt.attemptedAt >= since &&
          attempt.attemptedAt <= until
        )
          count++;
      }
    }
    return count;
  }

  async countDistinctEmailRecipientsForDomain(
    organizationId: string,
    emailDomain: string,
    since: Date,
    until: Date,
    leadId: string,
  ): Promise<{ distinctRecipientsToday: number; currentLeadAlreadyCounted: boolean }> {
    const runs = await this.runRepo.listByOrganization(organizationId);
    const distinctLeadIds = new Set<string>();
    for (const run of runs) {
      const email = this.resolveEmail(run.leadId);
      if (extractEmailDomain(email) !== emailDomain) continue;
      const hasSentEmailInWindow = run.attempts.some(
        (a) =>
          a.channel === 'email' &&
          a.result === 'sent' &&
          a.attemptedAt >= since &&
          a.attemptedAt <= until,
      );
      if (hasSentEmailInWindow) distinctLeadIds.add(run.leadId);
    }
    return {
      distinctRecipientsToday: distinctLeadIds.size,
      currentLeadAlreadyCounted: distinctLeadIds.has(leadId),
    };
  }

  async findLastSentTouch(organizationId: string, leadId: string): Promise<LastSentTouch | null> {
    const runs = await this.runRepo.listByOrganization(organizationId);
    let last: LastSentTouch | null = null;
    for (const run of runs) {
      if (run.leadId !== leadId) continue;
      for (const attempt of run.attempts) {
        if (attempt.result !== 'sent') continue;
        if (!last || attempt.attemptedAt > last.attemptedAt) {
          last = { channel: attempt.channel, attemptedAt: attempt.attemptedAt };
        }
      }
    }
    return last;
  }
}
