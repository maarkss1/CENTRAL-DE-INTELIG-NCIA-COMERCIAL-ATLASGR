import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { contactEmailIndex, contactPhoneIndex } from '../../src/lib/crypto/piiIndex';

/**
 * Prova, contra Postgres real, `scripts/security/backfill-contact-pii.ts` — o script que cifra e
 * indexa retroativamente `Contact.email/phone/whatsapp` gravados ANTES da extensão do Prisma
 * (src/lib/prisma.ts) passar a fazer isso automaticamente (ver src/lib/crypto/piiFields.ts).
 *
 * Ponto central testado aqui: a policy de RLS de "Contact" (migration 20260722020322_enable_rls)
 * só aceita `app.current_tenant_id` — diferente de "Organization"/"user", NÃO tem cláusula de
 * `app.bypass_rls`. Um backfill que setasse só bypass_rls (sem iterar por organização) rodaria sem
 * erro e migraria ZERO linhas, silenciosamente — exatamente o tipo de falha que só aparece contra
 * Postgres real com RLS de verdade, não contra um mock de Prisma.
 */

const ORG = `test-backfill-pii-org-${Date.now()}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

function runBackfill(extraArgs: string[] = []): string {
    return execFileSync('npx', ['tsx', 'scripts/security/backfill-contact-pii.ts', ...extraArgs], {
        cwd: process.cwd(),
        env: process.env,
        encoding: 'utf8',
    });
}

beforeAll(async () => {
    await requestContext.run({ bypassRls: true }, () =>
        prisma.organization.create({ data: { id: ORG, name: ORG } }),
    );
});

afterAll(async () => {
    await requestContext.run({ bypassRls: true }, async () => {
        await prisma.contact.deleteMany({ where: { organizationId: ORG } });
        await prisma.company.deleteMany({ where: { organizationId: ORG } });
        await prisma.organization.delete({ where: { id: ORG } });
    });
    await pool.end();
});

describe('backfill-contact-pii — migra Contact legado (texto puro) para cifrado + índice cego', () => {
    it('cifra e indexa uma linha "legada" simulada, de forma idempotente, sem tocar linhas já migradas', async () => {
        let contactId = '';
        await requestContext.run({ tenantId: ORG }, async () => {
            const company = await prisma.company.create({
                data: { tradeName: 'Legacy Co', legalName: 'Legacy Co Ltda' },
            });
            // Cria normalmente (fica cifrado pela extensão) e regrava como texto puro via SQL cru
            // por baixo do Prisma — simula uma linha gravada ANTES desta migração existir.
            const contact = await prisma.contact.create({
                data: { name: 'Legado', email: 'ana@legacy.com', phone: '+55 11 98888-7777', companyId: company.id },
            });
            contactId = contact.id;
        });

        await pool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [ORG]);
        await pool.query(
            `UPDATE "Contact" SET email = $1, phone = $2,
               "emailIndex" = NULL, "emailDomainIndex" = NULL,
               "phoneIndex" = NULL, "phoneLast8Index" = NULL, "phoneLast9Index" = NULL
             WHERE id = $3`,
            ['ana@legacy.com', '+55 11 98888-7777', contactId],
        );
        const legacy = await pool.query('SELECT email, "emailIndex" FROM "Contact" WHERE id = $1', [contactId]);
        expect(legacy.rows[0].email).toBe('ana@legacy.com'); // texto puro, confirma o setup
        expect(legacy.rows[0].emailIndex).toBeNull();

        const dryRunOutput = runBackfill(['--dry-run']);
        expect(dryRunOutput).toMatch(/dry-run/);
        const afterDryRun = await pool.query('SELECT email FROM "Contact" WHERE id = $1', [contactId]);
        expect(afterDryRun.rows[0].email).toBe('ana@legacy.com'); // --dry-run não escreve

        runBackfill();
        const migrated = await pool.query(
            'SELECT email, "emailIndex", phone, "phoneIndex" FROM "Contact" WHERE id = $1',
            [contactId],
        );
        expect(String(migrated.rows[0].email)).toMatch(/^enc:v1:/);
        expect(migrated.rows[0].emailIndex).toBe(contactEmailIndex('ana@legacy.com'));
        expect(String(migrated.rows[0].phone)).toMatch(/^enc:v1:/);
        expect(migrated.rows[0].phoneIndex).toBe(contactPhoneIndex('+55 11 98888-7777'));

        // Busca exata pelo índice — prova que o contato "legado" passou a ser encontrável do
        // mesmo jeito que um contato criado normalmente já era (ver call sites reescritos:
        // emailReply.webhook.ts, ownershipGuard.ts, etc.).
        await requestContext.run({ tenantId: ORG }, async () => {
            const found = await prisma.contact.findFirst({ where: { emailIndex: contactEmailIndex('ANA@legacy.com') } });
            expect(found?.id).toBe(contactId);
        });

        // Idempotência: rodar de novo não re-cifra (ciphertext idêntico — nova cifragem teria IV
        // diferente e mudaria o valor).
        runBackfill();
        const afterSecondRun = await pool.query('SELECT email FROM "Contact" WHERE id = $1', [contactId]);
        expect(afterSecondRun.rows[0].email).toBe(migrated.rows[0].email);
    }, 30_000);
});
