import { describe, expect, it, vi, beforeEach } from 'vitest';

// ARCH-009 (studio.service.ts decomposto em studio/generators/*, 2026-08-27): shared.ts é o único
// lugar que fala com o gateway de IA/guardrails de PII para todos os 12 geradores — antes desta
// suíte, nem shared.ts nem nenhum generator tinha teste (achado real da correção da
// ANALISE-DIVIDA-TECNICA-ROBUSTA.md original, 2026-08-28). Cobre o parsing/reparo de JSON, o
// fallback de streaming e a sanitização de identificador — a lógica de verdade, não boilerplate.

// vi.mock(...) é hoisted para o topo do arquivo pelo transform do Vitest — uma referência direta a
// uma const declarada abaixo (mesmo em ordem "antes" no código-fonte) dispararia
// "Cannot access ... before initialization". vi.hoisted() existe exatamente para isso: o bloco
// roda junto com o próprio hoisting do vi.mock, então as mocks já existem quando as factories abaixo
// são executadas.
const { invokeMock, getAiModelMock, logAiUsageMock, streamChatCompletionMock } = vi.hoisted(() => {
  const invokeMock = vi.fn();
  return {
    invokeMock,
    getAiModelMock: vi.fn(() => ({ invoke: invokeMock })),
    logAiUsageMock: vi.fn(),
    streamChatCompletionMock: vi.fn(),
  };
});

vi.mock('../../../../../lib/ai/gateway.js', () => ({
  getAiModel: getAiModelMock,
  logAiUsage: logAiUsageMock,
  streamChatCompletion: streamChatCompletionMock,
}));

const { redactAndTrackPiiLeakMock, createStreamingRedactorMock } = vi.hoisted(() => ({
  redactAndTrackPiiLeakMock: vi.fn(async (text: string) => text),
  createStreamingRedactorMock: vi.fn(() => ({
    push: (chunk: string) => chunk,
    flush: async () => '',
  })),
}));

vi.mock('../../guardrails.service.js', () => ({
  redactAndTrackPiiLeak: redactAndTrackPiiLeakMock,
  createStreamingRedactor: createStreamingRedactorMock,
}));

import {
  jsonOnlyInstruction,
  stripCodeFence,
  safeIdentifier,
  invokeText,
  invokeStructured,
  streamText,
  SYSTEM_RULES,
} from '../shared.js';
import { z } from 'zod';

function aiResult(content: string, model = 'local-llama3') {
  return {
    content,
    response_metadata: {
      model,
      tokenUsage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
    },
  };
}

describe('studio/shared', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAiModelMock.mockImplementation(() => ({ invoke: invokeMock }));
    redactAndTrackPiiLeakMock.mockImplementation(async (text: string) => text);
    createStreamingRedactorMock.mockImplementation(() => ({
      push: (chunk: string) => chunk,
      flush: async () => '',
    }));
  });

  describe('jsonOnlyInstruction', () => {
    it('embute a descrição do schema na instrução', () => {
      const instruction = jsonOnlyInstruction('{"foo":"bar"}');
      expect(instruction).toContain('{"foo":"bar"}');
      expect(instruction).toMatch(/SOMENTE JSON/i);
    });
  });

  describe('stripCodeFence', () => {
    it('remove bloco de código com linguagem anotada', () => {
      expect(stripCodeFence('```python\nprint(1)\n```')).toBe('print(1)');
    });

    it('remove bloco de código sem linguagem anotada', () => {
      expect(stripCodeFence('```\nconst x = 1;\n```')).toBe('const x = 1;');
    });

    it('não altera texto que já não tem cerca de código', () => {
      expect(stripCodeFence('já é texto puro')).toBe('já é texto puro');
    });
  });

  describe('safeIdentifier', () => {
    it('remove acentos/diacríticos', () => {
      expect(safeIdentifier('Agência São João')).toBe('Agencia_Sao_Joao');
    });

    it('substitui caracteres não alfanuméricos por underscore', () => {
      expect(safeIdentifier('Agent #1 (beta)')).toBe('Agent__1__beta_');
    });

    it('prefixa com underscore quando começa com dígito (identificador JS/Python inválido)', () => {
      expect(safeIdentifier('123Agent')).toBe('_123Agent');
    });

    it('cai para "GeneratedAgent" quando o resultado normalizado fica vazio (string vazia)', () => {
      expect(safeIdentifier('')).toBe('GeneratedAgent');
    });

    it('não cai no fallback quando sobra algo, mesmo que seja só underscores (entrada só com símbolos)', () => {
      // Cada símbolo vira '_' — o resultado ainda é uma string não-vazia, então o fallback
      // ("value || 'GeneratedAgent'") não dispara. Só dispara para entrada literalmente vazia.
      expect(safeIdentifier('!!!')).toBe('___');
    });
  });

  describe('invokeText', () => {
    it('chama o modelo com system+human message, loga uso e devolve o texto redigido/trimado', async () => {
      invokeMock.mockResolvedValueOnce(aiResult('  resposta do modelo  '));

      const result = await invokeText('pergunta do usuário', 'studio:test', 0.5);

      expect(result).toBe('resposta do modelo');
      expect(getAiModelMock).toHaveBeenCalledWith('local-llama3', 0.5, 'studio:test');
      expect(logAiUsageMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'local-llama3', usage: expect.any(Object) }),
      );
      // A redação de PII roda sobre o conteúdo BRUTO do modelo — o .trim() final acontece
      // só depois, sobre o resultado já redigido (ver invokeText: `(await
      // redactAndTrackPiiLeak(...)).trim()`).
      expect(redactAndTrackPiiLeakMock).toHaveBeenCalledWith('  resposta do modelo  ', 'studio');
    });

    it('remove o prefixo SYSTEM_RULES do prompt antes de mandar como HumanMessage (evita duplicar a regra de sistema)', async () => {
      invokeMock.mockResolvedValueOnce(aiResult('ok'));
      const promptWithRules = `${SYSTEM_RULES}\n\nPergunta real aqui`;

      await invokeText(promptWithRules, 'studio:test', 0.5);

      const messages = invokeMock.mock.calls[0][0];
      // messages[0] = SystemMessage(SYSTEM_RULES), messages[1] = HumanMessage(userPrompt)
      expect(messages[1].content).toBe('Pergunta real aqui');
      expect(messages[1].content).not.toContain(SYSTEM_RULES);
    });

    it('usa o modelAlias informado em vez do padrão', async () => {
      invokeMock.mockResolvedValueOnce(aiResult('ok'));
      await invokeText('prompt', 'studio:test', 0.1, 'local-llama3-fast');
      expect(getAiModelMock).toHaveBeenCalledWith('local-llama3-fast', 0.1, 'studio:test');
    });
  });

  describe('invokeStructured', () => {
    const schema = z.object({ subject: z.string(), body: z.string() });
    const schemaDescription = '{"subject":"string","body":"string"}';

    it('faz parse direto quando a primeira resposta já é JSON válido', async () => {
      invokeMock.mockResolvedValueOnce(aiResult(JSON.stringify({ subject: 'Oi', body: 'Corpo' })));

      const result = await invokeStructured(
        'prompt',
        'studio:test',
        schema,
        schemaDescription,
        0.5,
      );

      expect(result).toEqual({ subject: 'Oi', body: 'Corpo' });
      expect(invokeMock).toHaveBeenCalledTimes(1);
    });

    it('extrai JSON de dentro de uma cerca de código Markdown (```json ... ```)', async () => {
      const fenced = '```json\n' + JSON.stringify({ subject: 'Oi', body: 'Corpo' }) + '\n```';
      invokeMock.mockResolvedValueOnce(aiResult(fenced));

      const result = await invokeStructured(
        'prompt',
        'studio:test',
        schema,
        schemaDescription,
        0.5,
      );

      expect(result).toEqual({ subject: 'Oi', body: 'Corpo' });
    });

    it('quando o primeiro JSON é inválido, tenta reparar com uma segunda chamada e devolve o resultado reparado', async () => {
      invokeMock
        .mockResolvedValueOnce(aiResult('isto não é JSON'))
        .mockResolvedValueOnce(aiResult(JSON.stringify({ subject: 'Reparado', body: 'Corpo' })));

      const result = await invokeStructured(
        'prompt',
        'studio:test',
        schema,
        schemaDescription,
        0.5,
      );

      expect(result).toEqual({ subject: 'Reparado', body: 'Corpo' });
      expect(invokeMock).toHaveBeenCalledTimes(2);
      // A chamada de reparo usa contexto derivado (":json-repair"), temperatura 0 e o modelo rápido —
      // reparo de formato não deve gastar o mesmo orçamento/latência da geração original.
      expect(getAiModelMock).toHaveBeenNthCalledWith(
        2,
        'local-llama3-fast',
        0,
        'studio:test:json-repair',
      );
    });

    it('quando o JSON reparado também falha o schema, propaga o erro em vez de devolver dado inválido silenciosamente', async () => {
      invokeMock
        .mockResolvedValueOnce(aiResult('não é JSON'))
        .mockResolvedValueOnce(aiResult(JSON.stringify({ subject: 'Só isso' })));

      await expect(
        invokeStructured('prompt', 'studio:test', schema, schemaDescription, 0.5),
      ).rejects.toBeInstanceOf(Error);
    });
  });

  describe('streamText', () => {
    async function* fakeGenerator(chunks: string[], finalValue: { model: string; usage: unknown }) {
      for (const delta of chunks) {
        yield { delta };
      }
      return finalValue;
    }

    it('entrega cada chunk via onChunk e loga o uso final do stream', async () => {
      streamChatCompletionMock.mockReturnValueOnce(
        fakeGenerator(['Olá', ', mundo'], {
          model: 'local-llama3',
          usage: { totalTokens: 3, promptTokens: 1, completionTokens: 2 },
        }),
      );
      const chunks: string[] = [];

      const result = await streamText('prompt', 'studio:test', 0.4, 'local-llama3', (text) =>
        chunks.push(text),
      );

      expect(chunks).toEqual(['Olá', ', mundo']);
      expect(result).toBe('Olá, mundo');
      expect(logAiUsageMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'local-llama3' }),
      );
    });

    it('cai para invokeText (sem streaming) quando o gerador falha ANTES do primeiro chunk', async () => {
      // biome-ignore-start lint/correctness/noUnreachable: generator precisa do yield pra TS inferir
      // o tipo de retorno correto — o teste depende justamente do throw acontecer antes dele.
      streamChatCompletionMock.mockImplementationOnce(async function* () {
        throw new Error('LiteLLM indisponível');
        yield { delta: 'nunca chega aqui' };
      });
      // biome-ignore-end lint/correctness/noUnreachable: fim do bloco
      invokeMock.mockResolvedValueOnce(aiResult('resposta de fallback sem streaming'));
      const chunks: string[] = [];

      const result = await streamText('prompt', 'studio:test', 0.4, 'local-llama3', (text) =>
        chunks.push(text),
      );

      expect(result).toBe('resposta de fallback sem streaming');
      expect(chunks).toEqual(['resposta de fallback sem streaming']);
    });

    it('propaga o erro (não usa fallback silencioso) quando o gerador falha DEPOIS do primeiro chunk já ter sido entregue ao usuário', async () => {
      streamChatCompletionMock.mockImplementationOnce(async function* () {
        yield { delta: 'primeiro pedaço' };
        throw new Error('conexão caiu no meio do stream');
      });
      const chunks: string[] = [];

      await expect(
        streamText('prompt', 'studio:test', 0.4, 'local-llama3', (text) => chunks.push(text)),
      ).rejects.toThrow('conexão caiu no meio do stream');
      // O primeiro chunk já foi entregue ao usuário antes da falha — não pode ser "apagado"
      // silenciosamente por um fallback que reescreveria a resposta do zero.
      expect(chunks).toEqual(['primeiro pedaço']);
      expect(invokeMock).not.toHaveBeenCalled();
    });
  });
});
