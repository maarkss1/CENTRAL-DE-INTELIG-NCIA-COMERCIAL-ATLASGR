import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { CompanyFactory, ContactFactory } from '../helpers/factories';

/**
 * PENDENTE da migration do handoff `.agents/handoffs/onda-42/01-para-00-pii-hash-fields.md`
 * (`Contact.phoneHash`/`whatsappHash`/`emailHash`, campos String? indexados) — schema/migrations
 * são de dono único deste repositório, não aplicados por este agente. Até a migration ser aplicada
 * E `prisma generate` rodar de novo com o schema atualizado, o Prisma Client real não conhece esses
 * campos: qualquer `where`/`data` que os referencie falha em runtime com "Unknown argument" contra
 * Postgres real (o TypeScript compila porque src/lib/prisma.ts e os pontos de leitura que passaram
 * a usar esses campos fazem cast explícito para `Record<string, unknown>`/`as unknown as
 * Prisma.XxxInput` — ver comentários nesses arquivos).
 *
 * Depois de aplicar a migration, remover o `.skip` abaixo (e o `describe.skip` → `describe`) para
 * este teste rodar de verdade contra Postgres real — ele prova exatamente o que a DEC-01 (dossiê de
 * auditoria CPI, opção A) pediu: busca exata por telefone/e-mail de Contact continua funcionando
 * via `phoneHash`/`emailHash` (src/lib/security/piiSearchIndex.ts), calculados automaticamente na
 * escrita pela extensão do Prisma (src/lib/prisma.ts, passo "1c").
 */
describe.skip('Contact.phoneHash/emailHash — índice de busca determinístico (DEC-01/onda-42, PENDENTE de migration)', () => {
    const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ORG = `test-pii-hash-${RUN_ID}`;

    const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
    const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> => requestContext.run({ tenantId: organizationId }, fn);

    beforeAll(async () => {
        await withRlsBypass(async () => {
            await prisma.organization.create({ data: { id: ORG, name: 'Test Org (PII hash index)' } });
        });
    });

    afterAll(async () => {
        await withRlsBypass(async () => {
            await prisma.contact.deleteMany({ where: { organizationId: ORG } });
            await prisma.company.deleteMany({ where: { organizationId: ORG } });
            await prisma.organization.delete({ where: { id: ORG } });
        });
    });

    it('create de Contact grava phoneHash/emailHash/whatsappHash automaticamente, sem o call site precisar calculá-los', async () => {
        const { hashEmailForSearchIndex, hashPhoneForSearchIndex } = await import('../../src/lib/security/piiSearchIndex');

        const contact = await asOrg(ORG, async () => {
            const company = await prisma.company.create({ data: CompanyFactory.build({ organizationId: ORG }) as never });
            const data = ContactFactory.build({
                organizationId: ORG,
                email: 'Titular@Empresa.com.br',
                phone: '(11) 99999-8888',
                whatsapp: '11999998888',
                companyId: company.id,
            }) as Record<string, unknown>;
            delete data.company;
            return prisma.contact.create({ data: data as never });
        }) as unknown as Record<string, unknown>;

        expect(contact.emailHash).toBe(hashEmailForSearchIndex('Titular@Empresa.com.br'));
        expect(contact.phoneHash).toBe(hashPhoneForSearchIndex('(11) 99999-8888'));
        expect(contact.whatsappHash).toBe(hashPhoneForSearchIndex('11999998888'));
    });

    it('busca exata por e-mail (formatação/caixa diferente) via emailHash encontra o contato — mesmo fluxo de emailReply.webhook.ts', async () => {
        const { hashEmailForSearchIndex } = await import('../../src/lib/security/piiSearchIndex');

        await asOrg(ORG, async () => {
            const company = await prisma.company.create({ data: CompanyFactory.build({ organizationId: ORG }) as never });
            const data = ContactFactory.build({
                organizationId: ORG,
                email: 'busca-exata@empresa.com',
                companyId: company.id,
            }) as Record<string, unknown>;
            delete data.company;
            await prisma.contact.create({ data: data as never });
        });

        const found = await asOrg(ORG, () =>
            prisma.contact.findFirst({
                where: { organizationId: ORG, emailHash: hashEmailForSearchIndex('BUSCA-EXATA@EMPRESA.COM') } as never,
            }),
        );

        expect(found).not.toBeNull();
        expect((found as unknown as { email: string } | null)?.email).toBe('busca-exata@empresa.com');
    });

    it('update que limpa o telefone (`phone: null`) também limpa phoneHash — não deixa um hash órfão de um valor apagado', async () => {
        const contact = await asOrg(ORG, async () => {
            const company = await prisma.company.create({ data: CompanyFactory.build({ organizationId: ORG }) as never });
            const data = ContactFactory.build({
                organizationId: ORG,
                phone: '11988887777',
                companyId: company.id,
            }) as Record<string, unknown>;
            delete data.company;
            return prisma.contact.create({ data: data as never });
        }) as unknown as { id: string };

        const updated = await asOrg(ORG, () =>
            prisma.contact.update({ where: { id: contact.id }, data: { phone: null } }),
        ) as unknown as Record<string, unknown>;

        expect(updated.phone).toBeNull();
        expect(updated.phoneHash).toBeNull();
    });

    it('update parcial que não toca phone/email/whatsapp preserva os hashes já gravados', async () => {
        const contact = await asOrg(ORG, async () => {
            const company = await prisma.company.create({ data: CompanyFactory.build({ organizationId: ORG }) as never });
            const data = ContactFactory.build({
                organizationId: ORG,
                email: 'preservado@empresa.com',
                companyId: company.id,
            }) as Record<string, unknown>;
            delete data.company;
            return prisma.contact.create({ data: data as never });
        }) as unknown as Record<string, unknown>;

        const updated = await asOrg(ORG, () =>
            prisma.contact.update({ where: { id: contact.id as string }, data: { role: 'Diretor Comercial' } }),
        ) as unknown as Record<string, unknown>;

        expect(updated.emailHash).toBe(contact.emailHash);
    });
});
