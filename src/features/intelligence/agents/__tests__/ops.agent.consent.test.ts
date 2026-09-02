import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: undefined };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// mem0.ts faz `await import('mem0ai')` de propósito (lazy, mem0ai não é dependência real do
// projeto — ver comentário em mem0.ts) e trata a ausência do pacote em runtime real via
// try/catch. Vite/Vitest, porém, tentam resolver o import dinâmico em tempo de transform mesmo
// assim, o que quebra a suíte antes do try/catch entrar em ação — mockado para não depender do
// pacote estar instalado neste ambiente de teste.
vi.mock('../../../../lib/ai/memory/mem0.js', () => ({
  agentMemory: {
    search: vi.fn().mockResolvedValue([]),
    formatForPrompt: vi.fn().mockReturnValue(''),
    add: vi.fn().mockResolvedValue(undefined),
  },
}));

// Usado pelo teste "bloqueia quando um leadId real é informado" — isolado de qualquer chamada de
// rede real ao provedor de IA, que não está disponível neste ambiente de teste. Precisa devolver
// uma instância real de AIMessage (não um objeto solto): o reducer do MessagesAnnotation do
// LangGraph rejeita qualquer coisa que não seja human/AI/system/developer/tool.
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

// AI-002 (onda 32): ops.agent.ts compila o grafo com o checkpointer real de Postgres
// (src/lib/ai/checkpointer.ts) — o caso "permite quando há consentimento registrado" abaixo chega
// a invocar o grafo de verdade, e sem este mock tentaria abrir uma conexão Postgres real neste
// teste unitário. Um MemorySaver real (mesma classe do LangGraph, satisfaz a mesma interface de
// checkpointer) mantém o comportamento observável idêntico ao de produção.
vi.mock('../../../../lib/ai/checkpointer.js', async () => {
  const { MemorySaver } = await import('@langchain/langgraph');
  return {
    checkpointer: new MemorySaver(),
    ensureCheckpointerReady: vi.fn().mockResolvedValue(undefined),
  };
});

const { requestContext } = await import('../../../../lib/async-context');
const { OpsAgent } = await import('../ops.agent');

afterEach(() => {
  mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
});

describe('OpsAgent.run — trava de consentimento LGPD', () => {
  it('bloqueia quando um leadId real é informado sem base legal registrada', async () => {
    const agent = new OpsAgent();

    const result = await requestContext.run({ tenantId: 'org-sem-consentimento' }, () =>
      agent.run('Agende um follow-up para o lead.', undefined, 'lead-1'),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('org-sem-consentimento');
  });

  it('bloqueia também sem leadId (SEC-013c: search_leads pode trazer PII real mesmo sem ID pronto)', async () => {
    // Regressão do bug real: antes desta correção, uma instrução sem leadId pulava o gate por
    // completo, mesmo o Ops tendo acesso a `search_leads` (que localiza lead por nome de
    // empresa/contato e pode devolver um Contact real dentro do loop de tool-calling com o
    // provedor de IA externo). A trava agora roda sempre, independente de leadId.
    const agent = new OpsAgent();

    const result = await requestContext.run({ tenantId: 'org-sem-consentimento' }, () =>
      agent.run('Notifique a equipe sobre um risco geral.', 'session-x'),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('org-sem-consentimento');
  });

  it('permite quando há consentimento registrado, mesmo sem leadId', async () => {
    // Prova que a trava não é um bloqueio cego: organizações com base legal registrada
    // continuam operando normalmente, com ou sem leadId.
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'org-com-consentimento';
    const agent = new OpsAgent();

    const result = await requestContext.run({ tenantId: 'org-com-consentimento' }, () =>
      agent.run('Notifique a equipe sobre um risco geral.', 'session-y'),
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe('Notificação registrada.');
  });
});
