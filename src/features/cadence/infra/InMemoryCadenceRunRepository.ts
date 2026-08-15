import type { CadenceRunState } from '../domain/cadence.js';
import type { CadenceRunRepository } from '../application/cadenceService.js';

/** Implementação em memória usada em testes — o adaptador Prisma real depende da tabela `CadenceRun` proposta ao Agente 01. */
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

    /** Só para teste. */
    seed(run: CadenceRunState): void {
        this.runs.set(run.id, { ...run });
    }
}
