import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeStructuredMock = vi.fn();
vi.mock('../../shared.js', () => ({
  SYSTEM_RULES: 'REGRAS DO SISTEMA',
  invokeStructured: (...args: unknown[]) => invokeStructuredMock(...args),
  jsonOnlyInstruction: (schema: string) => `RETORNE JSON: ${schema}`,
}));

import { generateMessage } from '../message.js';
import { messageResultSchema } from '../../schema.js';

const request = {
  kind: 'message' as const,
  brand: { name: 'AtlasGR', description: 'Revenue OS de logística' },
  inputs: {
    companyName: 'Log Express',
    contactName: 'Ana',
    sector: 'Logística',
    role: 'Gerente',
    technologies: [],
    companySize: '10-50',
    tone: 'hyper_personalized' as const,
  },
};

describe('studio/generators/message', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama invokeStructured com o schema/contexto/temperatura corretos', async () => {
    const fakeResult = {
      body: 'Oi!',
      followUpSuggestion: 'Insistir em 3 dias',
      icpAnalysis: 'Análise',
    };
    invokeStructuredMock.mockResolvedValueOnce(fakeResult);

    const result = await generateMessage(request);

    expect(result).toBe(fakeResult);
    const [prompt, context, schema, , temperature] = invokeStructuredMock.mock.calls[0];
    expect(context).toBe('studio:message');
    expect(schema).toBe(messageResultSchema);
    expect(temperature).toBe(0.6);
    expect(prompt).toContain('Log Express');
  });
});
