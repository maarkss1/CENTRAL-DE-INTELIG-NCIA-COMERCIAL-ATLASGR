import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeStructuredMock = vi.fn();
vi.mock('../../shared.js', () => ({
  SYSTEM_RULES: 'REGRAS DO SISTEMA',
  invokeStructured: (...args: unknown[]) => invokeStructuredMock(...args),
  jsonOnlyInstruction: (schema: string) => `RETORNE JSON: ${schema}`,
}));

import { generateEmail } from '../email.js';
import { emailResultSchema } from '../../schema.js';

const request = {
  kind: 'email' as const,
  brand: { name: 'AtlasGR', description: 'Revenue OS de logística' },
  inputs: {
    companyName: 'Transportes Silva',
    contactName: 'Maria',
    sector: 'Logística',
    role: 'Diretora de Operações',
    technologies: ['SAP'],
    companySize: '50-200',
    tone: 'consultative' as const,
  },
};

describe('studio/generators/email', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama invokeStructured com o schema/contexto/temperatura corretos e devolve o resultado como veio', async () => {
    const fakeResult = { subject: 'Assunto', body: 'Corpo', icpAnalysis: 'Análise' };
    invokeStructuredMock.mockResolvedValueOnce(fakeResult);

    const result = await generateEmail(request);

    expect(result).toBe(fakeResult);
    const [prompt, context, schema, , temperature] = invokeStructuredMock.mock.calls[0];
    expect(context).toBe('studio:email');
    expect(schema).toBe(emailResultSchema);
    expect(temperature).toBe(0.55);
    expect(prompt).toContain('AtlasGR');
    expect(prompt).toContain('Transportes Silva');
  });

  it('inclui os dados do lead (JSON) no prompt — sem isso o modelo geraria um e-mail genérico', async () => {
    invokeStructuredMock.mockResolvedValueOnce({ subject: 's', body: 'b', icpAnalysis: 'a' });

    await generateEmail(request);

    const prompt = invokeStructuredMock.mock.calls[0][0];
    expect(prompt).toContain(JSON.stringify(request.inputs, null, 2));
  });
});
