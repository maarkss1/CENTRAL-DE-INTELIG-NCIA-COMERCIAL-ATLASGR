export const accountIntelligenceSchedulerQueueName = 'account-intelligence-scheduler-retired';

/**
 * Tombstone de compatibilidade: o scheduler de Market Intelligence foi retirado do produto.
 * O shape é preservado temporariamente para que o bootstrap existente não precise agendar ou
 * processar qualquer trabalho deste domínio enquanto a remoção física é revisada pelo CI.
 */
export const accountIntelligenceSchedulerQueue = {
  async upsertJobScheduler() {
    return undefined;
  },
};

export function createAccountIntelligenceSchedulerWorker(): null {
  return null;
}
