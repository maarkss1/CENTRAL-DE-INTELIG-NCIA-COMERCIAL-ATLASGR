import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeStructuredMock = vi.fn();
vi.mock('../../shared.js', () => ({
  SYSTEM_RULES: 'REGRAS DO SISTEMA',
  invokeStructured: (...args: unknown[]) => invokeStructuredMock(...args),
  jsonOnlyInstruction: (schema: string) => `RETORNE JSON: ${schema}`,
}));

import { generateCallScript } from '../callScript.js';
import { callScriptResultSchema } from '../../schema.js';

const request = {
  kind: 'call_script' as const,
  brand: { name: 'Total Trac', description: 'Fleet OS de telemetria' },
  inputs: {
    companyName: 'Frota Rápida',
    contactName: 'João',
    sector: 'Transporte',
    role: 'CFO',
    technologies: [],
    companySize: '10-50',
    tone: 'direct' as const,
  },
};

describe('studio/generators/callScript', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama invokeStructured com o schema/contexto/temperatura corretos', async () => {
    const fakeResult = {
      opening: 'Abertura',
      discoveryQuestions: ['a', 'b', 'c'],
      objectionTips: [
        { objection: 'x', response: 'y' },
        { objection: 'x2', response: 'y2' },
      ],
      closing: 'Fechamento',
      icpAnalysis: 'Análise',
    };
    invokeStructuredMock.mockResolvedValueOnce(fakeResult);

    const result = await generateCallScript(request);

    expect(result).toBe(fakeResult);
    const [prompt, context, schema, , temperature] = invokeStructuredMock.mock.calls[0];
    expect(context).toBe('studio:call-script');
    expect(schema).toBe(callScriptResultSchema);
    expect(temperature).toBe(0.55);
    expect(prompt).toContain('Total Trac');
    expect(prompt).toContain(JSON.stringify(request.inputs, null, 2));
  });
});
