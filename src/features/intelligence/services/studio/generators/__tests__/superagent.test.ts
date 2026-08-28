import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeStructuredMock = vi.fn();
vi.mock('../../shared.js', () => ({
  SYSTEM_RULES: 'REGRAS DO SISTEMA',
  invokeStructured: (...args: unknown[]) => invokeStructuredMock(...args),
  jsonOnlyInstruction: (schema: string) => `RETORNE JSON: ${schema}`,
  // Mesma implementação real de shared.ts — testada isoladamente em shared.test.ts. Reimplementada
  // aqui (não importada) porque o mock substitui o módulo inteiro; manter os dois em sincronia é
  // o preço de testar superagent.ts isolado de shared.ts.
  safeIdentifier: (value: string) => {
    const normalized = value.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const identifier = normalized.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
    return identifier || 'GeneratedAgent';
  },
}));

import { generateSuperagent } from '../superagent.js';
import { superagentAiResultSchema } from '../../schema.js';

function buildRequest(name: string) {
  return {
    kind: 'superagent' as const,
    brand: { name: 'AtlasGR', description: 'Revenue OS de logística' },
    inputs: {
      name,
      provider: 'openai',
      model: 'gpt-5',
      role: 'Qualificador de leads',
      temperature: 0.4,
      memory: 'buffer',
      tools: ['crm_lookup'],
    },
  };
}

describe('studio/generators/superagent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama invokeStructured com o schema/contexto/temperatura corretos', async () => {
    invokeStructuredMock.mockResolvedValueOnce({
      summary: 'Resumo',
      systemPrompt: 'Prompt de sistema completo',
    });

    await generateSuperagent(buildRequest('Agente Qualificador'));

    const [prompt, context, schema, , temperature] = invokeStructuredMock.mock.calls[0];
    expect(context).toBe('studio:superagent');
    expect(schema).toBe(superagentAiResultSchema);
    expect(temperature).toBe(0.35);
    expect(prompt).toContain('AtlasGR');
  });

  it('monta o scaffold (jsonConfig/pythonScript/powershellScript) usando o nome do agente sanitizado como identificador', async () => {
    invokeStructuredMock.mockResolvedValueOnce({
      summary: 'Resumo',
      systemPrompt: 'Prompt completo',
    });

    const result = await generateSuperagent(buildRequest('Agente Qualificador'));

    expect(result.summary).toBe('Resumo');
    expect(result.systemPrompt).toBe('Prompt completo');

    const jsonConfig = JSON.parse(result.jsonConfig);
    expect(jsonConfig.name).toBe('Agente Qualificador');
    expect(jsonConfig.agent_id).toBe('agent_agente_qualificador');
    expect(jsonConfig.target_llm).toEqual({ provider: 'openai', model: 'gpt-5', temperature: 0.4 });
    expect(jsonConfig.status).toBe('draft');
    expect(jsonConfig.requires_review_before_deploy).toBe(true);

    expect(result.pythonScript).toContain('class Agente_QualificadorAgent:');
    expect(result.pythonScript).toContain('LLM_API_KEY');
    expect(result.powershellScript).toContain('LLM_API_KEY');
  });

  it('sanitiza nomes com acentos/símbolos para um identificador Python/classe válido (sem isso o script gerado não compilaria)', async () => {
    invokeStructuredMock.mockResolvedValueOnce({ summary: 'r', systemPrompt: 'p' });

    const result = await generateSuperagent(buildRequest('Ag3nte São João (v2)'));

    // safeIdentifier: remove acento, troca não-alfanumérico por "_", prefixa dígito líder.
    expect(result.pythonScript).toContain('class Ag3nte_Sao_Joao__v2_Agent:');
  });

  it('nunca marca o agente como pronto para deploy sem revisão humana (safety rail do gerador)', async () => {
    invokeStructuredMock.mockResolvedValueOnce({ summary: 'r', systemPrompt: 'p' });

    const result = await generateSuperagent(buildRequest('Agente X'));

    const jsonConfig = JSON.parse(result.jsonConfig);
    expect(jsonConfig.requires_review_before_deploy).toBe(true);
    expect(jsonConfig.status).toBe('draft');
    expect(result.pythonScript).toContain(
      'RuntimeError("Configure LLM_API_KEY antes de iniciar o agente.")',
    );
  });
});
