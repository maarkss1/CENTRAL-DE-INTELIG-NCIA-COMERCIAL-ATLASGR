import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { eraseDataSubject, ANONYMIZED_CONTACT_NAME } from '../../src/shared/services/dataSubjectErasure.service';

// Handoff: .agents/handoffs/onda-6/01A-para-14-lgpd-erasure-cross-tenant-test.md
//
// Cobre o item 4 da missão do Agente 01A (.agents/prompts/01A-dados-rls-retencao.md): "cria
// titular em duas organizações, apaga em uma e comprova que a outra permanece intacta". O 01A já
// tinha provado isso ao vivo contra Postgres real (9/9 checks OK) com um script temporário não
// commitado — este arquivo é a versão permanente, no padrão de
// tests/integration/tenant-isolation-db001.test.ts, para pegar regressão futura em
// eraseDataSubject (src/shared/services/dataSubjectErasure.service.ts).
//
// Cria dados reais (Company/Contact/Lead/WhatsAppMessage/ConversationSignal/TimelineEvent) em duas
// organizações (ORG_A/ORG_B) fora de qualquer request HTTP — por isso usa bypassRls só para
// setup/leitura de asserção/teardown (ver src/lib/async-context.ts), igual ao padrão já
// estabelecido. `eraseDataSubject` em si roda sob RLS real: a própria função já abre
// requestContext.run({ tenantId: organizationId }) internamente (ver dataSubjectErasure.service.ts),
// então chamá-la para o titular de ORG_A já exercita a policy de RLS de verdade, não um bypass.
//
// IMPORTANTE — pegadinha real encontrada escrevendo este arquivo: o callback passado a
// `requestContext.run()` PRECISA ser uma função `async` (mesmo sem nenhum `await` dentro dela).
// `src/lib/prisma.ts` lê `requestContext.getStore()` de forma síncrona no topo do
// `$allOperations` da extensão do Prisma; se o callback passado a `run()` for uma arrow function
// não-async que só repassa a Promise (`() => prisma.x.create(...)`), o motor de query do Prisma
// 7 (`client-engine-runtime`) processa a chamada fora da janela em que o AsyncLocalStorage
// considera o contexto "ativo", e `getStore()` volta `undefined` — sem tenantId nem bypassRls, a
// policy de RLS nega o INSERT/UPDATE com "new row violates row-level security policy", mesmo
// tendo passado tenantId/bypassRls corretos para `run()`. Envolver o callback em `async () => {...}`
// (o padrão já usado em todo o resto de `tests/integration/`) resolve — por isso todo `withTenant`/
// `withBypass` abaixo usa `async`, mesmo quando não há `await` explícito no corpo.
const withBypass = <T>(fn: () => Promise<T>): Promise<T> =>
  requestContext.run({ bypassRls: true }, fn);

const withTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
  requestContext.run({ tenantId }, fn);

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ORG_A = `test-lgpd-org-a-${suffix}`;
const ORG_B = `test-lgpd-org-b-${suffix}`;

describe('eraseDataSubject — exclusão de titular sem vazamento cross-tenant (integração real)', () => {
  afterAll(async () => withBypass(async () => {
    await prisma.whatsAppMessage.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
    await prisma.conversationSignal.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
    // TimelineEvent não tem organizationId próprio (filtra via Lead pai — ver schema.prisma) — o
    // afterEach global de tests/helpers/integration-setup.ts já limpa Lead/Contact/Company/
    // TimelineEvent sem where (roda depois de cada teste), então isto é defensivo/idempotente caso
    // este arquivo rode sozinho fora dessa suíte.
    await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
  }));

  it('apaga titular de ORG_A sem tocar o titular equivalente em ORG_B, e RLS real bloqueia leitura cross-tenant', async () => {
    // --- Seed: duas organizações, cada uma com Company → Contact → Lead → WhatsAppMessage/
    // ConversationSignal/TimelineEvent ligados ao mesmo titular (Contact). ---
    await withBypass(async () => {
      await prisma.organization.create({ data: { id: ORG_A, name: 'Test LGPD Org A' } });
      await prisma.organization.create({ data: { id: ORG_B, name: 'Test LGPD Org B' } });
    });

    const companyA = await withTenant(ORG_A, async () =>
      prisma.company.create({ data: { legalName: 'Empresa A LTDA', tradeName: 'Empresa A' } }),
    );
    const companyB = await withTenant(ORG_B, async () =>
      prisma.company.create({ data: { legalName: 'Empresa B LTDA', tradeName: 'Empresa B' } }),
    );

    const contactA = await withTenant(ORG_A, async () =>
      prisma.contact.create({
        data: {
          name: 'Titular A',
          phone: '+5511999990001',
          whatsapp: '+5511999990001',
          email: 'titular-a@example.com',
          linkedin: 'https://linkedin.com/in/titular-a',
          observations: 'Observação sensível sobre o titular A',
          companyId: companyA.id,
        },
      }),
    );
    const contactB = await withTenant(ORG_B, async () =>
      prisma.contact.create({
        data: {
          name: 'Titular B',
          phone: '+5511999990002',
          whatsapp: '+5511999990002',
          email: 'titular-b@example.com',
          linkedin: 'https://linkedin.com/in/titular-b',
          observations: 'Observação sensível sobre o titular B',
          companyId: companyB.id,
        },
      }),
    );

    const leadA = await withTenant(ORG_A, async () =>
      prisma.lead.create({ data: { contactId: contactA.id, companyId: companyA.id, title: 'Negócio A' } }),
    );
    const leadB = await withTenant(ORG_B, async () =>
      prisma.lead.create({ data: { contactId: contactB.id, companyId: companyB.id, title: 'Negócio B' } }),
    );

    await withTenant(ORG_A, async () =>
      prisma.whatsAppMessage.create({
        data: {
          organizationId: ORG_A,
          waMessageId: `wa-a-${suffix}`,
          direction: 'inbound',
          phoneE164: '+5511999990001',
          body: 'Mensagem de PII do titular A',
          contactId: contactA.id,
          leadId: leadA.id,
        },
      }),
    );
    await withTenant(ORG_B, async () =>
      prisma.whatsAppMessage.create({
        data: {
          organizationId: ORG_B,
          waMessageId: `wa-b-${suffix}`,
          direction: 'inbound',
          phoneE164: '+5511999990002',
          body: 'Mensagem de PII do titular B',
          contactId: contactB.id,
          leadId: leadB.id,
        },
      }),
    );

    await withTenant(ORG_A, async () =>
      prisma.conversationSignal.create({
        data: {
          organizationId: ORG_A,
          leadId: leadA.id,
          messageCount: 3,
          intent: 'alta_intencao_compra',
          summary: 'Resumo citando o titular A por nome',
          nextStep: 'Ligar para o titular A amanhã',
          objections: ['preço'],
          rawModelOutput: { raw: 'saída do modelo sobre A' },
        },
      }),
    );
    await withTenant(ORG_B, async () =>
      prisma.conversationSignal.create({
        data: {
          organizationId: ORG_B,
          leadId: leadB.id,
          messageCount: 2,
          intent: 'duvida_tecnica',
          summary: 'Resumo citando o titular B por nome',
          nextStep: 'Enviar proposta ao titular B',
          objections: ['prazo'],
          rawModelOutput: { raw: 'saída do modelo sobre B' },
        },
      }),
    );

    await withTenant(ORG_A, async () =>
      prisma.timelineEvent.create({
        data: { type: 'comment', description: 'Ligação com o titular A sobre o contrato', leadId: leadA.id },
      }),
    );
    await withTenant(ORG_B, async () =>
      prisma.timelineEvent.create({
        data: { type: 'comment', description: 'Ligação com o titular B sobre o contrato', leadId: leadB.id },
      }),
    );

    // --- Ação sob teste: apaga o titular de ORG_A (RLS real — eraseDataSubject roda sob o
    // tenant da própria organização passada, não sob bypass). ---
    const result = await eraseDataSubject({ organizationId: ORG_A, contactId: contactA.id });

    expect(result).toMatchObject({
      contactId: contactA.id,
      whatsAppMessagesMasked: 1,
      conversationSignalsRedacted: 1,
      timelineEventsRedacted: 1,
      alreadyAnonymized: false,
    });

    // --- 1. Contact de ORG_A anonimizado. ---
    const contactAAfter = await withBypass(async () =>
      prisma.contact.findUniqueOrThrow({ where: { id: contactA.id } }),
    );
    expect(contactAAfter.name).toBe(ANONYMIZED_CONTACT_NAME);
    expect(contactAAfter.phone).toBeNull();
    expect(contactAAfter.whatsapp).toBeNull();
    expect(contactAAfter.email).toBeNull();
    expect(contactAAfter.linkedin).toBeNull();
    expect(contactAAfter.observations).toBeNull();
    expect(contactAAfter.customFields).toEqual({});

    // --- 2. Contact de ORG_B permanece intacto. ---
    const contactBAfter = await withBypass(async () =>
      prisma.contact.findUniqueOrThrow({ where: { id: contactB.id } }),
    );
    expect(contactBAfter.name).toBe('Titular B');
    expect(contactBAfter.phone).toBe('+5511999990002');
    expect(contactBAfter.email).toBe('titular-b@example.com');
    expect(contactBAfter.observations).toBe('Observação sensível sobre o titular B');

    // --- 3. Sob RLS real (não bypass), uma leitura do contexto de ORG_B não enxerga nada de
    // ORG_A — nem o Contact, nem o WhatsAppMessage, nem o ConversationSignal, nem o TimelineEvent.
    const crossTenantReadFromB = await withTenant(ORG_B, async () => ({
      contact: await prisma.contact.findUnique({ where: { id: contactA.id } }),
      whatsAppMessage: await prisma.whatsAppMessage.findFirst({ where: { contactId: contactA.id } }),
      conversationSignal: await prisma.conversationSignal.findFirst({ where: { leadId: leadA.id } }),
      timelineEvent: await prisma.timelineEvent.findFirst({ where: { leadId: leadA.id } }),
      leadList: await prisma.lead.findMany({ where: { organizationId: ORG_A } }),
    }));
    expect(crossTenantReadFromB.contact).toBeNull();
    expect(crossTenantReadFromB.whatsAppMessage).toBeNull();
    expect(crossTenantReadFromB.conversationSignal).toBeNull();
    expect(crossTenantReadFromB.timelineEvent).toBeNull();
    expect(crossTenantReadFromB.leadList).toEqual([]);

    // --- 4/5. ConversationSignal de ORG_A redigido, ORG_B intacto. ---
    const signalAAfter = await withBypass(async () =>
      prisma.conversationSignal.findFirstOrThrow({ where: { leadId: leadA.id } }),
    );
    expect(signalAAfter.summary).toBeNull();
    expect(signalAAfter.nextStep).toBeNull();
    expect(signalAAfter.objections).toEqual([]);
    expect(signalAAfter.rawModelOutput).toEqual({});

    const signalBAfter = await withBypass(async () =>
      prisma.conversationSignal.findFirstOrThrow({ where: { leadId: leadB.id } }),
    );
    expect(signalBAfter.summary).toBe('Resumo citando o titular B por nome');
    expect(signalBAfter.nextStep).toBe('Enviar proposta ao titular B');
    expect(signalBAfter.objections).toEqual(['prazo']);

    // --- 6/7. TimelineEvent de ORG_A redigido, ORG_B intacto. ---
    const timelineAAfter = await withBypass(async () =>
      prisma.timelineEvent.findFirstOrThrow({ where: { leadId: leadA.id } }),
    );
    expect(timelineAAfter.description).toBe('[evento anonimizado — LGPD]');

    const timelineBAfter = await withBypass(async () =>
      prisma.timelineEvent.findFirstOrThrow({ where: { leadId: leadB.id } }),
    );
    expect(timelineBAfter.description).toBe('Ligação com o titular B sobre o contrato');

    // --- 8/9. WhatsAppMessage de ORG_A mascarado, ORG_B intacto. ---
    const waAAfter = await withBypass(async () =>
      prisma.whatsAppMessage.findFirstOrThrow({ where: { contactId: contactA.id } }),
    );
    expect(waAAfter.body).toBeNull();

    const waBAfter = await withBypass(async () =>
      prisma.whatsAppMessage.findFirstOrThrow({ where: { contactId: contactB.id } }),
    );
    expect(waBAfter.body).toBe('Mensagem de PII do titular B');

    // --- Idempotência (garantia documentada no docstring de eraseDataSubject): rodar de novo
    // sobre um titular já anonimizado não falha, não duplica efeito, e sinaliza alreadyAnonymized.
    const secondRun = await eraseDataSubject({ organizationId: ORG_A, contactId: contactA.id });
    expect(secondRun.alreadyAnonymized).toBe(true);
    const contactAAfterSecondRun = await withBypass(async () =>
      prisma.contact.findUniqueOrThrow({ where: { id: contactA.id } }),
    );
    expect(contactAAfterSecondRun.name).toBe(ANONYMIZED_CONTACT_NAME);
  });
});
