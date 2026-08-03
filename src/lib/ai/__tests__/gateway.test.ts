import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../prisma.js', () => ({
    prisma: {
        aILog: {
            create: vi.fn(),
        },
    },
}));

vi.mock('../../logger.js', () => ({
    logger: {
        warn: vi.fn(),
    },
}));

import {
    __resetCircuitBreakerForTests,
    generateEmbedding,
    getAiModel,
    toChatCompletionMessages,
} from '../gateway';

const originalEnv = {
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    LITELLM_URL: process.env.LITELLM_URL,
    LITELLM_KEY: process.env.LITELLM_KEY,
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('AI gateway', () => {
    beforeEach(async () => {
        process.env.LITELLM_URL = 'http://litellm.test/v1/';
        process.env.LITELLM_KEY = 'test-litellm-key';
        delete process.env.GROQ_API_KEY;
        await __resetCircuitBreakerForTests();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });

    it('preserva os papéis de sistema, usuário e assistente', () => {
        expect(toChatCompletionMessages([
            new SystemMessage('Regras prioritárias'),
            new HumanMessage('Pergunta'),
            new AIMessage('Resposta anterior'),
        ])).toEqual([
            { role: 'system', content: 'Regras prioritárias' },
            { role: 'user', content: 'Pergunta' },
            { role: 'assistant', content: 'Resposta anterior' },
        ]);
    });

    it('envia mensagens estruturadas ao LiteLLM e normaliza a resposta', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            model: 'llama-3.1-8b-instant',
            choices: [{ message: { content: '  resposta útil  ' } }],
            usage: { total_tokens: 12, prompt_tokens: 7, completion_tokens: 5 },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await getAiModel('local-llama3-fast', 3, 'unit:test').invoke([
            new SystemMessage('Não invente dados.'),
            new HumanMessage('Analise este lead.'),
        ]);

        expect(result.content).toBe('resposta útil');
        expect(result.response_metadata.tokenUsage).toEqual({
            totalTokens: 12,
            promptTokens: 7,
            completionTokens: 5,
        });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://litellm.test/v1/chat/completions');
        const body = JSON.parse(String(init.body));
        expect(body.messages).toEqual([
            { role: 'system', content: 'Não invente dados.' },
            { role: 'user', content: 'Analise este lead.' },
        ]);
        expect(body.temperature).toBe(2);
        expect(body.metadata).toEqual({ agent: 'unit:test' });
    });

    it('usa Groq como contingência sem perder os papéis das mensagens', async () => {
        process.env.GROQ_API_KEY = 'gsk_test_key_for_unit_tests';
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new Error('LiteLLM offline'))
            .mockResolvedValueOnce(jsonResponse({
                model: 'llama-3.3-70b-versatile',
                choices: [{ message: { content: 'fallback ativo' } }],
            }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await getAiModel('local-llama3', 0.2, 'unit:fallback').invoke([
            new SystemMessage('Regra'),
            new HumanMessage('Pedido'),
        ]);

        expect(result.content).toBe('fallback ativo');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
        expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
        const body = JSON.parse(String(init.body));
        expect(body.model).toBe('llama-3.3-70b-versatile');
        expect(body.messages[0]).toEqual({ role: 'system', content: 'Regra' });
        expect(body).not.toHaveProperty('metadata');
        expect(body).not.toHaveProperty('user');
    });

    it('rejeita respostas vazias do provedor', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
            choices: [{ message: { content: '   ' } }],
        })));

        await expect(getAiModel().invoke([new HumanMessage('Olá')]))
            .rejects.toThrow('resposta vazia');
    });

    it('valida a resposta de embeddings do provedor remoto', async () => {
        // O padrão passou a ser o modelo local (sem chave, sem rede). Este teste cobre o caminho
        // remoto, que continua disponível via EMBEDDINGS_PROVIDER=gateway.
        const anterior = process.env.EMBEDDINGS_PROVIDER;
        process.env.EMBEDDINGS_PROVIDER = 'gateway';
        try {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
                data: [{ embedding: [0.1, 0.2, 0.3] }],
            })));

            await expect(generateEmbedding('  conteúdo útil  ')).resolves.toEqual([0.1, 0.2, 0.3]);
            await expect(generateEmbedding('   ')).rejects.toThrow('não pode ser vazio');
        } finally {
            if (anterior === undefined) delete process.env.EMBEDDINGS_PROVIDER;
            else process.env.EMBEDDINGS_PROVIDER = anterior;
        }
    });

    it('usa o modelo local por padrão, sem tocar na rede', async () => {
        const anterior = process.env.EMBEDDINGS_PROVIDER;
        delete process.env.EMBEDDINGS_PROVIDER;

        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        try {
            // Não carregamos o modelo de verdade aqui (são ~400 MB): basta garantir que a rota
            // padrão delega ao módulo local em vez de chamar o proxy.
            const local = await import('../local-embeddings.js');
            const spy = vi.spyOn(local, 'embedLocal').mockResolvedValue(new Array(768).fill(0.01));

            await expect(generateEmbedding('texto qualquer')).resolves.toHaveLength(768);
            expect(spy).toHaveBeenCalledWith('texto qualquer', 'passage');
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            if (anterior !== undefined) process.env.EMBEDDINGS_PROVIDER = anterior;
        }
    });

    it('reexecuta a mesma perna após uma falha 5xx transitória antes de desistir', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ error: 'Internal' }, 500))
            .mockResolvedValueOnce(jsonResponse({
                model: 'local-llama3',
                choices: [{ message: { content: 'recuperou na segunda tentativa' } }],
            }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await getAiModel('local-llama3', 0, 'unit:retry').invoke([new HumanMessage('Pedido')]);

        expect(result.content).toBe('recuperou na segunda tentativa');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toBe('http://litellm.test/v1/chat/completions');
        expect(fetchMock.mock.calls[1][0]).toBe('http://litellm.test/v1/chat/completions');
    });

    it('não reexecuta em erro 4xx — cai direto para o próximo provedor', async () => {
        process.env.GROQ_API_KEY = 'gsk_test_key_for_unit_tests';
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ error: 'Requisição inválida' }, 400))
            .mockResolvedValueOnce(jsonResponse({
                model: 'llama-3.3-70b-versatile',
                choices: [{ message: { content: 'fallback ativo' } }],
            }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await getAiModel('local-llama3', 0, 'unit:no-retry-4xx').invoke([new HumanMessage('Pedido')]);

        expect(result.content).toBe('fallback ativo');
        // Só 2 chamadas no total: 1 tentativa no LiteLLM (sem retry por ser 4xx) + 1 no Groq.
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    });

    it('abre o circuit breaker após falhas consecutivas e para de contatar o provedor', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'Requisição inválida' }, 400));
        vi.stubGlobal('fetch', fetchMock);

        for (let i = 0; i < 3; i++) {
            await expect(getAiModel('local-llama3', 0, 'unit:breaker').invoke([new HumanMessage('Pedido')]))
                .rejects.toThrow();
        }
        const callsBeforeBreakerOpen = fetchMock.mock.calls.length;
        expect(callsBeforeBreakerOpen).toBe(3);

        await expect(getAiModel('local-llama3', 0, 'unit:breaker').invoke([new HumanMessage('Pedido')]))
            .rejects.toThrow('temporariamente desativado');
        // O circuit breaker impediu uma 4ª chamada de rede ao provedor já sabidamente fora do ar.
        expect(fetchMock).toHaveBeenCalledTimes(callsBeforeBreakerOpen);
    });
});
