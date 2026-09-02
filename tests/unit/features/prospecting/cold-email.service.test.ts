import { describe, it, expect, vi, beforeEach } from 'vitest';

// sendColdEmail antes desta correção: (1) nunca enviava nada de verdade — só logava e retornava
// `true` incondicionalmente, uma falsa promessa de entrega; (2) logava o endereço de e-mail
// completo do titular em texto puro (PII em log). Agora envia de verdade via o mesmo mailer real
// usado em aiPendingAction.service.ts/auth.ts (src/lib/email/mailer.ts) e só loga o domínio.

const sendEmailMock = vi.fn();
const { FakeMailerNotConfiguredError } = vi.hoisted(() => ({
    FakeMailerNotConfiguredError: class FakeMailerNotConfiguredError extends Error {},
}));
vi.mock('../../../../src/lib/email/mailer.js', () => ({
    sendEmail: (...args: unknown[]) => sendEmailMock(...args),
    MailerNotConfiguredError: FakeMailerNotConfiguredError,
}));

const loggerInfo = vi.fn();
const loggerWarn = vi.fn();
const loggerError = vi.fn();
vi.mock('../../../../src/lib/logger', () => ({
    logger: { info: (...a: unknown[]) => loggerInfo(...a), warn: (...a: unknown[]) => loggerWarn(...a), error: (...a: unknown[]) => loggerError(...a) },
}));

// Isolamento de unidade: a checagem real de opt-out (contra Postgres via `PrismaOptOutRepository`)
// é coberta em `tests/integration/cold-email-optout.test.ts`, chamando `isOptedOut` de verdade.
// Aqui só verificamos que `cold-email.service.ts` CHAMA `isOptedOut` com o sujeito correto e
// respeita o resultado — sem depender de banco.
const isOptedOutMock = vi.fn();
vi.mock('../../../../src/features/cadence/application/optOutService.js', () => ({
    isOptedOut: (...args: unknown[]) => isOptedOutMock(...args),
}));
vi.mock('../../../../src/features/cadence/infra/PrismaOptOutRepository.js', () => ({
    prismaOptOutRepository: {},
}));

// resolveEmailStatus (achado de auditoria: gate de entregabilidade antes do envio, ver
// src/features/prospecting/services/__tests__/cold-email.service.test.ts para os testes
// dedicados a esse comportamento) faz uma verificação de MX real — mockado aqui só pra manter
// estes testes de comportamento pré-existente isolados de rede/DNS, sempre "verified" por padrão.
const resolveEmailStatusMock = vi.fn();
vi.mock('../../../../src/features/prospecting/services/enrichment/domainGuess.js', () => ({
    resolveEmailStatus: (...args: unknown[]) => resolveEmailStatusMock(...args),
}));

const { sendColdEmail } = await import('../../../../src/features/prospecting/services/cold-email.service');

const validCampaign = {
    id: '1',
    targetEmail: 'titular@empresa-cliente.com.br',
    subject: 'Test',
    body: 'Hello',
    status: 'draft' as const,
    legalBasis: 'legitimate_interest' as const,
    dataSource: 'apollo',
    organizationId: 'org-1',
};

beforeEach(() => {
    vi.clearAllMocks();
    isOptedOutMock.mockResolvedValue(false);
    resolveEmailStatusMock.mockResolvedValue('verified');
});

describe('Cold Email Service', () => {
    it('falha se faltarem campos obrigatórios, sem tentar enviar', async () => {
        const result = await sendColdEmail({} as any);
        expect(result).toBe(false);
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('falha se faltarem os campos de conformidade LGPD, sem tentar enviar', async () => {
        const result = await sendColdEmail({
            id: '1',
            targetEmail: 'test@example.com',
            subject: 'Test',
            body: 'Hello',
            status: 'draft',
            legalBasis: '',
            dataSource: ''
        } as any);
        expect(result).toBe(false);
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('envia de verdade via SMTP e só retorna true quando o envio realmente aconteceu', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        const result = await sendColdEmail(validCampaign);

        expect(result).toBe(true);
        expect(sendEmailMock).toHaveBeenCalledWith({
            to: validCampaign.targetEmail,
            subject: validCampaign.subject,
            text: validCampaign.body,
        });
    });

    it('sem SMTP configurado: retorna false honesto (não finge sucesso) e não lança', async () => {
        sendEmailMock.mockRejectedValue(new FakeMailerNotConfiguredError('sem SMTP_HOST'));

        const result = await sendColdEmail(validCampaign);

        expect(result).toBe(false);
    });

    it('falha real de envio: retorna false', async () => {
        sendEmailMock.mockRejectedValue(new Error('timeout de conexão SMTP'));

        const result = await sendColdEmail(validCampaign);

        expect(result).toBe(false);
    });

    it('nunca loga o endereço de e-mail completo do titular (PII) — só o domínio', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        await sendColdEmail(validCampaign);

        const allLogCalls = [...loggerInfo.mock.calls, ...loggerWarn.mock.calls, ...loggerError.mock.calls];
        const serialized = JSON.stringify(allLogCalls);

        expect(serialized).not.toContain(validCampaign.targetEmail);
        expect(serialized).toContain('empresa-cliente.com.br');
    });

    it('falha se organizationId não vier no campaign, sem tentar enviar (não dá pra checar opt-out sem tenant)', async () => {
        const { organizationId, ...withoutOrg } = validCampaign;
        const result = await sendColdEmail(withoutOrg as any);

        expect(result).toBe(false);
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('consulta isOptedOut com organizationId, email e leadId/phoneE164 do campaign antes de enviar', async () => {
        sendEmailMock.mockResolvedValue(undefined);

        await sendColdEmail({
            ...validCampaign,
            leadId: 'lead-42',
            contactPhone: '(11) 98888-7777',
        });

        expect(isOptedOutMock).toHaveBeenCalledWith(
            expect.anything(),
            validCampaign.organizationId,
            { leadId: 'lead-42', email: validCampaign.targetEmail, phoneE164: '+5511988887777' },
            'email',
        );
    });

    it('opt-out bloqueia o envio: retorna false, nunca chama o transporte SMTP, nunca registra como enviado', async () => {
        isOptedOutMock.mockResolvedValue(true);

        const result = await sendColdEmail(validCampaign);

        expect(result).toBe(false);
        expect(sendEmailMock).not.toHaveBeenCalled();
        const allLogCalls = [...loggerInfo.mock.calls, ...loggerWarn.mock.calls, ...loggerError.mock.calls];
        expect(JSON.stringify(allLogCalls)).toContain('opt-out');
    });
});
