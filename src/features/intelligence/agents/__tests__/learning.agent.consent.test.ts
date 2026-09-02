import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * AI-007 (parte 3): `LearningAgent.reflectAndLearn` monta um prompt a partir de `AuditLog.details`
 * (que rotineiramente carrega PII real de um titular — nome/e-mail/telefone de lead ou contato
 * citado nos detalhes de uma ação manual do vendedor) e o envia a um provedor de IA externo
 * (getAiModel). Era o único agente do enxame sem NENHUMA checagem de base legal LGPD antes desta
 * correção. Este teste prova que a trava bloqueia antes de sequer consultar o AuditLog no Prisma.
 */
const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: undefined };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const auditLogFindMany = vi.fn();
vi.mock('../../../../lib/prisma.js', () => ({
  prisma: {
    auditLog: { findMany: auditLogFindMany },
  },
}));

const { LearningAgent } = await import('../learning.agent');
const { logger } = await import('../../../../lib/logger.js');

afterEach(() => {
  mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
  vi.clearAllMocks();
});

describe('LearningAgent.reflectAndLearn — trava de consentimento LGPD', () => {
  it('bloqueia sem base legal registrada para a organização, sem consultar o AuditLog', async () => {
    const agent = new LearningAgent();

    const result = await agent.reflectAndLearn('actor-1', 'org-sem-consentimento');

    expect(result).toBeNull();
    expect(auditLogFindMany).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'actor-1', tenantId: 'org-sem-consentimento' }),
      expect.stringContaining('sem base legal LGPD'),
    );
  });

  it('com base legal registrada (allowlist "*"), segue em frente e consulta o AuditLog', async () => {
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = '*';
    auditLogFindMany.mockResolvedValueOnce([]);
    const agent = new LearningAgent();

    const result = await agent.reflectAndLearn('actor-1', 'org-com-consentimento');

    expect(auditLogFindMany).toHaveBeenCalledTimes(1);
    // Sem ações recentes, o método retorna null sem chegar a chamar o modelo de IA — mesmo
    // comportamento de antes da correção, só a checagem de consentimento é nova.
    expect(result).toBeNull();
  });
});
