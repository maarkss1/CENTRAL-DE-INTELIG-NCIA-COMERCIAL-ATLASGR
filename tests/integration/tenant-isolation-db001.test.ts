import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

// DB-001 / DB-002 (auditoria de dívida técnica, Fase 0, ciclo C0.2): confirma que consultas a
// KnowledgeChunk, Prompt, AgentMemory e AIPendingAction filtradas por organizationId nunca
// devolvem dado de outro tenant. Cobre a mesma camada que search.service.ts/prompt.routes.ts/
// vector.service.ts/agent.service.ts usam de verdade — filtro explícito de organizationId — que é
// a defesa que hoje realmente vale (ver nota de RLS/superuser em 08-PLANO-DE-SEGURANCA.md).

const ORG_A = 'test-org-id'; // já seedado por tests/helpers/integration-setup.ts
const ORG_B = 'test-org-id-b';

describe('Isolamento de tenant — KnowledgeChunk, Prompt, AgentMemory, AIPendingAction', () => {
  beforeEach(async () => {
    await requestContext.run({ bypassRls: true }, async () => {
      const exists = await prisma.organization.findUnique({ where: { id: ORG_B } });
      if (!exists) {
        await prisma.organization.create({ data: { id: ORG_B, name: 'Test Org B' } });
      }
    });
  });

  afterEach(async () => {
    await prisma.knowledgeChunk.deleteMany({ where: { id: { in: ['kc-a', 'kc-b'] } } });
    await prisma.prompt.deleteMany({ where: { id: { in: ['prompt-a', 'prompt-b'] } } });
    await prisma.agentMemory.deleteMany({ where: { sessionId: { in: ['session-a', 'session-b'] } } });
    await prisma.aIPendingAction.deleteMany({ where: { id: { in: ['action-a', 'action-b'] } } });
    await requestContext.run({ bypassRls: true }, async () => {
      await prisma.organization.deleteMany({ where: { id: ORG_B } });
    });
  });

  afterAll(async () => {
    await requestContext.run({ bypassRls: true }, async () => {
      await prisma.organization.deleteMany({ where: { id: ORG_B } });
    });
  });

  it('KnowledgeChunk: busca por organizationId nunca retorna trecho de outro tenant', async () => {
    await prisma.knowledgeChunk.create({
      data: { id: 'kc-a', content: 'conteúdo do tenant A', organizationId: ORG_A },
    });
    await prisma.knowledgeChunk.create({
      data: { id: 'kc-b', content: 'conteúdo do tenant B', organizationId: ORG_B },
    });

    const asA = await prisma.knowledgeChunk.findMany({ where: { organizationId: ORG_A } });
    expect(asA.map((c) => c.id)).toEqual(['kc-a']);

    const asB = await prisma.knowledgeChunk.findMany({ where: { organizationId: ORG_B } });
    expect(asB.map((c) => c.id)).toEqual(['kc-b']);
  });

  it('Prompt: listagem e edição por organizationId nunca expõem/alteram prompt de outro tenant (IDOR corrigido)', async () => {
    await prisma.prompt.create({
      data: {
        id: 'prompt-a', name: 'p', version: '1.0', owner: ORG_A, category: 'cat',
        organizationId: ORG_A, variables: {}, history: [], approved: true,
      },
    });
    await prisma.prompt.create({
      data: {
        id: 'prompt-b', name: 'p', version: '1.0', owner: ORG_B, category: 'cat',
        organizationId: ORG_B, variables: {}, history: [], approved: true,
      },
    });

    const listAsA = await prisma.prompt.findMany({ where: { organizationId: ORG_A } });
    expect(listAsA.map((p) => p.id)).toEqual(['prompt-a']);

    // Reproduz o padrão de prompt.routes.ts PUT /:id: updateMany com organizationId no where não
    // deve afetar o prompt do outro tenant, mesmo sabendo o id exato.
    const attempt = await prisma.prompt.updateMany({
      where: { id: 'prompt-b', organizationId: ORG_A },
      data: { variables: { hacked: true } },
    });
    expect(attempt.count).toBe(0);

    const untouched = await prisma.prompt.findUnique({ where: { id: 'prompt-b' } });
    expect(untouched?.variables).toEqual({});
  });

  it('AgentMemory: findFirst por sessionId+organizationId nunca resolve a memória de outro tenant', async () => {
    await prisma.agentMemory.create({
      data: { sessionId: 'session-a', agentType: 'SDR', organizationId: ORG_A, messages: [{ role: 'user', content: 'A' }] },
    });
    await prisma.agentMemory.create({
      data: { sessionId: 'session-b', agentType: 'SDR', organizationId: ORG_B, messages: [{ role: 'user', content: 'B' }] },
    });

    // Mesmo sessionId por engano não vaza entre tenants quando organizationId também filtra.
    const crossTenant = await prisma.agentMemory.findFirst({
      where: { sessionId: 'session-b', organizationId: ORG_A },
    });
    expect(crossTenant).toBeNull();

    const ownTenant = await prisma.agentMemory.findFirst({
      where: { sessionId: 'session-a', organizationId: ORG_A },
    });
    expect(ownTenant?.sessionId).toBe('session-a');
  });

  it('AIPendingAction: rotas de aprovar/descartar por id+organizationId não afetam ação de outro tenant', async () => {
    await prisma.aIPendingAction.create({
      data: { id: 'action-a', entity: 'Lead', action: 'send_email', payload: {}, organizationId: ORG_A },
    });
    await prisma.aIPendingAction.create({
      data: { id: 'action-b', entity: 'Lead', action: 'send_email', payload: {}, organizationId: ORG_B },
    });

    const foundByOtherTenant = await prisma.aIPendingAction.findFirst({
      where: { id: 'action-b', organizationId: ORG_A, approved: false },
    });
    expect(foundByOtherTenant).toBeNull();

    const listAsB = await prisma.aIPendingAction.findMany({ where: { organizationId: ORG_B, approved: false } });
    expect(listAsB.map((a) => a.id)).toEqual(['action-b']);
  });
});
