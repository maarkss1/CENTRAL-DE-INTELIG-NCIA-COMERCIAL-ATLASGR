/**
 * Golden dataset dos três adapters de provedor (Groq/OpenAI/LiteLLM): dado o MESMO cenário de
 * entrada (resposta de sucesso equivalente, ou erro HTTP equivalente), cada adapter deve produzir
 * a MESMA forma normalizada de saída — critério de aceite "troca de provider não exige alteração
 * em regras de negócio" e "erros/respostas padronizados entre providers". Se um adapter novo
 * for adicionado, ou um existente for alterado, e a forma divergir, este arquivo quebra.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { __resetCircuitBreakerForTests } from '../circuit-breaker';
import { groqProvider } from '../providers/groq.provider';
import { openaiProvider } from '../providers/openai.provider';
import { litellmProvider } from '../providers/litellm.provider';
import type { ProviderAdapter } from '../providers/types';

const originalEnv = {
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  LITELLM_URL: process.env.LITELLM_URL,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PROVIDERS: ProviderAdapter[] = [groqProvider, openaiProvider, litellmProvider];

const BASE_PARAMS = {
  messages: [{ role: 'user' as const, content: 'Analise este lead.' }],
  temperature: 0.3,
  agentContext: 'golden-dataset-test',
  resolvedModel: 'local-llama3',
  timeoutMs: 5_000,
};

describe('golden dataset — adapters de provedor de IA', () => {
  beforeEach(async () => {
    process.env.GROQ_API_KEY = 'gsk_golden_test_key';
    process.env.OPENAI_API_KEY = 'sk-golden-test-key';
    process.env.LITELLM_URL = 'http://litellm.golden.test';
    delete process.env.OLLAMA_BASE_URL;
    await __resetCircuitBreakerForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key as keyof typeof originalEnv];
      else process.env[key as keyof typeof originalEnv] = value;
    }
  });

  describe.each(PROVIDERS.map((provider) => [provider.name, provider] as const))(
    'adapter: %s',
    (_name, provider) => {
      it('isConfigured() é true quando as credenciais/URL do provedor estão presentes', () => {
        expect(provider.isConfigured()).toBe(true);
      });

      it('normaliza uma resposta de sucesso no mesmo formato { content, model, usage }', async () => {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(
            jsonResponse({
              model: 'modelo-de-teste',
              choices: [{ message: { content: '  resposta do provedor  ' } }],
              usage: { total_tokens: 30, prompt_tokens: 20, completion_tokens: 10 },
            }),
          ),
        );

        const result = await provider.chatCompletion(BASE_PARAMS);

        // Forma golden: todo adapter devolve exatamente estes 3 campos, no mesmo shape.
        expect(result).toHaveProperty('model');
        expect(result).toHaveProperty('choices.0.message.content');
        expect(result).toHaveProperty('usage');
        expect(result.choices?.[0]?.message?.content?.trim()).toBe('resposta do provedor');
        expect(result.usage).toEqual({
          total_tokens: 30,
          prompt_tokens: 20,
          completion_tokens: 10,
        });
      });

      it('propaga erro HTTP no formato golden "HTTP <status>: <mensagem sanitizada>"', async () => {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(
            jsonResponse(
              {
                error: { message: 'Bearer sk-should-never-leak-1234567890 inválida' },
              },
              401,
            ),
          ),
        );

        let caught: unknown;
        try {
          await provider.chatCompletion(BASE_PARAMS);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(Error);
        const error = caught as Error;
        expect(error.message).toMatch(/^HTTP 401: /);
        // A chave nunca deve escapar do adapter, mesmo quando o provedor a ecoa no erro.
        expect(error.message).not.toContain('sk-should-never-leak-1234567890');
      });

      it('rejeita resposta de sucesso com conteúdo vazio — nenhum adapter aceita "sucesso" sem texto', async () => {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(
            jsonResponse({
              choices: [{ message: { content: '   ' } }],
            }),
          ),
        );

        await expect(provider.chatCompletion(BASE_PARAMS)).rejects.toThrow('resposta vazia');
      });
    },
  );

  it('cada adapter pula silenciosamente (isConfigured() false) quando sua env var não está setada', () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.LITELLM_URL;
    delete process.env.OLLAMA_BASE_URL;

    for (const provider of PROVIDERS) {
      expect(provider.isConfigured()).toBe(false);
    }
  });
});
