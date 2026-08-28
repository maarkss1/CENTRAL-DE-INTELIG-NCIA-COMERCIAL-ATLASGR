import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeStructuredMock = vi.fn();
vi.mock('../../shared.js', () => ({
  SYSTEM_RULES: 'REGRAS DO SISTEMA',
  invokeStructured: (...args: unknown[]) => invokeStructuredMock(...args),
  jsonOnlyInstruction: (schema: string) => `RETORNE JSON: ${schema}`,
}));

import { generateMethodology } from '../methodology.js';
import { methodologyResultSchema } from '../../schema.js';

function buildRequest(framework: 'spin' | 'meddpicc' | 'aida' | 'snap' | 'challenger') {
  return {
    kind: 'methodology' as const,
    brand: { name: 'AtlasGR', description: 'Revenue OS de logística' },
    inputs: {
      framework,
      targetPersona: 'CFO',
      companySegment: 'Transporte',
      icpSize: '50-200 funcionários',
      techStack: 'SAP',
      solutionName: 'AtlasGR',
      mainPainPoint: 'Falta de visibilidade de risco de carga',
      mainBenefit: 'Redução de sinistros',
    },
  };
}

describe('studio/generators/methodology', () => {
  beforeEach(() => vi.clearAllMocks());

  it('usa o contexto e o formato JSON corretos para o framework SPIN', async () => {
    invokeStructuredMock.mockResolvedValueOnce({ type: 'spin' });

    await generateMethodology(buildRequest('spin'));

    const [prompt, context, schema, schemaDescription, temperature] =
      invokeStructuredMock.mock.calls[0];
    expect(context).toBe('studio:methodology:spin');
    expect(schema).toBe(methodologyResultSchema);
    expect(temperature).toBe(0.45);
    expect(schemaDescription).toContain('"type":"spin"');
    expect(prompt).toContain('SPIN');
  });

  it('usa o contexto e o formato JSON corretos para o framework MEDDPICC — cada framework tem um schema de saída totalmente diferente', async () => {
    invokeStructuredMock.mockResolvedValueOnce({ type: 'meddpicc' });

    await generateMethodology(buildRequest('meddpicc'));

    const [prompt, context, , schemaDescription] = invokeStructuredMock.mock.calls[0];
    expect(context).toBe('studio:methodology:meddpicc');
    expect(schemaDescription).toContain('"type":"meddpicc"');
    expect(schemaDescription).not.toContain('"type":"spin"');
    expect(prompt).toContain('MEDDPICC');
  });

  it('devolve exatamente o que invokeStructured retornar (o generator não reformata o resultado)', async () => {
    const fakeResult = {
      type: 'aida',
      meta: { persona: 'CFO', icpSize: '50-200', fitAssessment: 'ok' },
    };
    invokeStructuredMock.mockResolvedValueOnce(fakeResult);

    const result = await generateMethodology(buildRequest('aida'));

    expect(result).toBe(fakeResult);
  });
});
