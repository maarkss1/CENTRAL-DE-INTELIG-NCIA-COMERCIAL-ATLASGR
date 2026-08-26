import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

// SEC-007 (Sprint 01/Onda 13) — item de cobertura dedicado a ConversationSignal. Antes deste
// arquivo, ConversationSignal só era exercitado "de carona" dentro de
// tests/integration/lgpd-erasure-cross-tenant.test.ts (um teste de erase, não de isolamento). Este
// arquivo segue o mesmo padrão de setup dessa suíte (duas organizações reais via
// prisma.organization.create, contexto de tenant via requestContext/withTenant, RLS real — nunca
// mock) e o padrão de "ID manipulado diretamente" de tests/integration/tenant-isolation-db001.test.ts
// (não confiar só no filtro implícito de organizationId — tentar ler/escrever um registro de outro
// tenant passando o ID exato dele).
//
// IMPORTANTE (mesma pegadinha documentada em lgpd-erasure-cross-tenant.test.ts): o callback passado
// a `requestContext.run()` precisa ser uma função `async`, mesmo sem `await` explícito no corpo —
// senão o motor de query do Prisma processa a chamada fora da janela em que o AsyncLocalStorage
// considera o contexto "ativo", e a policy de RLS nega a operação por falta de tenantId/bypassRls.
const withBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const withTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> => requestContext.run({ tenantId }, fn);

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ORG_A = `test-cs-tenant-org-a-${suffix}`;
const ORG_B = `test-cs-tenant-org-b-${suffix}`;

describe('ConversationSignal — isolamento de tenant (integração real, RLS real)', () => {
  afterAll(async () => {
    // ConversationSignal não está no allowlist de bypass (ITEM-02) — limpa por tenant.
    await withTenant(ORG_A, () => prisma.conversationSignal.deleteMany({ where: { organizationId: ORG_A } }));
    await withTenant(ORG_B, () => prisma.conversationSignal.deleteMany({ where: { organizationId: ORG_B } }));
    await withBypass(async () => {
      await prisma.lead.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
      await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
    });
  });

  it('1. isolamento básico de leitura: signal criado em A não aparece em listagem no contexto de B', async () => {
    await withBypass(async () => {
      await prisma.organization.create({ data: { id: ORG_A, name: 'Test CS Tenant Org A' } });
      await prisma.organization.create({ data: { id: ORG_B, name: 'Test CS Tenant Org B' } });
    });

    const leadA = await withTenant(ORG_A, async () =>
      prisma.lead.create({ data: { organizationId: ORG_A, title: 'Negócio A' } }),
    );
    const leadB = await withTenant(ORG_B, async () =>
      prisma.lead.create({ data: { organizationId: ORG_B, title: 'Negócio B' } }),
    );

    const signalA = await withTenant(ORG_A, async () =>
      prisma.conversationSignal.create({
        data: {
          organizationId: ORG_A,
          leadId: leadA.id,
          messageCount: 3,
          intent: 'alta_intencao_compra',
          summary: 'Resumo do sinal de A',
        },
      }),
    );
    await withTenant(ORG_B, async () =>
      prisma.conversationSignal.create({
        data: {
          organizationId: ORG_B,
          leadId: leadB.id,
          messageCount: 1,
          intent: 'sem_interesse',
          summary: 'Resumo do sinal de B',
        },
      }),
    );

    // Listagem sob RLS real no contexto de B nunca enxerga o signal de A, mesmo sem filtro
    // explícito de organizationId na query (a policy de RLS já restringe as linhas visíveis).
    const listAsB = await withTenant(ORG_B, async () => prisma.conversationSignal.findMany({}));
    expect(listAsB.map((s) => s.id)).not.toContain(signalA.id);
    expect(listAsB.every((s) => s.organizationId === ORG_B)).toBe(true);

    const listAsA = await withTenant(ORG_A, async () => prisma.conversationSignal.findMany({}));
    expect(listAsA.map((s) => s.id)).toEqual([signalA.id]);
  });

  it('2. ID manipulado: ler/atualizar o signal de A pelo ID exato estando no contexto de B falha/retorna vazio', async () => {
    const leadA = await withTenant(ORG_A, async () =>
      prisma.lead.create({ data: { organizationId: ORG_A, title: 'Negócio A (item 2)' } }),
    );
    const signalA = await withTenant(ORG_A, async () =>
      prisma.conversationSignal.create({
        data: {
          organizationId: ORG_A,
          leadId: leadA.id,
          messageCount: 2,
          intent: 'duvida_tecnica',
          summary: 'Sinal sensível de A, item 2',
        },
      }),
    );

    // Leitura por ID exato, sabendo o cuid real — RLS real (não um filtro de aplicação) bloqueia.
    const readAsB = await withTenant(ORG_B, async () =>
      prisma.conversationSignal.findUnique({ where: { id: signalA.id } }),
    );
    expect(readAsB).toBeNull();

    const readManyAsB = await withTenant(ORG_B, async () =>
      prisma.conversationSignal.findMany({ where: { id: signalA.id } }),
    );
    expect(readManyAsB).toEqual([]);

    // Escrita por ID exato (updateMany, o mesmo padrão de "IDOR corrigido" usado em
    // tenant-isolation-db001.test.ts para Prompt): 0 linhas afetadas, nunca o registro de A.
    const updateAttempt = await withTenant(ORG_B, async () =>
      prisma.conversationSignal.updateMany({
        where: { id: signalA.id },
        data: { summary: 'HACKED por B' },
      }),
    );
    expect(updateAttempt.count).toBe(0);

    // ConversationSignal não está no allowlist de bypass (BYPASS_RLS_ALLOWED_MODELS,
    // src/lib/prisma.ts) — ITEM-02 fechou a RLS dessa tabela pra bypass. Confirma no contexto do
    // próprio tenant A.
    const untouched = await withTenant(ORG_A, async () =>
      prisma.conversationSignal.findUniqueOrThrow({ where: { id: signalA.id } }),
    );
    expect(untouched.summary).toBe('Sinal sensível de A, item 2');
  });

  it('3. INSERT tentando gravar organizationId de outra organização, com o contexto RLS de A, é bloqueado', async () => {
    const leadA = await withTenant(ORG_A, async () =>
      prisma.lead.create({ data: { organizationId: ORG_A, title: 'Negócio A (item 3)' } }),
    );

    // Até o ITEM-02 (remediação de dívida técnica P0), a policy de RLS de ConversationSignal (ver
    // prisma/migrations/20260807100000_enable_rls_remaining_tables/migration.sql) usava
    // `WITH CHECK (true)` — o INSERT cross-tenant só era barrado indiretamente, porque
    // `prisma.conversationSignal.create()` gera um `INSERT ... RETURNING *`, e o Postgres aplica a
    // policy de SELECT (USING) sobre a linha retornada; como a linha fabricada tinha
    // organizationId=ORG_B mas o tenant ativo era ORG_A, ela não passava no USING. Confirmado à
    // época via psql direto (um INSERT cru SEM RETURNING passava, apesar de organizationId
    // divergente) — ou seja, a proteção real dependia do RETURNING implícito do Prisma, não de um
    // WITH CHECK restritivo. A migration 20260825120000_scope_rls_bypass_to_bootstrap_allowlist
    // fechou isso na origem: WITH CHECK agora exige o mesmo match de tenant do USING, então o
    // INSERT cross-tenant é rejeitado diretamente pelo próprio WITH CHECK, sem depender do
    // RETURNING. A asserção abaixo (mensagem "row-level security") continua válida nos dois casos.
    await expect(
      withTenant(ORG_A, async () =>
        prisma.conversationSignal.create({
          data: {
            organizationId: ORG_B,
            leadId: leadA.id,
            messageCount: 1,
            summary: 'Tentativa de escrita cross-tenant',
          },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);

    // Nenhuma linha vaza para nenhum dos dois tenants como resultado da tentativa. ConversationSignal
    // não está no allowlist de bypass (ITEM-02) — checar em cada tenant real (não bypass, que
    // devolveria [] de qualquer forma sob RLS fechada, dando falsa confiança) é a prova real.
    const leakedAsA = await withTenant(ORG_A, async () =>
      prisma.conversationSignal.findMany({ where: { leadId: leadA.id } }),
    );
    expect(leakedAsA).toEqual([]);
    const leakedAsB = await withTenant(ORG_B, async () =>
      prisma.conversationSignal.findMany({ where: { leadId: leadA.id } }),
    );
    expect(leakedAsB).toEqual([]);
  });
});
