import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeTextMock = vi.fn();
const streamTextMock = vi.fn();
vi.mock('../../shared.js', () => ({
  SYSTEM_RULES: 'REGRAS DO SISTEMA',
  invokeText: (...args: unknown[]) => invokeTextMock(...args),
  streamText: (...args: unknown[]) => streamTextMock(...args),
}));

import { buildAssistantPrompt, generateAssistant, generateAssistantStream } from '../assistant.js';

function buildRequest(
  overrides: Partial<{
    mode: 'internal' | 'general';
    localContext?: string;
    history?: Array<{ sender: 'user' | 'assistant'; text: string }>;
  }> = {},
) {
  return {
    kind: 'assistant' as const,
    brand: { name: 'AtlasGR', description: 'Revenue OS de logística' },
    inputs: {
      question: 'Qual o diferencial da AtlasGR?',
      mode: overrides.mode ?? 'internal',
      localContext: overrides.localContext,
      history: overrides.history,
    },
  };
}

describe('studio/generators/assistant — buildAssistantPrompt (função pura)', () => {
  it('instrui a priorizar contexto interno no modo "internal"', () => {
    const prompt = buildAssistantPrompt(
      buildRequest({ mode: 'internal', localContext: 'Dado interno X' }),
    );
    expect(prompt).toMatch(/Priorize o contexto interno/);
    expect(prompt).toContain('Dado interno X');
  });

  it('instrui a não fingir acesso a fontes externas no modo "general"', () => {
    const prompt = buildAssistantPrompt(buildRequest({ mode: 'general' }));
    expect(prompt).toMatch(/conhecimento geral estável/);
    expect(prompt).not.toMatch(/Priorize o contexto interno/);
  });

  it('usa uma mensagem padrão quando não há contexto interno disponível', () => {
    const prompt = buildAssistantPrompt(
      buildRequest({ mode: 'internal', localContext: undefined }),
    );
    expect(prompt).toContain('Nenhum contexto interno compatível foi encontrado.');
  });

  it('formata o histórico da conversa em ordem cronológica com o rótulo correto por remetente', () => {
    const prompt = buildAssistantPrompt(
      buildRequest({
        history: [
          { sender: 'user', text: 'Pergunta 1' },
          { sender: 'assistant', text: 'Resposta 1' },
        ],
      }),
    );
    expect(prompt).toContain('Usuário: Pergunta 1');
    expect(prompt).toContain('Copiloto: Resposta 1');
    expect(prompt.indexOf('Pergunta 1')).toBeLessThan(prompt.indexOf('Resposta 1'));
  });

  it('não inclui a seção de histórico quando não há histórico', () => {
    const prompt = buildAssistantPrompt(buildRequest({ history: undefined }));
    expect(prompt).not.toContain('Histórico recente desta mesma conversa');
  });
});

describe('studio/generators/assistant — generateAssistant / generateAssistantStream', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generateAssistant usa invokeText com modelo rápido e mapeia a capability para "internal_context" no modo internal', async () => {
    invokeTextMock.mockResolvedValueOnce('Resposta do modelo');

    const result = await generateAssistant(buildRequest({ mode: 'internal' }));

    expect(result).toEqual({
      answer: 'Resposta do modelo',
      capability: 'internal_context',
      webAccess: false,
    });
    const [, context, temperature, modelAlias] = invokeTextMock.mock.calls[0];
    expect(context).toBe('studio:assistant');
    expect(temperature).toBe(0.35);
    expect(modelAlias).toBe('local-llama3-fast');
  });

  it('generateAssistant mapeia a capability para "general_knowledge" no modo general', async () => {
    invokeTextMock.mockResolvedValueOnce('Resposta do modelo');

    const result = await generateAssistant(buildRequest({ mode: 'general' }));

    expect(result.capability).toBe('general_knowledge');
  });

  it('generateAssistantStream usa streamText e repassa a mesma capability/webAccess', async () => {
    streamTextMock.mockImplementationOnce(async (_prompt, _ctx, _temp, _alias, onChunk) => {
      onChunk('pedaço 1');
      return 'pedaço 1';
    });
    const chunks: string[] = [];

    const result = await generateAssistantStream(buildRequest({ mode: 'internal' }), (c) =>
      chunks.push(c),
    );

    expect(chunks).toEqual(['pedaço 1']);
    expect(result).toEqual({
      answer: 'pedaço 1',
      capability: 'internal_context',
      webAccess: false,
    });
  });
});
