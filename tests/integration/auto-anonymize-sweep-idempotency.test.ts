import { describe, it, expect, afterAll } from 'vitest';
import { prisma, withRlsContext } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { runAutoAnonymizeSweep } from '../../src/features/crm/jobs/autoAnonymizeDisqualified.worker';
import { ANONYMIZED_CONTACT_NAME } from '../../src/shared/services/dataSubjectErasure.service';

// SEC-007 (Sprint 01/Onda 13) — idempotência do worker de anonimização automática de leads
// desqualificados há > 90 dias (`runAutoAnonymizeSweep`,
// src/features/crm/jobs/autoAnonymizeDisqualified.worker.ts). `eraseDataSubject` já é provado
// idempotente isoladamente (ver tests/integration/lgpd-erasure-cross-tenant.test.ts), mas isso
// nunca tinha sido comprovado rodando a VARREDURA inteira duas vezes seguidas — o filtro
// `contact.name != '[titular anonimizado — LGPD]'` é o que deveria impedir a segunda rodada de
// reprocessar quem a primeira já tratou.
//
// IMPORTANTE (mesma pegadinha documentada nos outros specs deste diretório): o callback passado a
// `requestContext.run()` precisa ser uma função `async`, mesmo sem `await` explícito no corpo.
const withBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const withTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> => requestContext.run({ tenantId }, fn);

// BUG REAL encontrado escrevendo este teste, CORRIGIDO na mesma sprint (SEC-007): até este ponto,
// `runAutoAnonymizeSweep` fazia `prisma.lead.findMany(...)` sem nenhum `requestContext.run(...)`
// próprio — ao contrário do worker cross-tenant análogo já existente no repo (`runBitrixSyncTick`,
// src/features/integrations/bitrix/service/syncRules.ts), que abre explicitamente
// `requestContext.run({ bypassRls: true }, ...)` em volta da varredura inicial entre tenants.
// Confirmado empiricamente: sem tenant/bypass ativos, a policy RLS de "Lead" nega todas as linhas
// silenciosamente (`findMany` sempre devolvia `[]`, sem erro) — como o processor do BullMQ chama a
// função exatamente assim, sem wrapper algum, o worker de produção NUNCA anonimizava nenhum lead.
// Corrigido em `src/features/crm/jobs/autoAnonymizeDisqualified.worker.ts`: a função agora abre seu
// próprio `requestContext.run({ bypassRls: true }, ...)` em volta da descoberta cross-tenant, mesmo
// padrão do `runBitrixSyncTick`. `eraseDataSubject`, chamado por lead elegível, continua abrindo
// seu próprio `requestContext.run({ tenantId: organizationId })` (dataSubjectErasure.service.ts) —
// a anonimização em si roda sob RLS real de tenant, não sob bypass.
//
// Por isso este teste chama `runAutoAnonymizeSweep()` DIRETO, sem nenhum wrapper de contexto — é
// exatamente o que o processor real do BullMQ faz, e é a prova de que a correção funciona sem
// exigir que quem chama a função saiba que precisa embrulhar a chamada.

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ORG = `test-auto-anonymize-org-${suffix}`;

describe('runAutoAnonymizeSweep — idempotência real (Postgres real)', () => {
  afterAll(async () => withBypass(async () => {
    await prisma.lead.deleteMany({ where: { organizationId: ORG } });
    await prisma.contact.deleteMany({ where: { organizationId: ORG } });
    await prisma.company.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.deleteMany({ where: { id: ORG } });
  }));

  it('anonimiza um lead Negócios Perdidos há mais de 90 dias, e uma segunda rodada não reprocessa nem falha', async () => {
    await withBypass(async () => {
      await prisma.organization.create({ data: { id: ORG, name: 'Test Auto Anonymize Org' } });
    });

    const company = await withTenant(ORG, async () =>
      prisma.company.create({ data: { legalName: 'Empresa Perdida LTDA', tradeName: 'Empresa Perdida' } }),
    );
    const contact = await withTenant(ORG, async () =>
      prisma.contact.create({
        data: {
          name: 'Titular Desqualificado',
          phone: '+5511999770001',
          whatsapp: '+5511999770001',
          email: `titular-desqualificado-${suffix}@example.com`,
          linkedin: 'https://linkedin.com/in/titular-desqualificado',
          observations: 'Observação sensível do titular desqualificado',
          companyId: company.id,
        },
      }),
    );
    const lead = await withTenant(ORG, async () =>
      prisma.lead.create({
        data: {
          organizationId: ORG,
          companyId: company.id,
          contactId: contact.id,
          title: 'Negócio perdido há muito tempo',
          status: 'Negocios_Perdidos',
        },
      }),
    );

    // `updatedAt` é `@updatedAt` (ver prisma/schema.prisma, model Lead) — Prisma sempre sobrescreve
    // para `now()` em qualquer `.update()`/`.create()`, então simular "atualizado há > 90 dias" só
    // é possível com SQL cru. `$executeRaw`/`$queryRaw` NÃO passam pela extensão `$allOperations`
    // de src/lib/prisma.ts (ela só intercepta operações de model) — chamar `prisma.$executeRaw`
    // direto (mesmo dentro de um `requestContext.run({tenantId})`) nunca aplica o `SET LOCAL
    // app.current_tenant_id`, e a RLS de "Lead" bloqueia o UPDATE silenciosamente (0 linhas
    // afetadas, sem lançar erro) — confirmado empiricamente rodando este teste sem `withRlsContext`
    // primeiro: `updatedAt` continuava "agora", não -100 dias. `withRlsContext` (src/lib/prisma.ts)
    // é o helper correto para SQL cru: abre a transação interativa e faz o `SET LOCAL` de tenant
    // explicitamente antes de rodar a query, o mesmo padrão de
    // tests/integration/threecx-persistence.test.ts e tests/integration/prospecting-rls.test.ts.
    await withTenant(ORG, async () => {
      await withRlsContext((tx) =>
        tx.$executeRaw`UPDATE "Lead" SET "updatedAt" = NOW() - INTERVAL '100 days' WHERE id = ${lead.id}`,
      );
    });

    const leadBeforeSweep = await withBypass(async () =>
      prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }),
    );
    expect(leadBeforeSweep.updatedAt.getTime()).toBeLessThan(Date.now() - 89 * 24 * 60 * 60 * 1000);

    // --- 1ª rodada: deve encontrar e anonimizar o lead criado acima. ---
    const firstRun = await runAutoAnonymizeSweep();
    expect(firstRun.anonymizedCount).toBeGreaterThanOrEqual(1);

    const contactAfterFirstRun = await withBypass(async () =>
      prisma.contact.findUniqueOrThrow({ where: { id: contact.id } }),
    );
    expect(contactAfterFirstRun.name).toBe(ANONYMIZED_CONTACT_NAME);
    expect(contactAfterFirstRun.phone).toBeNull();
    expect(contactAfterFirstRun.whatsapp).toBeNull();
    expect(contactAfterFirstRun.email).toBeNull();
    expect(contactAfterFirstRun.linkedin).toBeNull();
    expect(contactAfterFirstRun.observations).toBeNull();
    expect(contactAfterFirstRun.customFields).toEqual({});

    // O lead deixa de ser elegível para a varredura (o filtro `contact.name != ANONYMIZED_CONTACT_NAME`
    // já deveria excluí-lo) — confirma isso direto na query de elegibilidade do sweep, não só no
    // efeito colateral do Contact.
    const stillEligibleAfterFirstRun = await withBypass(async () =>
      prisma.lead.findMany({
        where: {
          id: lead.id,
          status: { in: ['Negocios_Perdidos'] },
          updatedAt: { lte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          contact: { name: { not: ANONYMIZED_CONTACT_NAME } },
        },
      }),
    );
    expect(stillEligibleAfterFirstRun).toEqual([]);

    // --- 2ª rodada, imediatamente depois, sem mudar nada: prova de idempotência real. Não deve
    // lançar erro, e o Contact que criamos precisa continuar anonimizado (o mesmo estado da 1ª
    // rodada, não duplicado nem revertido). Não fazemos asserção sobre o `anonymizedCount` bruto da
    // 2ª chamada: o ambiente pode ter outros leads "Negócios Perdidos" antigos de outras suítes
    // rodando na mesma bateria (mesmo que o afterEach global de
    // tests/helpers/integration-setup.ts limpe Lead/Contact/Company sem where entre testes, este
    // arquivo roda sob bypass explícito e não deveria depender disso para ser uma asserção
    // robusta) — a asserção robusta é reconsultar o Contact/Lead específicos que criamos.
    await expect(runAutoAnonymizeSweep()).resolves.not.toThrow();

    const contactAfterSecondRun = await withBypass(async () =>
      prisma.contact.findUniqueOrThrow({ where: { id: contact.id } }),
    );
    expect(contactAfterSecondRun.name).toBe(ANONYMIZED_CONTACT_NAME);
    expect(contactAfterSecondRun.phone).toBeNull();
    expect(contactAfterSecondRun.email).toBeNull();

    const stillEligibleAfterSecondRun = await withBypass(async () =>
      prisma.lead.findMany({
        where: {
          id: lead.id,
          status: { in: ['Negocios_Perdidos'] },
          updatedAt: { lte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          contact: { name: { not: ANONYMIZED_CONTACT_NAME } },
        },
      }),
    );
    expect(stillEligibleAfterSecondRun).toEqual([]);
  });
});
