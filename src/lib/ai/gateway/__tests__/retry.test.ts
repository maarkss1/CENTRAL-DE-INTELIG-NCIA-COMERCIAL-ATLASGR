import { describe, expect, it, vi } from 'vitest';
import { extractSuggestedRetryDelayMs, isRetryableAiError, withRetry } from '../retry';

describe('retry — política de reexecução do gateway de IA', () => {
    describe('isRetryableAiError', () => {
        it('considera 429 e 5xx reexecutáveis', () => {
            expect(isRetryableAiError(new Error('HTTP 429: rate limited'))).toBe(true);
            expect(isRetryableAiError(new Error('HTTP 503: Service Unavailable'))).toBe(true);
        });

        it('não considera 4xx (exceto 429) reexecutável', () => {
            expect(isRetryableAiError(new Error('HTTP 400: payload inválido'))).toBe(false);
            expect(isRetryableAiError(new Error('HTTP 401: unauthorized'))).toBe(false);
        });

        it('considera falha de rede/fetch reexecutável', () => {
            const err = new TypeError('fetch failed');
            expect(isRetryableAiError(err)).toBe(true);
        });

        it('não considera erro que não é Error reexecutável', () => {
            expect(isRetryableAiError('string qualquer')).toBe(false);
            expect(isRetryableAiError(undefined)).toBe(false);
        });

        it('não considera timeout/abort reexecutável — o gateway já espera o tempo máximo configurado', () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            expect(isRetryableAiError(abortError)).toBe(false);
        });
    });

    describe('extractSuggestedRetryDelayMs', () => {
        it('extrai delay sugerido em milissegundos', () => {
            expect(extractSuggestedRetryDelayMs('Rate limited. Please try again in 440ms.')).toBe(440);
        });

        it('extrai delay sugerido em segundos e converte para ms', () => {
            expect(extractSuggestedRetryDelayMs('Please try again in 2.5s')).toBe(2500);
        });

        it('retorna null quando a mensagem não sugere um delay', () => {
            expect(extractSuggestedRetryDelayMs('Erro genérico sem sugestão de espera')).toBeNull();
        });
    });

    describe('withRetry', () => {
        it('reexecuta uma vez após falha 5xx transitória e retorna o resultado da segunda tentativa', async () => {
            const fn = vi.fn()
                .mockRejectedValueOnce(new Error('HTTP 500: Internal Server Error'))
                .mockResolvedValueOnce('recuperado');

            const result = await withRetry(fn, 1, 1);
            expect(result).toBe('recuperado');
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('não reexecuta erro 4xx — propaga a falha original imediatamente', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('HTTP 400: bad request'));
            await expect(withRetry(fn, 2, 1)).rejects.toThrow('HTTP 400');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('desiste após esgotar as tentativas configuradas', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('HTTP 503: overload'));
            await expect(withRetry(fn, 2, 1)).rejects.toThrow('HTTP 503');
            expect(fn).toHaveBeenCalledTimes(3); // tentativa inicial + 2 retries
        });
    });
});
