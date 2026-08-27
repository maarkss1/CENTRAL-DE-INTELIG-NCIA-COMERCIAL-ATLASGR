import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// GOV-13 (Agente 13 — governança do enxame): `LearningAgent.reflectAndLearn` sobrescrevia o
// perfil de estilo aprendido a cada chamada (UPSERT sem histórico), sem métrica de mudança real e
// sem rollback — violando a regra deste programa de nunca dizer que a IA "aprendeu" sem
// métrica/dataset e sem permitir reverter. Estes testes cobrem exatamente os três pontos exigidos:
// (1) uma reflexão nova nunca apaga a anterior — fica no histórico versionado; (2) rollback
// funciona; (3) a reflexão nunca lança e nunca persiste nada quando o LLM falha.

const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: '*' };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

vi.mock('../../../../lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const invokeMock = vi.fn();
vi.mock('../../../../lib/ai/gateway.js', () => ({
    getAiModel: () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }),
}));

const auditLogFindManyMock = vi.fn();

// Fake em memória do único par de operações que `agentMemory.store.ts` usa quando organizationId
// está presente (upsert pela chave composta + findUnique) — simula persistência real entre
// chamadas sucessivas dentro de um teste sem precisar de Postgres real (indisponível neste
// ambiente). `saveAgentMemory`/`loadAgentMemory` reais (não mockados) rodam por cima disto.
const memoryStore = new Map<string, { messages: unknown; status: string; errorMessage: string | null }>();
function memoryKey(sessionId: string, agentType: string, organizationId: string): string {
    return `${sessionId}|${agentType}|${organizationId}`;
}

vi.mock('../../../../lib/prisma.js', () => ({
    prisma: {
        auditLog: { findMany: (...args: unknown[]) => auditLogFindManyMock(...args) },
        agentMemory: {
            upsert: vi.fn(async ({ where, create, update }: {
                where: { sessionId_agentType_organizationId: { sessionId: string; agentType: string; organizationId: string } };
                create: Record<string, unknown>;
                update: Record<string, unknown>;
            }) => {
                const { sessionId, agentType, organizationId } = where.sessionId_agentType_organizationId;
                const k = memoryKey(sessionId, agentType, organizationId);
                const existing = memoryStore.get(k);
                const data = existing
                    ? { messages: update.messages, status: update.status, errorMessage: update.errorMessage ?? null }
                    : { messages: create.messages, status: create.status, errorMessage: create.errorMessage ?? null };
                memoryStore.set(k, data as { messages: unknown; status: string; errorMessage: string | null });
                return data;
            }),
            findUnique: vi.fn(async ({ where }: {
                where: { sessionId_agentType_organizationId: { sessionId: string; agentType: string; organizationId: string } };
            }) => {
                const { sessionId, agentType, organizationId } = where.sessionId_agentType_organizationId;
                return memoryStore.get(memoryKey(sessionId, agentType, organizationId)) ?? null;
            }),
            findFirst: vi.fn(async () => null),
        },
    },
}));

const {
    LearningAgent,
    getLearningProfile,
    getLearningProfileHistory,
    rollbackLearningProfile,
} = await import('../learning.agent');

function auditRow(action: string, timestamp: string) {
    return { id: `log-${timestamp}`, action, entity: 'Lead', details: 'detalhe', timestamp: new Date(timestamp), actorId: 'actor-1', tenantId: 'org-1' };
}

beforeEach(() => {
    memoryStore.clear();
    invokeMock.mockReset();
    auditLogFindManyMock.mockReset();
});

afterEach(() => {
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = '*';
});

describe('LearningAgent — versionamento, rollback e métrica mínima (GOV-13)', () => {
    it('uma reflexão nova nunca apaga a anterior: fica registrada no histórico como uma nova versão', async () => {
        const agent = new LearningAgent();

        auditLogFindManyMock.mockResolvedValueOnce([
            auditRow('Lead atualizado', '2026-01-02T10:00:00.000Z'),
            auditRow('Lead qualificado', '2026-01-01T10:00:00.000Z'),
        ]);
        invokeMock.mockResolvedValueOnce({ content: 'Estilo A: direto e objetivo.' });

        const first = await agent.reflectAndLearn('actor-1', 'org-1');
        expect(first).toBe('Estilo A: direto e objetivo.');

        let history = await getLearningProfileHistory('org-1', 'actor-1');
        expect(history.activeVersion).toBe(1);
        expect(history.versions).toHaveLength(1);
        expect(history.versions[0]).toMatchObject({ version: 1, guidelines: 'Estilo A: direto e objetivo.' });
        expect(history.versions[0].metrics.newAuditLogsSinceLastReflection).toBe(2);

        // Segunda reflexão, com AuditLogs mais recentes do que o watermark da primeira.
        auditLogFindManyMock.mockResolvedValueOnce([
            auditRow('Proposta enviada', '2026-01-03T10:00:00.000Z'),
            auditRow('Lead atualizado', '2026-01-02T10:00:00.000Z'),
        ]);
        invokeMock.mockResolvedValueOnce({ content: 'Estilo B: consultivo e paciente.' });

        const second = await agent.reflectAndLearn('actor-1', 'org-1');
        expect(second).toBe('Estilo B: consultivo e paciente.');

        history = await getLearningProfileHistory('org-1', 'actor-1');
        expect(history.activeVersion).toBe(2);
        expect(history.versions).toHaveLength(2);
        // A versão 1 (a anterior) continua intacta no histórico — nunca foi apagada/sobrescrita.
        expect(history.versions[0]).toMatchObject({ version: 1, guidelines: 'Estilo A: direto e objetivo.' });
        expect(history.versions[1]).toMatchObject({ version: 2, guidelines: 'Estilo B: consultivo e paciente.' });
        expect(history.versions[1].metrics.guidelinesChanged).toBe(true);
        expect(history.versions[1].metrics.previousGuidelinesLength).toBe('Estilo A: direto e objetivo.'.length);

        expect(await getLearningProfile('org-1', 'actor-1')).toBe('Estilo B: consultivo e paciente.');
    });

    it('sem nenhum AuditLog novo desde a última reflexão, reaproveita a versão ativa em vez de gerar (e persistir) uma nova', async () => {
        const agent = new LearningAgent();

        auditLogFindManyMock.mockResolvedValueOnce([auditRow('Lead atualizado', '2026-01-02T10:00:00.000Z')]);
        invokeMock.mockResolvedValueOnce({ content: 'Estilo A.' });
        await agent.reflectAndLearn('actor-1', 'org-1');

        // Mesmos AuditLogs (nenhum mais recente que o watermark já registrado).
        auditLogFindManyMock.mockResolvedValueOnce([auditRow('Lead atualizado', '2026-01-02T10:00:00.000Z')]);
        invokeMock.mockResolvedValueOnce({ content: 'Estilo A, reformulado sem nada novo.' });

        const result = await agent.reflectAndLearn('actor-1', 'org-1');

        // Reaproveita o texto já aprendido — nunca chega a chamar o LLM de novo.
        expect(result).toBe('Estilo A.');
        expect(invokeMock).toHaveBeenCalledTimes(1);

        const history = await getLearningProfileHistory('org-1', 'actor-1');
        expect(history.versions).toHaveLength(1);
    });

    it('rollback reverte a versão ativa sem apagar nenhuma versão do histórico', async () => {
        const agent = new LearningAgent();

        auditLogFindManyMock.mockResolvedValueOnce([auditRow('a', '2026-01-01T10:00:00.000Z')]);
        invokeMock.mockResolvedValueOnce({ content: 'Estilo A.' });
        await agent.reflectAndLearn('actor-1', 'org-1');

        auditLogFindManyMock.mockResolvedValueOnce([auditRow('b', '2026-01-02T10:00:00.000Z')]);
        invokeMock.mockResolvedValueOnce({ content: 'Estilo B.' });
        await agent.reflectAndLearn('actor-1', 'org-1');

        expect(await getLearningProfile('org-1', 'actor-1')).toBe('Estilo B.');

        const rollback = await rollbackLearningProfile('org-1', 'actor-1', 1);
        expect(rollback).toEqual({ success: true, activeVersion: 1, guidelines: 'Estilo A.' });

        expect(await getLearningProfile('org-1', 'actor-1')).toBe('Estilo A.');
        const history = await getLearningProfileHistory('org-1', 'actor-1');
        // O histórico continua com as duas versões — rollback só move o ponteiro.
        expect(history.versions).toHaveLength(2);
        expect(history.activeVersion).toBe(1);
    });

    it('rollback para uma versão inexistente falha sem persistir nada', async () => {
        const agent = new LearningAgent();
        auditLogFindManyMock.mockResolvedValueOnce([auditRow('a', '2026-01-01T10:00:00.000Z')]);
        invokeMock.mockResolvedValueOnce({ content: 'Estilo A.' });
        await agent.reflectAndLearn('actor-1', 'org-1');

        const rollback = await rollbackLearningProfile('org-1', 'actor-1', 99);

        expect(rollback.success).toBe(false);
        expect(rollback.reason).toContain('99');
        const history = await getLearningProfileHistory('org-1', 'actor-1');
        expect(history.activeVersion).toBe(1);
        expect(history.versions).toHaveLength(1);
    });

    it('quando o LLM falha, reflectAndLearn nunca lança e não persiste nada', async () => {
        const agent = new LearningAgent();
        auditLogFindManyMock.mockResolvedValueOnce([auditRow('a', '2026-01-01T10:00:00.000Z')]);
        invokeMock.mockRejectedValueOnce(new Error('Provedor de IA indisponível'));

        await expect(agent.reflectAndLearn('actor-1', 'org-1')).resolves.toBeNull();

        const history = await getLearningProfileHistory('org-1', 'actor-1');
        expect(history.versions).toHaveLength(0);
        expect(history.activeVersion).toBe(0);
        expect(await getLearningProfile('org-1', 'actor-1')).toBeNull();
    });

    it('saída vazia do LLM não vira uma versão nova — mantém a versão ativa anterior', async () => {
        const agent = new LearningAgent();
        auditLogFindManyMock.mockResolvedValueOnce([auditRow('a', '2026-01-01T10:00:00.000Z')]);
        invokeMock.mockResolvedValueOnce({ content: 'Estilo A.' });
        await agent.reflectAndLearn('actor-1', 'org-1');

        auditLogFindManyMock.mockResolvedValueOnce([auditRow('b', '2026-01-02T10:00:00.000Z')]);
        invokeMock.mockResolvedValueOnce({ content: '   ' });

        const result = await agent.reflectAndLearn('actor-1', 'org-1');

        expect(result).toBe('Estilo A.');
        const history = await getLearningProfileHistory('org-1', 'actor-1');
        expect(history.versions).toHaveLength(1);
    });

    it('sem consentimento LGPD registrado, bloqueia antes de consultar o AuditLog e sem persistir nada', async () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
        const agent = new LearningAgent();

        const result = await agent.reflectAndLearn('actor-1', 'org-sem-consentimento');

        expect(result).toBeNull();
        expect(auditLogFindManyMock).not.toHaveBeenCalled();
        const history = await getLearningProfileHistory('org-sem-consentimento', 'actor-1');
        expect(history.versions).toHaveLength(0);
    });
});
