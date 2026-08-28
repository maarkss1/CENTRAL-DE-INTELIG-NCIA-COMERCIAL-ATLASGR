import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeStructuredMock = vi.fn();
vi.mock('../../shared.js', () => ({
  SYSTEM_RULES: 'REGRAS DO SISTEMA',
  invokeStructured: (...args: unknown[]) => invokeStructuredMock(...args),
  jsonOnlyInstruction: (schema: string) => `RETORNE JSON: ${schema}`,
}));

import { generateRoleplay } from '../roleplay.js';
import { roleplayResultSchema } from '../../schema.js';

const request = {
  kind: 'roleplay' as const,
  brand: { name: 'AtlasGR', description: 'Revenue OS de logística' },
  inputs: {
    persona: 'skeptical_cfo' as const,
    message: 'Nosso ROI se paga em 3 meses.',
    transcript: [{ sender: 'sdr' as const, text: 'Oi, tudo bem?' }],
    playbookContext: 'Foco em ROI',
  },
};

describe('studio/generators/roleplay', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama invokeStructured com o schema/contexto/temperatura corretos e inclui persona/transcript/mensagem no prompt', async () => {
    invokeStructuredMock.mockResolvedValueOnce({
      reply: 'r',
      feedback: 'f',
      clarity: 80,
      objectionHandling: 70,
    });

    await generateRoleplay(request);

    const [prompt, context, schema, , temperature] = invokeStructuredMock.mock.calls[0];
    expect(context).toBe('studio:roleplay');
    expect(schema).toBe(roleplayResultSchema);
    expect(temperature).toBe(0.55);
    expect(prompt).toContain('CFO cético');
    expect(prompt).toContain('Nosso ROI se paga em 3 meses.');
  });

  it('mantém as notas como estão quando o modelo já devolve na escala 0-100', async () => {
    invokeStructuredMock.mockResolvedValueOnce({
      reply: 'r',
      feedback: 'f',
      clarity: 80,
      objectionHandling: 60,
    });

    const result = await generateRoleplay(request);

    expect(result.clarity).toBe(80);
    expect(result.objectionHandling).toBe(60);
    expect(result.total).toBe(70); // round((80+60)/2)
  });

  it('multiplica por 10 quando o modelo devolve na escala 0-10 (achado real: modelo às vezes ignora a instrução de escala)', async () => {
    invokeStructuredMock.mockResolvedValueOnce({
      reply: 'r',
      feedback: 'f',
      clarity: 8,
      objectionHandling: 6,
    });

    const result = await generateRoleplay(request);

    expect(result.clarity).toBe(80);
    expect(result.objectionHandling).toBe(60);
    expect(result.total).toBe(70);
  });

  it('trata clarity e objectionHandling de forma independente — uma pode estar na escala 0-10 e a outra já em 0-100', async () => {
    invokeStructuredMock.mockResolvedValueOnce({
      reply: 'r',
      feedback: 'f',
      clarity: 9,
      objectionHandling: 85,
    });

    const result = await generateRoleplay(request);

    expect(result.clarity).toBe(90);
    expect(result.objectionHandling).toBe(85);
    expect(result.total).toBe(88); // round((90+85)/2) = round(87.5) = 88
  });

  it('o valor limite 10 ainda é tratado como escala 0-10 (multiplica), não como 0-100 (regra é <=10)', async () => {
    invokeStructuredMock.mockResolvedValueOnce({
      reply: 'r',
      feedback: 'f',
      clarity: 10,
      objectionHandling: 50,
    });

    const result = await generateRoleplay(request);

    expect(result.clarity).toBe(100);
  });
});
