import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ColdEmailCampaign } from '../cold-email.service';

/**
 * Regressão de um bug P1 real: sendColdEmail nunca checava a entregabilidade do e-mail antes de
 * disparar — um e-mail sintaticamente válido mas sem domínio/MX real ainda recebia o envio,
 * gerando bounce e custo de reputação de domínio. resolveEmailStatus (mesma verificação já usada
 * em enrichment.service.ts/enrichmentCascade.service.ts) agora bloqueia o disparo quando o status
 * é 'invalid'.
 */
vi.mock('../../../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const sendEmailMock = vi.fn();
vi.mock('../../../../lib/email/mailer.js', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  MailerNotConfiguredError: class MailerNotConfiguredError extends Error {},
}));

const isOptedOutMock = vi.fn();
vi.mock('../../../cadence/application/optOutService.js', () => ({
  isOptedOut: (...args: unknown[]) => isOptedOutMock(...args),
}));

vi.mock('../../../cadence/infra/PrismaOptOutRepository.js', () => ({
  prismaOptOutRepository: {},
}));

const resolveEmailStatusMock = vi.fn();
vi.mock('../enrichment/domainGuess.js', () => ({
  resolveEmailStatus: (...args: unknown[]) => resolveEmailStatusMock(...args),
}));

const { sendColdEmail } = await import('../cold-email.service');

afterEach(() => {
  vi.clearAllMocks();
});

const baseCampaign: ColdEmailCampaign = {
  id: 'camp-1',
  targetEmail: 'contato@dominio-inexistente-xyz.example',
  subject: 'Assunto',
  body: 'Corpo',
  status: 'draft',
  legalBasis: 'legitimate_interest',
  dataSource: 'apollo',
  organizationId: 'org-1',
};

describe('sendColdEmail — gate de entregabilidade de e-mail', () => {
  it('bloqueia o envio quando resolveEmailStatus diz "invalid" (sem domínio/MX real)', async () => {
    isOptedOutMock.mockResolvedValue(false);
    resolveEmailStatusMock.mockResolvedValue('invalid');

    const result = await sendColdEmail(baseCampaign);

    expect(result).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('envia normalmente quando o e-mail é "verified"', async () => {
    isOptedOutMock.mockResolvedValue(false);
    resolveEmailStatusMock.mockResolvedValue('verified');
    sendEmailMock.mockResolvedValue(undefined);

    const result = await sendColdEmail(baseCampaign);

    expect(result).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith({
      to: baseCampaign.targetEmail,
      subject: baseCampaign.subject,
      text: baseCampaign.body,
    });
  });

  it('envia normalmente quando o status é "guessed" (só bloqueia "invalid" confirmado, não falta de certeza)', async () => {
    isOptedOutMock.mockResolvedValue(false);
    resolveEmailStatusMock.mockResolvedValue('guessed');
    sendEmailMock.mockResolvedValue(undefined);

    const result = await sendColdEmail(baseCampaign);

    expect(result).toBe(true);
    expect(sendEmailMock).toHaveBeenCalled();
  });

  it('opt-out continua com prioridade e bloqueia antes mesmo de checar o e-mail', async () => {
    isOptedOutMock.mockResolvedValue(true);

    const result = await sendColdEmail(baseCampaign);

    expect(result).toBe(false);
    expect(resolveEmailStatusMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
