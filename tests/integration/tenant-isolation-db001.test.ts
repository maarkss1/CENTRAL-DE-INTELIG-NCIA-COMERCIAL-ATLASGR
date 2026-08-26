import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

// DB-001 / DB-002 (auditoria de dívida técnica, Fase 0, ciclo C0.2): confirma que consultas a
// KnowledgeChunk, Prompt, AgentMemory e AIPendingAction filtradas por organizationId nunca
// devolvem dado de outro tenant. Cobre a mesma camada que search.service.ts/prompt.routes.ts/
// vector.service.ts/agent.service.ts usam de verdade — filtro explícito de organizationId — que é
// a defesa que hoje realmente vale (ver nota de RLS/superuser em 08-PLANO-DE-SEGURANCA.md).
//
// Roda fora de qualquer request HTTP (sem sessão/tenantId do Better Auth por trás), e manipula
// dois tenants (ORG_A/ORG_B) na mesma conexão de propósito. `Organization` está no allowlist de
// bypass (BYPASS_RLS_ALLOWED_MODELS em src/lib/prisma.ts) — precisa dele pra criar o ORG_B de
// teste, que não é conhecido de nenhum tenant ainda. KnowledgeChunk/Prompt/AgentMemory/
// AIPendingAction NÃO estão no allowlist (ITEM-02, remediação de dívida técnica P0: RLS real
// dessas tabelas não aceita mais bypass_rls, nem pra leitura nem pra escrita — ver migration
// 20260825120000_scope_rls_bypass_to_bootstrap_allowlist) — por isso cada organização escreve
// dentro do PRÓPRIO contexto de tenant (`asOrg`), nunca sob bypass. Isso não invalida o que o
// teste verifica: o que está sob teste é o filtro explícito de organizationId nas queries acima
// (IDOR), somado agora à própria RLS real (que também bloqueia a nível de banco).
const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> =>
  requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
  requestContext.run({ tenantId }, fn);

const ORG_A = 'test-org-id'; // já seedado por tests/helpers/integration-setup.ts
const ORG_B = 'test-org-id-b';

describe('Isolamento de tenant — KnowledgeChunk, Prompt, AgentMemory, AIPendingAction', () => {
  beforeEach(async () => withRlsBypass(async () => {
    const exists = await prisma.organization.findUnique({ where: { id: ORG_B } });
    if (!exists) {
      await prisma.organization.create({ data: { id: ORG_B, name: 'Test Org B' } });
    }
  }));

  afterEach(async () => {
    await asOrg(ORG_A, () => prisma.knowledgeChunk.deleteMany({ where: { id: { in: ['kc-a', 'kc-b'] } } }));
    await asOrg(ORG_B, () => prisma.knowledgeChunk.deleteMany({ where: { id: { in: ['kc-a', 'kc-b'] } } }));
    await asOrg(ORG_A, () => prisma.prompt.deleteMany({ where: { id: { in: ['prompt-a', 'prompt-b'] } } }));
    await asOrg(ORG_B, () => prisma.prompt.deleteMany({ where: { id: { in: ['prompt-a', 'prompt-b'] } } }));
    await asOrg(ORG_A, () => prisma.agentMemory.deleteMany({ where: { sessionId: { in: ['session-a', 'session-b'] } } }));
    await asOrg(ORG_B, () => prisma.agentMemory.deleteMany({ where: { sessionId: { in: ['session-a', 'session-b'] } } }));
    await asOrg(ORG_A, () => prisma.aIPendingAction.deleteMany({ where: { id: { in: ['action-a', 'action-b'] } } }));
    await asOrg(ORG_B, () => prisma.aIPendingAction.deleteMany({ where: { id: { in: ['action-a', 'action-b'] } } }));
    await withRlsBypass(() => prisma.organization.deleteMany({ where: { id: ORG_B } }));
  });

  afterAll(async () => withRlsBypass(async () => {
    await prisma.organization.deleteMany({ where: { id: ORG_B } });
  }));

  it('KnowledgeChunk: busca por organizationId nunca retorna trecho de outro tenant', async () => {
    await asOrg(ORG_A, () => prisma.knowledgeChunk.create({
      data: { id: 'kc-a', content: 'conteúdo do tenant A', organizationId: ORG_A },
    }));
    await asOrg(ORG_B, () => prisma.knowledgeChunk.create({
      data: { id: 'kc-b', content: 'conteúdo do tenant B', organizationId: ORG_B },
    }));

    const asA = await asOrg(ORG_A, () => prisma.knowledgeChunk.findMany({ where: { organizationId: ORG_A } }));
    expect(asA.map((c) => c.id)).toEqual(['kc-a']);

    const asB = await asOrg(ORG_B, () => prisma.knowledgeChunk.findMany({ where: { organizationId: ORG_B } }));
    expect(asB.map((c) => c.id)).toEqual(['kc-b']);
  });

  it('Prompt: listagem e edição por organizationId nunca expõem/alteram prompt de outro tenant (IDOR corrigido)', async () => {
    await asOrg(ORG_A, () => prisma.prompt.create({
      data: {
        id: 'prompt-a', name: 'p', version: '1.0', owner: ORG_A, category: 'cat',
        organizationId: ORG_A, variables: {}, history: [], approved: true,
      },
    }));
    await asOrg(ORG_B, () => prisma.prompt.create({
      data: {
        id: 'prompt-b', name: 'p', version: '1.0', owner: ORG_B, category: 'cat',
        organizationId: ORG_B, variables: {}, history: [], approved: true,
      },
    }));

    const listAsA = await asOrg(ORG_A, () => prisma.prompt.findMany({ where: { organizationId: ORG_A } }));
    expect(listAsA.map((p) => p.id)).toEqual(['prompt-a']);

    // Reproduz o padrão de prompt.routes.ts PUT /:id: updateMany com organizationId no where não
    // deve afetar o prompt do outro tenant, mesmo sabendo o id exato. Roda no contexto de ORG_A
    // (o atacante) tentando alcançar a linha de ORG_B — a própria RLS real já barra a visibilidade
    // da linha antes mesmo do filtro de organizationId no `where` entrar em jogo.
    const attempt = await asOrg(ORG_A, () => prisma.prompt.updateMany({
      where: { id: 'prompt-b', organizationId: ORG_A },
      data: { variables: { hacked: true } },
    }));
    expect(attempt.count).toBe(0);

    const untouched = await asOrg(ORG_B, () => prisma.prompt.findUnique({ where: { id: 'prompt-b' } }));
    expect(untouched?.variables).toEqual({});
  });

  it('AgentMemory: findFirst por sessionId+organizationId nunca resolve a memória de outro tenant', async () => {
    await asOrg(ORG_A, () => prisma.agentMemory.create({
      data: { sessionId: 'session-a', agentType: 'SDR', organizationId: ORG_A, messages: [{ role: 'user', content: 'A' }] },
    }));
    await asOrg(ORG_B, () => prisma.agentMemory.create({
      data: { sessionId: 'session-b', agentType: 'SDR', organizationId: ORG_B, messages: [{ role: 'user', content: 'B' }] },
    }));

    // Mesmo sessionId por engano não vaza entre tenants quando organizationId também filtra.
    const crossTenant = await asOrg(ORG_A, () => prisma.agentMemory.findFirst({
      where: { sessionId: 'session-b', organizationId: ORG_A },
    }));
    expect(crossTenant).toBeNull();

    const ownTenant = await asOrg(ORG_A, () => prisma.agentMemory.findFirst({
      where: { sessionId: 'session-a', organizationId: ORG_A },
    }));
    expect(ownTenant?.sessionId).toBe('session-a');
  });

  it('AIPendingAction: rotas de aprovar/descartar por id+organizationId não afetam ação de outro tenant', async () => {
    await asOrg(ORG_A, () => prisma.aIPendingAction.create({
      data: { id: 'action-a', entity: 'Lead', action: 'send_email', payload: {}, organizationId: ORG_A },
    }));
    await asOrg(ORG_B, () => prisma.aIPendingAction.create({
      data: { id: 'action-b', entity: 'Lead', action: 'send_email', payload: {}, organizationId: ORG_B },
    }));

    const foundByOtherTenant = await asOrg(ORG_A, () => prisma.aIPendingAction.findFirst({
      where: { id: 'action-b', organizationId: ORG_A, approved: false },
    }));
    expect(foundByOtherTenant).toBeNull();

    const listAsB = await asOrg(ORG_B, () => prisma.aIPendingAction.findMany({ where: { organizationId: ORG_B, approved: false } }));
    expect(listAsB.map((a) => a.id)).toEqual(['action-b']);
  });
});
