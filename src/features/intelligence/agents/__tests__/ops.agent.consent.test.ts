import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: undefined };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

vi.mock('../../../../lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Sem leadId, o teste abaixo prova que o Ops passa direto do gate de consentimento (que só se
// aplica quando há um Contact real em jogo) — isolado de qualquer chamada de rede real ao provedor
// de IA, que não está disponível neste ambiente de teste. Precisa devolver uma instância real de
// AIMessage (não um objeto solto): o reducer do MessagesAnnotation do LangGraph rejeita qualquer
// coisa que não seja human/AI/system/developer/tool.
vi.mock('../fallback.util.js', async () => {
    const { AIMessage } = await import('@langchain/core/messages');
    return {
        buildModelWithFallbackAndTools: () => ({
            invoke: vi.fn().mockResolvedValue(new AIMessage('Notificação registrada.')),
        }),
    };
});

// AI-003 (onda 31): agentMemory.store.ts (usado por OpsAgent.updateMemory/recordAgentFailure) faz
// upsert atômico quando organizationId está presente — os dois casos abaixo sempre rodam dentro de
// requestContext.run({tenantId: 'org-sem-consentimento'}), então sempre passam por upsert, nunca
// pelo fallback findFirst+create/update (só usado quando organizationId é null).
vi.mock('../../../../lib/prisma.js', () => ({
    prisma: {
        agentMemory: {
            upsert: vi.fn().mockResolvedValue({}),
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({}),
        },
    },
}));

const { requestContext } = await import('../../../../lib/async-context');
const { OpsAgent } = await import('../ops.agent');

afterEach(() => {
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
});

describe('OpsAgent.run — trava de consentimento LGPD', () => {
    it('bloqueia quando um leadId real é informado sem base legal registrada', async () => {
        const agent = new OpsAgent();

        const result = await requestContext.run(
            { tenantId: 'org-sem-consentimento' },
            () => agent.run('Agende um follow-up para o lead.', undefined, 'lead-1'),
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('org-sem-consentimento');
    });

    it('não bloqueia quando não há leadId (instrução sem titular associado)', async () => {
        // Sem leadId, o Ops nunca chega em get_lead_context com um Contact real — não há PII de
        // titular em jogo, então a trava de consentimento não se aplica. O modelo é um stub (ver
        // mock de fallback.util.js acima); o que este teste prova é que o gate foi pulado, não o
        // comportamento do LLM em si.
        const agent = new OpsAgent();

        const result = await requestContext.run(
            { tenantId: 'org-sem-consentimento' },
            () => agent.run('Notifique a equipe sobre um risco geral.', 'session-x'),
        );

        expect(result.success).toBe(true);
        expect(result.output).toBe('Notificação registrada.');
    });
});
