import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeTextMock = vi.fn();
vi.mock('../../shared.js', () => ({
  SYSTEM_RULES: 'REGRAS DO SISTEMA',
  invokeText: (...args: unknown[]) => invokeTextMock(...args),
  stripCodeFence: (value: string) =>
    value
      .replace(/^```[a-z0-9_+-]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim(),
}));

import { generateAutomation } from '../automation.js';

const request = {
  kind: 'automation' as const,
  brand: { name: 'AtlasGR', description: 'Revenue OS de logística' },
  inputs: {
    triggerId: 'new_lead',
    trigger: 'Novo lead criado',
    actionId: 'send_to_bitrix',
    action: 'Enviar para Bitrix',
    toolId: 'bitrix',
    tool: 'Bitrix24',
    aiLayerId: 'qualify',
    aiLayer: 'Qualificação por IA',
    goal: 'Qualificar e enviar leads automaticamente para o Bitrix assim que criados',
  },
};

describe('studio/generators/automation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('faz as duas chamadas (blueprint + código) e monta o manifesto n8nJson a partir dos inputs', async () => {
    invokeTextMock
      .mockResolvedValueOnce('Blueprint em markdown')
      .mockResolvedValueOnce('```python\nprint("automacao")\n```');

    const result = await generateAutomation(request);

    expect(result.blueprint).toBe('Blueprint em markdown');
    expect(result.codeScript).toBe('print("automacao")'); // cerca de código removida

    expect(invokeTextMock).toHaveBeenCalledTimes(2);
    const [, blueprintContext, blueprintTemp] = invokeTextMock.mock.calls[0];
    expect(blueprintContext).toBe('studio:automation-blueprint');
    expect(blueprintTemp).toBe(0.25);
    const [codePrompt, codeContext, codeTemp] = invokeTextMock.mock.calls[1];
    expect(codeContext).toBe('studio:automation-code');
    expect(codeTemp).toBe(0.2);
    expect(codePrompt).toContain('Python 3.11');

    const manifest = JSON.parse(result.n8nJson);
    expect(manifest.status).toBe('draft');
    expect(manifest.requires_review_before_activation).toBe(true);
    expect(manifest.trigger).toEqual({ id: 'new_lead', label: 'Novo lead criado' });
    expect(manifest.action).toEqual({ id: 'send_to_bitrix', label: 'Enviar para Bitrix' });
    expect(manifest.orchestration_target).toBe('bitrix');
    expect(manifest.processing.ai_layer).toBe('qualify');
    // Nome do manifesto é derivado do goal, truncado a 80 caracteres — não deve estourar isso.
    expect(manifest.name.length).toBeLessThanOrEqual('Automação: '.length + 80);
  });

  it('nunca marca a automação como pronta para ativar sem revisão humana (safety rail do gerador, não só do prompt)', async () => {
    invokeTextMock.mockResolvedValueOnce('blueprint').mockResolvedValueOnce('codigo');

    const result = await generateAutomation(request);

    const manifest = JSON.parse(result.n8nJson);
    expect(manifest.requires_review_before_activation).toBe(true);
    expect(manifest.status).toBe('draft');
  });
});
