import { afterEach, describe, expect, it, vi } from 'vitest';

// SDRQualificationAgent.run() busca o Contact real do lead (via get_lead_context) e o envia,
// minimizado mas pseudonimizado, a um provedor de IA externo — por isso precisa checar base legal
// ANTES de qualquer chamada de rede/banco. Este teste prova que a trava barra a execução sem tocar
// em Prisma/LangGraph: se o gate estivesse ausente ou mal posicionado, os mocks abaixo (que nunca
// resolvem prisma.lead.findMany etc.) fariam o teste travar ou falhar por chamada inesperada.
const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: undefined };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

vi.mock('../../../../lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { requestContext } = await import('../../../../lib/async-context');
const { SDRQualificationAgent } = await import('../sdr.agent');
const { PiiConsentRequiredError } = await import('../../services/guardrails.service');

afterEach(() => {
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
});

describe('SDRQualificationAgent.run — trava de consentimento LGPD', () => {
    it('bloqueia a qualificação sem base legal registrada para a organização, sem tocar em Prisma/LLM', async () => {
        const agent = new SDRQualificationAgent();

        const result = await requestContext.run({ tenantId: 'org-sem-consentimento' }, () => agent.run('lead-1'));

        expect(result.success).toBe(false);
        expect(result.error).toContain('org-sem-consentimento');
        expect(new PiiConsentRequiredError('org-sem-consentimento').message).toBe(result.error);
    });

    it('sem organizationId no contexto (fora de requisição autenticada), também bloqueia', async () => {
        const agent = new SDRQualificationAgent();

        const result = await agent.run('lead-1');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });
});
