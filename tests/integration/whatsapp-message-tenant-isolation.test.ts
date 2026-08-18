import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

// SEC-007 (Sprint 01/Onda 13) — item de cobertura dedicado a WhatsAppMessage. Antes deste arquivo,
// WhatsAppMessage só era exercitado em tests/integration/lgpd-erasure-cross-tenant.test.ts
// (mascaramento pelo erase) e em tests/integration/whatsapp-optout-gating.test.ts (foco em
// OptOutRecord, não em isolamento da própria mensagem — mas o padrão de seed de
// Company/Contact/Lead usado lá, em `seedLeadWithContact`, é reaproveitado aqui). Este arquivo
// segue o mesmo padrão de setup de lgpd-erasure-cross-tenant.test.ts (duas organizações reais via
// prisma.organization.create, contexto via requestContext/withTenant, RLS real) e o padrão de "ID
// manipulado diretamente" de tests/integration/tenant-isolation-db001.test.ts.
//
// IMPORTANTE (mesma pegadinha documentada nos outros specs deste diretório): o callback passado a
// `requestContext.run()` precisa ser uma função `async`, mesmo sem `await` explícito no corpo.
const withBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const withTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> => requestContext.run({ tenantId }, fn);

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ORG_A = `test-wa-tenant-org-a-${suffix}`;
const ORG_B = `test-wa-tenant-org-b-${suffix}`;

describe('WhatsAppMessage — isolamento de tenant (integração real, RLS real)', () => {
  afterAll(async () => withBypass(async () => {
    await prisma.whatsAppMessage.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
    await prisma.lead.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
    await prisma.contact.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
    await prisma.company.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
  }));

  it('1. isolamento básico: mensagem criada em A não aparece em listagem/busca no contexto de B', async () => {
    await withBypass(async () => {
      await prisma.organization.create({ data: { id: ORG_A, name: 'Test WA Tenant Org A' } });
      await prisma.organization.create({ data: { id: ORG_B, name: 'Test WA Tenant Org B' } });
    });

    const companyA = await withTenant(ORG_A, async () =>
      prisma.company.create({ data: { legalName: 'Empresa A LTDA', tradeName: 'Empresa A' } }),
    );
    const contactA = await withTenant(ORG_A, async () =>
      prisma.contact.create({ data: { name: 'Contato A', phone: '+5511999880001', companyId: companyA.id } }),
    );
    const leadA = await withTenant(ORG_A, async () =>
      prisma.lead.create({ data: { organizationId: ORG_A, contactId: contactA.id, companyId: companyA.id, title: 'Negócio A' } }),
    );

    const companyB = await withTenant(ORG_B, async () =>
      prisma.company.create({ data: { legalName: 'Empresa B LTDA', tradeName: 'Empresa B' } }),
    );
    const contactB = await withTenant(ORG_B, async () =>
      prisma.contact.create({ data: { name: 'Contato B', phone: '+5511999880002', companyId: companyB.id } }),
    );
    const leadB = await withTenant(ORG_B, async () =>
      prisma.lead.create({ data: { organizationId: ORG_B, contactId: contactB.id, companyId: companyB.id, title: 'Negócio B' } }),
    );

    const messageA = await withTenant(ORG_A, async () =>
      prisma.whatsAppMessage.create({
        data: {
          organizationId: ORG_A,
          waMessageId: `wa-tenant-a-${suffix}`,
          direction: 'inbound',
          phoneE164: '+5511999880001',
          body: 'Mensagem confidencial de A',
          contactId: contactA.id,
          leadId: leadA.id,
        },
      }),
    );
    await withTenant(ORG_B, async () =>
      prisma.whatsAppMessage.create({
        data: {
          organizationId: ORG_B,
          waMessageId: `wa-tenant-b-${suffix}`,
          direction: 'inbound',
          phoneE164: '+5511999880002',
          body: 'Mensagem confidencial de B',
          contactId: contactB.id,
          leadId: leadB.id,
        },
      }),
    );

    // Listagem geral sob RLS real no contexto de B nunca enxerga a mensagem de A.
    const listAsB = await withTenant(ORG_B, async () => prisma.whatsAppMessage.findMany({}));
    expect(listAsB.map((m) => m.id)).not.toContain(messageA.id);
    expect(listAsB.every((m) => m.organizationId === ORG_B)).toBe(true);

    // Busca por telefone/contato/lead de A, feita no contexto de B, também não retorna nada —
    // mesmo usando os identificadores exatos de A (não é um filtro coincidente por acaso).
    const searchByPhoneAsB = await withTenant(ORG_B, async () =>
      prisma.whatsAppMessage.findMany({ where: { phoneE164: '+5511999880001' } }),
    );
    expect(searchByPhoneAsB).toEqual([]);

    const searchByContactAsB = await withTenant(ORG_B, async () =>
      prisma.whatsAppMessage.findMany({ where: { contactId: contactA.id } }),
    );
    expect(searchByContactAsB).toEqual([]);

    const listAsA = await withTenant(ORG_A, async () => prisma.whatsAppMessage.findMany({}));
    expect(listAsA.map((m) => m.id)).toEqual([messageA.id]);
  });

  it('2. ID manipulado: ler a mensagem de A pelo ID exato estando no contexto de B é bloqueado por RLS real', async () => {
    const companyA = await withTenant(ORG_A, async () =>
      prisma.company.create({ data: { legalName: 'Empresa A2 LTDA', tradeName: 'Empresa A2' } }),
    );
    const contactA = await withTenant(ORG_A, async () =>
      prisma.contact.create({ data: { name: 'Contato A2', phone: '+5511999880003', companyId: companyA.id } }),
    );
    const leadA = await withTenant(ORG_A, async () =>
      prisma.lead.create({ data: { organizationId: ORG_A, contactId: contactA.id, companyId: companyA.id, title: 'Negócio A2' } }),
    );
    const messageA = await withTenant(ORG_A, async () =>
      prisma.whatsAppMessage.create({
        data: {
          organizationId: ORG_A,
          waMessageId: `wa-tenant-a2-${suffix}`,
          direction: 'inbound',
          phoneE164: '+5511999880003',
          body: 'Mensagem sensível de A, item 2',
          contactId: contactA.id,
          leadId: leadA.id,
        },
      }),
    );

    const readAsB = await withTenant(ORG_B, async () =>
      prisma.whatsAppMessage.findUnique({ where: { id: messageA.id } }),
    );
    expect(readAsB).toBeNull();

    const readManyAsB = await withTenant(ORG_B, async () =>
      prisma.whatsAppMessage.findMany({ where: { id: messageA.id } }),
    );
    expect(readManyAsB).toEqual([]);

    // Escrita por ID exato (padrão "IDOR corrigido" de tenant-isolation-db001.test.ts): 0 linhas
    // afetadas, o corpo da mensagem de A permanece intacto.
    const updateAttempt = await withTenant(ORG_B, async () =>
      prisma.whatsAppMessage.updateMany({
        where: { id: messageA.id },
        data: { body: 'HACKED por B' },
      }),
    );
    expect(updateAttempt.count).toBe(0);

    const untouched = await withBypass(async () =>
      prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: messageA.id } }),
    );
    expect(untouched.body).toBe('Mensagem sensível de A, item 2');
  });
});
