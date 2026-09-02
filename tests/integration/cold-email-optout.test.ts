import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { prismaOptOutRepository } from '../../src/features/cadence/infra/PrismaOptOutRepository';
import { recordOptOut } from '../../src/features/cadence/application/optOutService';

/**
 * Prova, contra Postgres real, que `cold-email.service.ts` (05) está de fato ligado ao opt-out
 * unificado (`.agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md`, bloqueador LGPD) — não
 * um mock de `isOptedOut`, mas a função real, contra o `PrismaOptOutRepository` real. O transporte
 * SMTP em si (`sendEmail`) é mockado porque não é o que este teste prova (já coberto em
 * `tests/unit/features/prospecting/cold-email.service.test.ts`).
 */

const sendEmailMock = vi.fn();
vi.mock('../../src/lib/email/mailer.js', () => ({
    sendEmail: (...args: unknown[]) => sendEmailMock(...args),
    MailerNotConfiguredError: class MailerNotConfiguredError extends Error {},
}));

// `resolveEmailStatus` (gate de e-mail sem domínio/MX válido em cold-email.service.ts, ver
// `enrichment/domainGuess.ts`) faz uma checagem de MX real — mockado aqui pelo mesmo motivo do
// `sendEmail` acima: não é o que este teste prova, e o e-mail fixture (`empresa-cliente.com.br`)
// não tem MX real, o que faria o gate bloquear o envio antes mesmo de chegar no opt-out testado.
const resolveEmailStatusMock = vi.fn().mockResolvedValue('verified');
vi.mock('../../src/features/prospecting/services/enrichment/domainGuess.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../src/features/prospecting/services/enrichment/domainGuess.js')>()),
    resolveEmailStatus: (...args: unknown[]) => resolveEmailStatusMock(...args),
}));

const { sendColdEmail } = await import('../../src/features/prospecting/services/cold-email.service');

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORG_ID = `test-cold-email-optout-org-${RUN_ID}`;

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> =>
    requestContext.run({ tenantId: organizationId }, fn);

beforeAll(async () => withRlsBypass(async () => {
    await prisma.organization.createMany({
        data: [{ id: ORG_ID, name: 'Test Org (cold-email opt-out)' }],
        skipDuplicates: true,
    });
}));

afterEach(async () => withRlsBypass(async () => {
    await prisma.optOutRecord.deleteMany({ where: { organizationId: ORG_ID } });
    sendEmailMock.mockReset();
}));

afterAll(async () => withRlsBypass(async () => {
    await prisma.optOutRecord.deleteMany({ where: { organizationId: ORG_ID } });
    await prisma.organization.deleteMany({ where: { id: ORG_ID } });
}));

const baseCampaign = (organizationId: string, overrides: Record<string, unknown> = {}) => ({
    id: 'campaign-1',
    targetEmail: 'titular@empresa-cliente.com.br',
    subject: 'Assunto',
    body: 'Corpo',
    status: 'draft' as const,
    legalBasis: 'legitimate_interest' as const,
    dataSource: 'apollo',
    organizationId,
    ...overrides,
});

describe('cold-email.service.ts x opt-out unificado (Postgres real)', () => {
    it('opt-out scope "email" bloqueia o disparo — nunca chama o transporte SMTP', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        await asOrg(ORG_ID, () =>
            recordOptOut(prismaOptOutRepository, {
                organizationId: ORG_ID,
                scope: 'email',
                subject: { email: 'titular@empresa-cliente.com.br' },
                originChannel: 'email',
                reason: 'Pediu para não receber mais e-mail',
                evidence: '"Por favor, remova meu e-mail da lista"',
            }),
        );

        const result = await asOrg(ORG_ID, () => sendColdEmail(baseCampaign(ORG_ID)));

        expect(result).toBe(false);
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('opt-out scope "global" bloqueia o disparo de e-mail', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        await asOrg(ORG_ID, () =>
            recordOptOut(prismaOptOutRepository, {
                organizationId: ORG_ID,
                scope: 'global',
                subject: { email: 'titular@empresa-cliente.com.br' },
                originChannel: 'whatsapp',
                reason: 'Pediu para não ser mais contatado por nenhum canal',
            }),
        );

        const result = await asOrg(ORG_ID, () => sendColdEmail(baseCampaign(ORG_ID)));

        expect(result).toBe(false);
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('opt-out registrado por telefone (voz) bloqueia e-mail do mesmo lead quando phoneE164 é passado', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        await asOrg(ORG_ID, () =>
            recordOptOut(prismaOptOutRepository, {
                organizationId: ORG_ID,
                scope: 'global',
                subject: { phoneE164: '+5511988887777' },
                originChannel: 'voice',
                reason: 'Pediu para não ligarem mais, sem restringir canal',
            }),
        );

        const result = await asOrg(ORG_ID, () =>
            sendColdEmail(
                baseCampaign(ORG_ID, {
                    targetEmail: 'outro-endereco@empresa-cliente.com.br',
                    contactPhone: '(11) 98888-7777',
                }),
            ),
        );

        expect(result).toBe(false);
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('opt-out restrito a scope "voice"/"whatsapp" NÃO bloqueia e-mail (regressão contra super-bloqueio)', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        await asOrg(ORG_ID, async () => {
            await recordOptOut(prismaOptOutRepository, {
                organizationId: ORG_ID,
                scope: 'voice',
                subject: { email: 'nao-restrito-a-email@empresa-cliente.com.br' },
                originChannel: 'voice',
                reason: 'Não quer mais ligação, mas aceita e-mail',
            });
            await recordOptOut(prismaOptOutRepository, {
                organizationId: ORG_ID,
                scope: 'whatsapp',
                subject: { email: 'nao-restrito-a-email@empresa-cliente.com.br' },
                originChannel: 'whatsapp',
                reason: 'Não quer mais WhatsApp, mas aceita e-mail',
            });
        });

        const result = await asOrg(ORG_ID, () =>
            sendColdEmail(baseCampaign(ORG_ID, { targetEmail: 'nao-restrito-a-email@empresa-cliente.com.br' })),
        );

        expect(result).toBe(true);
        expect(sendEmailMock).toHaveBeenCalledTimes(1);
    });

    it('sem opt-out algum: envia normalmente', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        const result = await asOrg(ORG_ID, () =>
            sendColdEmail(baseCampaign(ORG_ID, { targetEmail: 'sem-optout@empresa-cliente.com.br' })),
        );

        expect(result).toBe(true);
        expect(sendEmailMock).toHaveBeenCalledTimes(1);
    });
});
