import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeStructuredMock = vi.fn();
vi.mock('../../shared.js', () => ({
  SYSTEM_RULES: 'REGRAS DO SISTEMA',
  invokeStructured: (...args: unknown[]) => invokeStructuredMock(...args),
  jsonOnlyInstruction: (schema: string) => `RETORNE JSON: ${schema}`,
}));

import { generateTraining } from '../training.js';
import { trainingResultSchema } from '../../schema.js';

const request = {
  kind: 'training' as const,
  brand: { name: 'AtlasGR', description: 'Revenue OS de logística' },
  inputs: { topic: 'Como tratar objeção de preço' },
};

describe('studio/generators/training', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama invokeStructured com o schema/contexto/temperatura corretos e inclui o tema pedido', async () => {
    const fakeResult = {
      title: 'Tratando objeção de preço',
      description: 'Descrição',
      steps: [
        { step: 1, title: 't1', detail: 'd1', tip: 'dica1' },
        { step: 2, title: 't2', detail: 'd2', tip: 'dica2' },
        { step: 3, title: 't3', detail: 'd3', tip: 'dica3' },
      ],
    };
    invokeStructuredMock.mockResolvedValueOnce(fakeResult);

    const result = await generateTraining(request);

    expect(result).toBe(fakeResult);
    const [prompt, context, schema, , temperature] = invokeStructuredMock.mock.calls[0];
    expect(context).toBe('studio:training');
    expect(schema).toBe(trainingResultSchema);
    expect(temperature).toBe(0.45);
    expect(prompt).toContain('Como tratar objeção de preço');
  });
});
