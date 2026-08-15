import { randomUUID } from 'node:crypto';
import { subjectsMatch, type NormalizedOptOutSubject, type OptOutRecord, type OptOutRepository } from '../domain/optOut.js';

/**
 * Implementação em memória de `OptOutRepository` — usada nos testes deste feature e como
 * referência de comportamento para o futuro adaptador Prisma (tabela `OptOutRecord`, ver
 * `.agents/handoffs/onda-7/17-para-01-schema-cadencia-optout-proposta.md`, ainda não aplicado).
 *
 * Nunca deve ser usada em produção — não persiste entre processos e não tem RLS/tenant real, só
 * o filtro de `organizationId` em memória.
 */
export class InMemoryOptOutRepository implements OptOutRepository {
    private records: OptOutRecord[] = [];

    async create(record: Omit<OptOutRecord, 'id' | 'createdAt'>): Promise<OptOutRecord> {
        const full: OptOutRecord = { ...record, id: randomUUID(), createdAt: new Date() };
        this.records.push(full);
        return full;
    }

    async findMatches(organizationId: string, subject: NormalizedOptOutSubject): Promise<OptOutRecord[]> {
        return this.records.filter(
            (r) =>
                r.organizationId === organizationId &&
                subjectsMatch(
                    { leadId: r.leadId, email: r.email, phoneE164: r.phoneE164 },
                    subject,
                ),
        );
    }

    async list(organizationId: string, limit = 200): Promise<OptOutRecord[]> {
        return this.records
            .filter((r) => r.organizationId === organizationId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, Math.min(Math.max(limit, 1), 500));
    }

    /** Só para teste: esvazia o estado entre casos. */
    clear(): void {
        this.records = [];
    }
}
