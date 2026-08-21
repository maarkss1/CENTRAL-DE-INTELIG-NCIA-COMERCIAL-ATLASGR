import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * AI-007 (parte 2, onda 33): até esta correção, BDR/Closer/CRM (os 3 agentes que estendem
 * `BaseAgent`) enviavam o texto livre da missão — digitado por um operador humano no
 * `SwarmDashboard.tsx` ou construído a partir de dados do Lead pelo scheduler 24/7
 * (`swarmScheduler.service.ts`) — a Groq/OpenAI sem NENHUMA checagem de base legal, ao contrário
 * de SDR/Ops/`AIService.qualifyLead` (já corrigidos, ver `docs/AI-SWARM-GOVERNANCE-AUDIT.md`).
 * Diferente do Ops Agent (que só aplica a trava quando um `leadId` real está em jogo, já que sem
 * ele nunca busca um Contact real), BDR/Closer/CRM não têm nenhum sinal estrutural equivalente —
 * o texto livre pode conter PII de um titular real ou não, sem forma confiável de saber — por isso
 * o gate aqui é incondicional (fail-closed), igual ao resto do enxame quando uma organização não
 * está na allowlist.
 *
 * BDR representa o caminho `runWithTools` (compartilhado com Closer); CRM representa o caminho
 * `run` (StateGraph de turno único, herdado sem override por CRMAgent).
 */
const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: undefined };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

vi.mock('../../../../lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { requestContext } = await import('../../../../lib/async-context');
const { BDRAgent } = await import('../bdr.agent');
const { CRMAgent } = await import('../crm.agent');
const { PiiConsentRequiredError } = await import('../../services/guardrails.service');

afterEach(() => {
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
    vi.restoreAllMocks();
});

describe('BaseAgent — trava de consentimento LGPD (BDR/Closer/CRM)', () => {
    it('BDRAgent.run (caminho runWithTools) bloqueia sem base legal registrada, sem montar nenhum modelo de IA', async () => {
        const fallbackUtil = await import('../fallback.util.js');
        const buildSpy = vi.spyOn(fallbackUtil, 'buildModelWithFallback');
        const agent = new BDRAgent();

        const result = await requestContext.run(
            { tenantId: 'org-sem-consentimento' },
            () => agent.run('Dados do lead/empresa para prospecção outbound.'),
        );

        expect(result.error).toContain('org-sem-consentimento');
        expect(new PiiConsentRequiredError('org-sem-consentimento').message).toBe(result.error);
        expect(buildSpy).not.toHaveBeenCalled();
    }, 15_000);

    it('CRMAgent.run (caminho run/StateGraph) bloqueia sem base legal registrada, sem montar nenhum modelo de IA', async () => {
        const gateway = await import('../../../../lib/ai/gateway.js');
        const getModelSpy = vi.spyOn(gateway, 'getAiModel');
        const agent = new CRMAgent();

        const result = await requestContext.run(
            { tenantId: 'org-sem-consentimento' },
            () => agent.run('Estado atual do deal para diagnóstico.'),
        );

        expect(result.error).toContain('org-sem-consentimento');
        expect(getModelSpy).not.toHaveBeenCalled();
    }, 15_000);

    it('sem organizationId no contexto (fora de requisição autenticada), também bloqueia', async () => {
        const agent = new BDRAgent();

        const result = await agent.run('Dados do lead/empresa para prospecção outbound.');

        expect(result.error).toBeDefined();
    });

    it('a trava grava a falha em AgentMemory (status Failed), para o mesmo padrão de auditoria já usado por SDR/Ops', async () => {
        const agentMemoryStore = await import('../agentMemory.store.js');
        const recordSpy = vi.spyOn(agentMemoryStore, 'recordAgentFailure').mockResolvedValue(undefined);
        const agent = new CRMAgent();

        await requestContext.run(
            { tenantId: 'org-sem-consentimento' },
            () => agent.run('Estado atual do deal para diagnóstico.', 'session-consent-audit'),
        );

        expect(recordSpy).toHaveBeenCalledWith({
            sessionId: 'session-consent-audit',
            agentType: 'CRM',
            organizationId: 'org-sem-consentimento',
            errorMessage: expect.stringContaining('org-sem-consentimento'),
        });
    }, 15_000);
});
