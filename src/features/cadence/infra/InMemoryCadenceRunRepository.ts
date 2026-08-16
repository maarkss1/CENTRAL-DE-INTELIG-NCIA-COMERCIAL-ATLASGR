import type { CadenceRunState } from '../domain/cadence.js';
import type { CadenceRunListFilter, CadenceRunRepository } from '../application/cadenceService.js';

/**
 * Implementação em memória usada em testes — o adaptador Prisma real
 * (`../infra/PrismaCadenceRunRepository.ts`) implementa a mesma porta contra a tabela `CadenceRun`
 * aplicada na Onda 9 (PR #132).
 */
export class InMemoryCadenceRunRepository implements CadenceRunRepository {
    private runs = new Map<string, CadenceRunState>();

    async save(run: CadenceRunState): Promise<void> {
        this.runs.set(run.id, { ...run });
    }

    async findById(organizationId: string, id: string): Promise<CadenceRunState | null> {
        const run = this.runs.get(id);
        if (!run || run.organizationId !== organizationId) return null;
        return { ...run };
    }

    async listByOrganization(organizationId: string, filter?: CadenceRunListFilter): Promise<CadenceRunState[]> {
        const statusFilter = filter?.status;
        return [...this.runs.values()]
            .filter((run) => run.organizationId === organizationId)
            .filter((run) => !statusFilter || statusFilter.includes(run.status))
            .map((run) => ({ ...run }))
            .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    }

    /** Só para teste. */
    seed(run: CadenceRunState): void {
        this.runs.set(run.id, { ...run });
    }
}
