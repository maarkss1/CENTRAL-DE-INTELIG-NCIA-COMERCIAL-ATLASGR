import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeStructuredMock = vi.fn();
vi.mock('../../shared.js', () => ({
  SYSTEM_RULES: 'REGRAS DO SISTEMA',
  invokeStructured: (...args: unknown[]) => invokeStructuredMock(...args),
  jsonOnlyInstruction: (schema: string) => `RETORNE JSON: ${schema}`,
}));

import { generateB2bMatrix } from '../b2bMatrix.js';
import { b2bResultSchema } from '../../schema.js';

const request = {
  kind: 'b2b_matrix' as const,
  brand: { name: 'AtlasGR', description: 'Revenue OS de logística' },
  inputs: { icp: 'Transportadoras de médio porte', solution: 'Gestão de risco de carga' },
};

describe('studio/generators/b2bMatrix', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama invokeStructured com o schema/contexto/temperatura corretos', async () => {
    const fakeResult = {
      pains: ['dor 1', 'dor 2', 'dor 3'],
      questions: ['q1', 'q2', 'q3'],
      objections: [
        { objection: 'preço', rebuttal: 'roi' },
        { objection: 'tempo', rebuttal: 'onboarding rápido' },
        { objection: 'já temos', rebuttal: 'comparação' },
      ],
    };
    invokeStructuredMock.mockResolvedValueOnce(fakeResult);

    const result = await generateB2bMatrix(request);

    expect(result).toBe(fakeResult);
    const [prompt, context, schema, , temperature] = invokeStructuredMock.mock.calls[0];
    expect(context).toBe('studio:b2b-matrix');
    expect(schema).toBe(b2bResultSchema);
    expect(temperature).toBe(0.5);
    expect(prompt).toContain('Transportadoras de médio porte');
  });
});
