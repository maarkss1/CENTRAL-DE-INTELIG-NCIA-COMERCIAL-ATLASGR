import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeStructuredMock = vi.fn();
vi.mock('../../shared.js', () => ({
  SYSTEM_RULES: 'REGRAS DO SISTEMA',
  invokeStructured: (...args: unknown[]) => invokeStructuredMock(...args),
  jsonOnlyInstruction: (schema: string) => `RETORNE JSON: ${schema}`,
}));

import { generateOcrExtract } from '../ocrExtract.js';
import { ocrExtractResultSchema } from '../../schema.js';

const request = {
  kind: 'ocr_extract' as const,
  brand: { name: 'AtlasGR', description: 'Revenue OS de logística' },
  inputs: {
    rawText: 'TRANSPORTES SILVA LTDA\nJoão - Diretor\n(11) 99999-0000',
  },
};

describe('studio/generators/ocrExtract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama invokeStructured com o schema/contexto/temperatura corretos e inclui o texto bruto do OCR no prompt', async () => {
    const fakeResult = {
      tradeName: 'Transportes Silva',
      segment: null,
      location: null,
      phone: '(11) 99999-0000',
      email: null,
      website: null,
      contactName: 'João',
      contactRole: 'Diretor',
      confidence: 'alta' as const,
    };
    invokeStructuredMock.mockResolvedValueOnce(fakeResult);

    const result = await generateOcrExtract(request);

    expect(result).toBe(fakeResult);
    const [prompt, context, schema, , temperature] = invokeStructuredMock.mock.calls[0];
    expect(context).toBe('studio:ocr-extract');
    expect(schema).toBe(ocrExtractResultSchema);
    expect(temperature).toBe(0.2);
    // O texto bruto do OCR é o único dado real de entrada — sem ele no prompt, o modelo não
    // tem o que extrair.
    expect(prompt).toContain(request.inputs.rawText);
  });
});
