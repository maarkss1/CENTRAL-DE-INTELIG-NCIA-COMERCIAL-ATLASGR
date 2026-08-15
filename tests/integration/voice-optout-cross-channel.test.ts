import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { isSuppressed, recordOptOut as recordVoiceOptOut } from '../../src/features/integrations/birth-voice/callSuppression.service';
import { prismaOptOutRepository } from '../../src/features/cadence/infra/PrismaOptOutRepository';
import { isOptedOut, recordOptOut as recordUnifiedOptOut } from '../../src/features/cadence/application/optOutService';

/**
 * Fecha, contra Postgres real, a parte do Agente 12 no handoff bloqueador
 * `.agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md`: prova que `isSuppressed`
 * (o gate real por onde `callLead`/`make3CXCall` passam antes de discar, ver
 * `birthVoice.service.ts`/`threecx.service.ts`) agora também respeita um opt-out registrado por
 * OUTRO canal (e-mail/WhatsApp), não só `CallSuppression`. Chama `isOptedOut`/`recordOptOut` de
 * verdade (nunca mockado) — mesma exigência do "Teste esperado" do handoff.
 *
 * Organizações com id próprio por execução, mesmo motivo documentado em
 * `tests/integration/threecx-persistence.test.ts`: vários agentes rodam `test:integration` em
 * paralelo contra o mesmo Postgres de teste.
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORG_A = `test-voice-optout-org-a-${RUN_ID}`;

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> =>
    requestContext.run({ tenantId: organizationId }, fn);

beforeAll(async () => withRlsBypass(async () => {
    await prisma.organization.createMany({
        data: [{ id: ORG_A, name: 'Test Org A (voice opt-out cross-channel)' }],
        skipDuplicates: true,
    });
}));

afterEach(async () => withRlsBypass(async () => {
    await prisma.optOutRecord.deleteMany({ where: { organizationId: ORG_A } });
    await prisma.callSuppression.deleteMany({ where: { organizationId: ORG_A } });
}));

afterAll(async () => withRlsBypass(async () => {
    await prisma.optOutRecord.deleteMany({ where: { organizationId: ORG_A } });
    await prisma.callSuppression.deleteMany({ where: { organizationId: ORG_A } });
    await prisma.organization.deleteMany({ where: { id: ORG_A } });
}));

describe('isSuppressed (voz) respeita opt-out registrado por outro canal — contra Postgres real', () => {
    it('E-mail → Voz: opt-out global registrado por e-mail bloqueia a ligação', async () => {
        const blocked = await asOrg(ORG_A, async () => {
            // Simula o canal 05 (e-mail) registrando um opt-out genérico, via a mesma porta
            // unificada que ele vai consumir (contrato do 17).
            await recordUnifiedOptOut(prismaOptOutRepository, {
                organizationId: ORG_A,
                scope: 'global',
                subject: { email: 'lead-email@example.com', phoneE164: '+5511911112222' },
                originChannel: 'email',
                reason: 'Pediu para não ser mais contatado, em resposta ao e-mail de prospecção.',
                evidence: '"Por favor, parem de me mandar mensagens"',
            });

            return isSuppressed(ORG_A, '+5511911112222', { email: 'lead-email@example.com' });
        });

        expect(blocked).toBe(true);
    });

    it('WhatsApp → Voz: opt-out global registrado por WhatsApp bloqueia a ligação', async () => {
        const blocked = await asOrg(ORG_A, async () => {
            // Simula o canal 06 (WhatsApp) registrando um opt-out genérico.
            await recordUnifiedOptOut(prismaOptOutRepository, {
                organizationId: ORG_A,
                scope: 'global',
                subject: { phoneE164: '+5511933334444' },
                originChannel: 'whatsapp',
                reason: 'Respondeu SAIR no WhatsApp.',
            });

            return isSuppressed(ORG_A, '+5511933334444');
        });

        expect(blocked).toBe(true);
    });

    // Regressão: um opt-out restrito a um canal que NÃO é voz não pode super-bloquear a ligação —
    // "não me mande e-mail, mas pode ligar" continua discável.
    it('opt-out restrito a e-mail (scope: "email") não bloqueia a ligação', async () => {
        const blocked = await asOrg(ORG_A, async () => {
            await recordUnifiedOptOut(prismaOptOutRepository, {
                organizationId: ORG_A,
                scope: 'email',
                subject: { email: 'so-email@example.com', phoneE164: '+5511955556666' },
                originChannel: 'email',
                reason: 'Pediu para não receber mais e-mails, mas aceita ligação.',
            });

            return isSuppressed(ORG_A, '+5511955556666', { email: 'so-email@example.com' });
        });

        expect(blocked).toBe(false);
    });

    // Mesma regressão para WhatsApp.
    it('opt-out restrito a WhatsApp (scope: "whatsapp") não bloqueia a ligação', async () => {
        const blocked = await asOrg(ORG_A, async () => {
            await recordUnifiedOptOut(prismaOptOutRepository, {
                organizationId: ORG_A,
                scope: 'whatsapp',
                subject: { phoneE164: '+5511977778888' },
                originChannel: 'whatsapp',
                reason: 'Pediu para não receber mais WhatsApp, mas aceita ligação.',
            });

            return isSuppressed(ORG_A, '+5511977778888');
        });

        expect(blocked).toBe(false);
    });

    it('CallSuppression sozinho (sem OptOutRecord) continua bloqueando — a convivência não regrediu o comportamento antigo', async () => {
        const blocked = await asOrg(ORG_A, async () => {
            await recordVoiceOptOut({
                organizationId: ORG_A,
                phone: '+5511999990000',
                source: 'manual',
                reason: 'Bloqueio manual, testado direto contra CallSuppression.',
            });

            return isSuppressed(ORG_A, '+5511999990000');
        });

        expect(blocked).toBe(true);
    });

    // Ponto 2 do handoff: um novo bloqueio de voz grava nos DOIS lugares — CallSuppression
    // (histórico, inalterado) e OptOutRecord (scope 'voice', para o registro ficar visível ao lado
    // dos opt-outs de e-mail/WhatsApp). Escopo 'voice' é o correto por padrão para um pedido feito
    // durante a própria ligação ("não me ligue mais") — não bloqueia os outros canais por si só.
    it('recordOptOut de voz grava em CallSuppression E em OptOutRecord (scope voice), sem sobre-bloquear e-mail', async () => {
        await asOrg(ORG_A, () =>
            recordVoiceOptOut({
                organizationId: ORG_A,
                phone: '+5511922221111',
                source: 'call-opt-out',
                reason: 'Pedido na ligação (transcript): "não me ligue mais"',
                evidence: 'não me ligue mais',
            }),
        );

        const [suppressionRow, optOutRow, blocksVoiceDirect, blocksEmail] = await asOrg(ORG_A, () =>
            Promise.all([
                prisma.callSuppression.findUnique({
                    where: { organizationId_phoneE164: { organizationId: ORG_A, phoneE164: '+5511922221111' } },
                }),
                prisma.optOutRecord.findFirst({
                    where: { organizationId: ORG_A, phoneE164: '+5511922221111' },
                }),
                isOptedOut(prismaOptOutRepository, ORG_A, { phoneE164: '+5511922221111' }, 'voice'),
                isOptedOut(prismaOptOutRepository, ORG_A, { phoneE164: '+5511922221111' }, 'email'),
            ]),
        );

        expect(suppressionRow).not.toBeNull();
        expect(optOutRow).toMatchObject({ scope: 'Voice', originChannel: 'voice', leadId: null });
        expect(blocksVoiceDirect).toBe(true);
        expect(blocksEmail).toBe(false);
    });
});
