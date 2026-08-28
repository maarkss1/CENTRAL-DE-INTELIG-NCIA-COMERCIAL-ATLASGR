import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Gap real de auditoria: `AgentMemory` acumula uma linha por (sessionId, agentType,
 * organizationId) para todo agente de IA do enxame (SDR/BDR/CLOSER/CRM/OPS/LearningAgent) e nunca
 * teve nenhum job de expurgo — cresce para sempre. Este teste prova, com Prisma mockado (sem
 * depender de Postgres real), que `runAgentMemoryCleanupSweep`:
 * (1) descobre TODA organização, não só uma (mesmo padrão de `runWeeklySalesReportJob`);
 * (2) apaga, por organização, só registros mais antigos que `AGENT_MEMORY_RETENTION_DAYS`;
 * (3) nunca apaga `agentType: 'LEARNING_PROFILE'` (perfil de estilo aprendido pelo LearningAgent —
 *     configuração de longo prazo, não sessão efêmera), mesmo quando esse registro é antigo;
 * (4) roda a descoberta cross-tenant sob bypass (Organization está no allowlist), mas o expurgo em
 *     si roda escopado ao tenant real, nunca sob bypass (AgentMemory foi fechado para bypass no
 *     ITEM-02 — ver src/lib/prisma.ts e tests/integration/agent-memory.test.ts).
 */

vi.mock('../../../../../src/lib/queue/redis.js', () => ({ connection: {} }));

const organizationFindMany = vi.fn();
const agentMemoryDeleteMany = vi.fn();
vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        organization: { findMany: (...args: unknown[]) => organizationFindMany(...args) },
        agentMemory: { deleteMany: (...args: unknown[]) => agentMemoryDeleteMany(...args) },
    },
}));

vi.mock('../../../../../src/config/env.js', () => ({
    env: { AGENT_MEMORY_RETENTION_DAYS: 90 },
}));

import { requestContext } from '../../../../../src/lib/async-context';
import {
    runAgentMemoryCleanupSweep,
    LEARNING_PROFILE_AGENT_TYPE,
} from '../../../../../src/features/intelligence/jobs/agentMemoryCleanup.worker';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('runAgentMemoryCleanupSweep — descoberta cross-tenant', () => {
    it('processa TODA organização retornada, não só a primeira', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-a' }, { id: 'org-b' }]);
        agentMemoryDeleteMany.mockResolvedValue({ count: 3 });

        const result = await runAgentMemoryCleanupSweep();

        expect(result.organizationsProcessed).toBe(2);
        expect(result.deletedCount).toBe(6);
        expect(agentMemoryDeleteMany).toHaveBeenCalledTimes(2);
        const orgIds = agentMemoryDeleteMany.mock.calls.map(([args]) => (args as { where: { organizationId: string } }).where.organizationId).sort();
        expect(orgIds).toEqual(['org-a', 'org-b']);
    });

    it('a descoberta cross-tenant roda com bypass; o expurgo por organização roda com o tenant real (nunca bypass)', async () => {
        organizationFindMany.mockImplementation(async () => {
            expect(requestContext.getStore()?.bypassRls).toBe(true);
            return [{ id: 'org-a' }];
        });
        agentMemoryDeleteMany.mockImplementation(async () => {
            expect(requestContext.getStore()?.tenantId).toBe('org-a');
            expect(requestContext.getStore()?.bypassRls).toBeUndefined();
            return { count: 1 };
        });

        await runAgentMemoryCleanupSweep();

        expect(agentMemoryDeleteMany).toHaveBeenCalledTimes(1);
    });

    it('nenhuma organização: não tenta apagar nada e reporta zero', async () => {
        organizationFindMany.mockResolvedValue([]);

        const result = await runAgentMemoryCleanupSweep();

        expect(result).toEqual({ deletedCount: 0, organizationsProcessed: 0, retentionDays: 90 });
        expect(agentMemoryDeleteMany).not.toHaveBeenCalled();
    });

    it('falha ao expurgar uma organização não derruba a varredura das demais', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-falha' }, { id: 'org-b' }]);
        agentMemoryDeleteMany
            .mockRejectedValueOnce(new Error('timeout de banco'))
            .mockResolvedValueOnce({ count: 2 });

        const result = await runAgentMemoryCleanupSweep();

        expect(result.organizationsProcessed).toBe(2);
        expect(result.deletedCount).toBe(2);
        expect(agentMemoryDeleteMany).toHaveBeenCalledTimes(2);
    });
});

describe('runAgentMemoryCleanupSweep — filtro de retenção e exclusão do LEARNING_PROFILE', () => {
    it('filtra por updatedAt <= cutoff derivado de AGENT_MEMORY_RETENTION_DAYS', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-a' }]);
        agentMemoryDeleteMany.mockResolvedValue({ count: 0 });

        const before = Date.now();
        await runAgentMemoryCleanupSweep();
        const after = Date.now();

        expect(agentMemoryDeleteMany).toHaveBeenCalledTimes(1);
        const [args] = agentMemoryDeleteMany.mock.calls[0] as [{ where: { updatedAt: { lte: Date } } }];
        const cutoffMs = args.where.updatedAt.lte.getTime();

        const expectedMin = before - 90 * 24 * 60 * 60 * 1000;
        const expectedMax = after - 90 * 24 * 60 * 60 * 1000;
        expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin - 1000);
        expect(cutoffMs).toBeLessThanOrEqual(expectedMax + 1000);
    });

    it('nunca inclui LEARNING_PROFILE no filtro de exclusão (excluído de qualquer expurgo por idade)', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-a' }]);
        agentMemoryDeleteMany.mockResolvedValue({ count: 0 });

        await runAgentMemoryCleanupSweep();

        const [args] = agentMemoryDeleteMany.mock.calls[0] as [{ where: { agentType: { not: string } } }];
        expect(args.where.agentType).toEqual({ not: LEARNING_PROFILE_AGENT_TYPE });
        expect(LEARNING_PROFILE_AGENT_TYPE).toBe('LEARNING_PROFILE');
    });

    it('a query real do Prisma excluiria um LEARNING_PROFILE antigo (contrato do filtro `not`, verificado contra dados simulados)', async () => {
        // Simula o comportamento de `deleteMany` com `agentType: { not: LEARNING_PROFILE_AGENT_TYPE }`
        // sobre um conjunto de linhas, para provar que o CONTRATO do filtro passado ao Prisma
        // realmente preservaria um LEARNING_PROFILE antigo e apagaria uma sessão comum antiga.
        const rows = [
            { id: '1', agentType: 'SDR', updatedAt: new Date('2020-01-01') },
            { id: '2', agentType: LEARNING_PROFILE_AGENT_TYPE, updatedAt: new Date('2020-01-01') },
        ];
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);

        organizationFindMany.mockResolvedValue([{ id: 'org-a' }]);
        agentMemoryDeleteMany.mockImplementation(async (args: { where: { updatedAt: { lte: Date }; agentType: { not: string } } }) => {
            const survivors = rows.filter(
                (r) => !(r.updatedAt <= args.where.updatedAt.lte && r.agentType !== args.where.agentType.not),
            );
            return { count: rows.length - survivors.length };
        });

        const result = await runAgentMemoryCleanupSweep();

        expect(result.deletedCount).toBe(1); // só a linha SDR, nunca o LEARNING_PROFILE
    });
});
