import { afterEach, describe, expect, it, vi } from 'vitest';

// AI-007 (Sprint 07/onda-20): qualifyLead() é o fluxo PADRÃO de qualificação de todo lead
// (createLeadsWorker) — antes desta correção era o caminho de maior volume que enviava nome real
// do contato/decisor a um provedor de IA externo sem nenhuma checagem de base legal/consentimento
// LGPD, ao contrário de SDR Outbound/SDR Autônomo/Ops Agent. Este teste trava a regressão.

const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: undefined };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

vi.mock('../../../../lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

let currentTenantId: string | undefined;
vi.mock('../../../../lib/async-context.js', () => ({
    getTenantId: () => currentTenantId,
}));

const graphInvoke = vi.fn();
vi.mock('../../graphs/leadQualification.js', () => ({
    compileLeadGraph: () => ({ invoke: (...args: unknown[]) => graphInvoke(...args) }),
}));

const { aiService } = await import('../ai.service');

afterEach(() => {
    vi.clearAllMocks();
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
    currentTenantId = undefined;
});

describe('AIService.qualifyLead — trava de consentimento LGPD (AI-007/onda-20)', () => {
    it('sem base legal registrada: bloqueia, nunca invoca o grafo (nunca envia PII ao provedor)', async () => {
        currentTenantId = 'org-sem-consentimento';

        const result = await aiService.qualifyLead('lead-1', 'Empresa X');

        expect(result.status).toBe('BLOCKED_NO_CONSENT');
        expect(result.qualificationScore).toBeUndefined();
        expect(graphInvoke).not.toHaveBeenCalled();
    });

    it('com base legal registrada: invoca o grafo normalmente e devolve o resultado real', async () => {
        currentTenantId = 'org-1';
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'org-1';
        graphInvoke.mockResolvedValue({ leadId: 'lead-1', qualificationScore: 82, summary: 'bom fit', status: 'QUALIFIED' });

        const result = await aiService.qualifyLead('lead-1', 'Empresa X');

        expect(result.status).toBe('QUALIFIED');
        expect(result.qualificationScore).toBe(82);
        expect(graphInvoke).toHaveBeenCalledWith({ leadId: 'lead-1', companyInfo: 'Empresa X' });
    });

    it('sem tenant no contexto (getTenantId indefinido): bloqueia (fail-closed)', async () => {
        currentTenantId = undefined;

        const result = await aiService.qualifyLead('lead-1', 'Empresa X');

        expect(result.status).toBe('BLOCKED_NO_CONSENT');
        expect(graphInvoke).not.toHaveBeenCalled();
    });
});
