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

import { generateScript } from '../script.js';

const request = {
  kind: 'script' as const,
  brand: { name: 'AtlasGR', description: 'Revenue OS de logística' },
  inputs: {
    language: 'Python',
    purpose: 'Enriquecer CNPJ',
    framework: 'nenhum',
    complexity: 'simples',
    customContext: 'Sem dependências externas',
  },
};

describe('studio/generators/script', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama invokeText com o contexto/temperatura corretos e remove a cerca de código Markdown do resultado', async () => {
    invokeTextMock.mockResolvedValueOnce('```python\nprint("oi")\n```');

    const result = await generateScript(request);

    expect(result).toEqual({ content: 'print("oi")' });
    const [prompt, context, temperature] = invokeTextMock.mock.calls[0];
    expect(context).toBe('studio:script');
    expect(temperature).toBe(0.25);
    expect(prompt).toContain('Python');
  });

  it('não altera o resultado quando o modelo já devolve sem cerca de código (stripCodeFence é idempotente)', async () => {
    invokeTextMock.mockResolvedValueOnce('print("já sem cerca")');

    const result = await generateScript(request);

    expect(result).toEqual({ content: 'print("já sem cerca")' });
  });
});
