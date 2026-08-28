import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * AI-007 (parte 3): até esta correção, o próprio Supervisor do enxame (não os especialistas que ele
 * roteia) enviava `mission` — texto livre que chega cru do corpo de POST /swarm/mission, digitado
 * por um operador humano, e pode conter PII de um titular real — direto a um provedor de IA externo
 * via `supervisorNode`/`finishNode` (getSupervisorLlm/getAiModel), sem NENHUMA checagem de base
 * legal LGPD. Os especialistas individuais (sdrNode/bdrNode/...) já tinham a própria checagem (via
 * BaseAgent ou verificação inline), mas o roteamento do Supervisor em si ficava de fora.
 *
 * Estes testes prova que `executeMission`/`executeMissionStream` bloqueiam ANTES de sequer preparar
 * o checkpointer Postgres ou invocar o grafo — nenhuma chamada de rede/banco acontece quando a
 * organização não tem base legal registrada.
 */
const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: undefined };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { requestContext } = await import('../../../../lib/async-context');
const { SwarmOrchestrator } = await import('../supervisor.agent');
const { PiiConsentRequiredError } = await import('../../services/guardrails.service');
const checkpointerModule = await import('../../../../lib/ai/checkpointer.js');

afterEach(() => {
  mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
  vi.restoreAllMocks();
});

describe('SwarmOrchestrator — trava de consentimento LGPD', () => {
  it('executeMission rejeita sem base legal registrada, sem preparar o checkpointer', async () => {
    const ensureSpy = vi.spyOn(checkpointerModule, 'ensureCheckpointerReady');
    const orchestrator = new SwarmOrchestrator();

    await expect(
      requestContext.run({ tenantId: 'org-sem-consentimento' }, () =>
        orchestrator.executeMission('Qualifique o lead da Transportadora ABC.'),
      ),
    ).rejects.toThrow(new PiiConsentRequiredError('org-sem-consentimento').message);

    expect(ensureSpy).not.toHaveBeenCalled();
  });

  it('executeMissionStream rejeita sem base legal registrada, sem emitir nenhum evento', async () => {
    const ensureSpy = vi.spyOn(checkpointerModule, 'ensureCheckpointerReady');
    const orchestrator = new SwarmOrchestrator();
    const onChunk = vi.fn();

    await expect(
      requestContext.run({ tenantId: 'org-sem-consentimento' }, () =>
        orchestrator.executeMissionStream(
          'Qualifique o lead da Transportadora ABC.',
          'session-x',
          onChunk,
        ),
      ),
    ).rejects.toThrow(new PiiConsentRequiredError('org-sem-consentimento').message);

    expect(ensureSpy).not.toHaveBeenCalled();
    expect(onChunk).not.toHaveBeenCalled();
  });
});
