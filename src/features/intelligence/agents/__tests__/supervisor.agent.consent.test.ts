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

// mem0.ts faz `await import('mem0ai')` de propósito (lazy, mem0ai não é dependência real do
// projeto — ver comentário em mem0.ts) e trata a ausência do pacote em runtime real via
// try/catch. Vite/Vitest, porém, tentam resolver o import dinâmico em tempo de transform mesmo
// assim, o que quebra a suíte antes do try/catch entrar em ação — mockado para não depender do
// pacote estar instalado neste ambiente de teste. Achado reincidente (já corrigido durante o
// merge da PR #328, reapareceu depois por outro commit de main reformatando este arquivo).
vi.mock('../../../../lib/ai/memory/mem0.js', () => ({
  agentMemory: {
    search: vi.fn().mockResolvedValue([]),
    formatForPrompt: vi.fn().mockReturnValue(''),
    add: vi.fn().mockResolvedValue(undefined),
  },
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
