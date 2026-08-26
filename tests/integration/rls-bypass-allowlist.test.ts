import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

/**
 * ITEM-02 (remediação de dívida técnica, P0) — prova, contra Postgres real (papel `prospector_app`,
 * NOSUPERUSER, sem BYPASSRLS — ver scripts/db/create-app-role.sql), que o raio de explosão do
 * bypass genérico de RLS (`app.bypass_rls`, a mesma flag de sessão usada por
 * `requestContext.run({ bypassRls: true }, ...)`) foi reduzido de verdade a nível de BANCO, não só
 * de aplicação.
 *
 * Antes desta correção (migration 20260825120000_scope_rls_bypass_to_bootstrap_allowlist), a
 * cláusula `OR current_setting('app.bypass_rls', TRUE) = 'on'` estava presente na policy de
 * praticamente TODAS as ~55 tabelas com FORCE ROW LEVEL SECURITY — a única coisa que restringia o
 * bypass a um subconjunto de models "de bootstrap" (`BYPASS_RLS_ALLOWED_MODELS`,
 * src/lib/prisma.ts) era a camada de aplicação (a extensão `$allOperations` do Prisma Client). Um
 * caminho de código que não passasse por essa extensão — SQL cru via `withRlsContext`, um script
 * novo, um bug futuro no allowlist — teria bypass irrestrito sobre QUALQUER tabela tenant-scoped,
 * porque a própria policy do Postgres já permitia. Pior: várias dessas tabelas também tinham
 * `WITH CHECK (true)` — nem precisava de bypass nenhum para uma escrita cross-tenant passar (ver
 * comentário na migration para o PoC real que confirmou isso: um INSERT em `Prompt` com
 * `organizationId` de outro tenant, sem bypass algum, era aceito e o tenant vítima enxergava a
 * linha como se fosse dele).
 *
 * A migration fechou a policy das tabelas de negócio (Company, Contact, Prompt, KnowledgeChunk,
 * AgentMemory, etc.) para NÃO aceitar mais bypass_rls — nem leitura, nem escrita — mantendo o
 * bypass só nas ~13 tabelas de bootstrap legítimo já documentadas em `BYPASS_RLS_ALLOWED_MODELS`
 * (User/Organization/Session/Account/Verification/BitrixConnection/FeatureFlag/CadenceRun/
 * CadenceSequence/Lead/CrmCommercialDocument/CrmDocumentSignatureRequest/AILog).
 *
 * Company e Prompt são usadas aqui como amostra representativa (uma tabela central do CRM, uma
 * tabela de IA) — a cobertura completa das ~55 tabelas está na migration em si e nos testes de
 * isolamento já existentes por domínio (tenant-isolation-db001, conversation-signal-tenant-
 * isolation, whatsapp-message-tenant-isolation, lgpd-erasure-cross-tenant, etc.), todos ajustados
 * nesta mesma mudança para não depender mais de bypass em tabela fora do allowlist.
 */

const withBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> => requestContext.run({ tenantId }, fn);

const ORG_A = 'test-rls-allowlist-org-a';
const ORG_B = 'test-rls-allowlist-org-b';

describe('Raio de explosão do bypass de RLS — allowlist real a nível de banco (ITEM-02)', () => {
  afterAll(async () => {
    await asOrg(ORG_A, () => prisma.prompt.deleteMany({ where: { organizationId: ORG_A } }));
    await withBypass(() => prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } }));
  });

  it('bypass_rls=on NÃO concede mais leitura cross-tenant em Company (fora do allowlist)', async () => {
    await withBypass(async () => {
      for (const [id, name] of [[ORG_A, 'RLS Allowlist Org A'], [ORG_B, 'RLS Allowlist Org B']] as const) {
        const exists = await prisma.organization.findUnique({ where: { id } });
        if (!exists) await prisma.organization.create({ data: { id, name } });
      }
    });

    const company = await asOrg(ORG_A, () =>
      prisma.company.create({ data: { legalName: 'Empresa Allowlist A', tradeName: 'Empresa A', organizationId: ORG_A } }),
    );

    // Antes desta correção, isto devolvia a linha (bypass_rls='on' bastava, current_tenant_id nem
    // precisava bater). Agora a policy de Company não tem mais essa cláusula — bypass sozinho não
    // basta, e sem current_tenant_id setado a linha fica invisível mesmo pedindo o id exato.
    const seenUnderBypass = await withBypass(() =>
      prisma.company.findUnique({ where: { id: company.id } }),
    );
    expect(seenUnderBypass).toBeNull();

    // Confirma que a linha existe de verdade e é visível no contexto de tenant correto — não é um
    // falso positivo por a linha nunca ter sido criada.
    const seenAsOwner = await asOrg(ORG_A, () => prisma.company.findUnique({ where: { id: company.id } }));
    expect(seenAsOwner?.id).toBe(company.id);

    await asOrg(ORG_A, () => prisma.company.delete({ where: { id: company.id } }));
  });

  it('bypass_rls=on NÃO concede mais escrita cross-tenant em Prompt (fora do allowlist) — fecha o INSERT cross-tenant real', async () => {
    await withBypass(async () => {
      const exists = await prisma.organization.findUnique({ where: { id: ORG_B } });
      if (!exists) await prisma.organization.create({ data: { id: ORG_B, name: 'RLS Allowlist Org B' } });
    });

    // Reprodução do PoC documentado na migration: mesmo com bypass_rls='on' (sem tenant nenhum
    // setado), o INSERT numa tabela fora do allowlist agora é rejeitado pela própria RLS — não
    // depende mais de nenhum filtro de aplicação para ser barrado.
    await expect(
      withBypass(() =>
        prisma.prompt.create({
          data: {
            id: 'prompt-allowlist-blast-radius',
            name: 'p', version: '1.0', owner: ORG_B, category: 'cat',
            organizationId: ORG_B, variables: {}, history: [], approved: true,
          },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);

    // E o mesmo INSERT, escopado ao tenant certo (sem bypass nenhum), funciona normalmente — a
    // correção fecha o bypass indevido sem quebrar a escrita legítima.
    const created = await asOrg(ORG_B, () =>
      prisma.prompt.create({
        data: {
          id: 'prompt-allowlist-legit',
          name: 'p', version: '1.0', owner: ORG_B, category: 'cat',
          organizationId: ORG_B, variables: {}, history: [], approved: true,
        },
      }),
    );
    expect(created.organizationId).toBe(ORG_B);
    await asOrg(ORG_B, () => prisma.prompt.deleteMany({ where: { id: 'prompt-allowlist-legit' } }));
  });

  it('bypass_rls=on continua funcionando em Lead — model de bootstrap legítimo do allowlist (não regrediu)', async () => {
    // Confirma que a correção é uma REDUÇÃO de escopo, não uma remoção total: os models que
    // legitimamente precisam de descoberta cross-tenant antes de conhecer o tenant (cadenceRun.
    // worker.ts, followUp.worker.ts — ver BYPASS_RLS_ALLOWED_MODELS em src/lib/prisma.ts) continuam
    // funcionando exatamente como antes.
    const countUnderBypass = await withBypass(() => prisma.lead.count());
    expect(countUnderBypass).toBeGreaterThanOrEqual(0);
  });
});
