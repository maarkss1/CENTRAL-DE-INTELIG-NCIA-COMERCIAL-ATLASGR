/**
 * Gap de auditoria (05 — Prospecção): antes deste módulo não existia limite dedicado por provider
 * de prospecção (Apollo/Hunter) — só o rate limit genérico de rota HTTP. Cobre o núcleo puro do
 * token bucket (`tryConsumeToken`, testável sem fake timers — recebe `now` explicitamente, mesmo
 * padrão de `computeBackoffDelayMs`/`isEnrichmentFresh` já usados neste domínio) e a API de mais
 * alto nível (`checkProviderRateLimit`): bloqueia acima do limite/minuto configurado e libera de
 * novo depois que a janela permite recompor tokens.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    tryConsumeToken,
    checkProviderRateLimit,
    getRateLimitPerMinute,
    resetProviderRateLimitersForTests,
    DEFAULT_RATE_LIMIT_PER_MINUTE,
    type ProspectingRateLimitedProvider,
} from '../providerRateLimit.js';

beforeEach(() => {
    resetProviderRateLimitersForTests();
});

describe('tryConsumeToken (núcleo puro)', () => {
    it('permite consumir até a capacidade e bloqueia a chamada seguinte', () => {
        let bucket: { tokens: number; lastRefillMs: number } | undefined;
        const now = 0;

        for (let i = 0; i < 3; i++) {
            const outcome = tryConsumeToken(bucket, 3, now);
            bucket = outcome.bucket;
            expect(outcome.result.allowed).toBe(true);
        }

        const blocked = tryConsumeToken(bucket, 3, now);
        expect(blocked.result.allowed).toBe(false);
        expect(blocked.result.retryAfterMs).toBeGreaterThan(0);
    });

    it('libera de novo depois que o tempo suficiente passa para repor um token', () => {
        let bucket: { tokens: number; lastRefillMs: number } | undefined;
        const limitPerMinute = 60; // 1 token/segundo
        const t0 = 0;

        // Esvazia completamente o bucket (capacidade inicial = 60 tokens).
        for (let i = 0; i < 60; i++) {
            const outcome = tryConsumeToken(bucket, limitPerMinute, t0);
            bucket = outcome.bucket;
        }
        expect(tryConsumeToken(bucket, limitPerMinute, t0).result.allowed).toBe(false);

        // 1000ms depois, à taxa de 1 token/segundo, exatamente 1 token novo está disponível.
        const later = tryConsumeToken(bucket, limitPerMinute, t0 + 1000);
        expect(later.result.allowed).toBe(true);
        // E imediatamente depois de consumi-lo, a vaga seguinte volta a ser bloqueada.
        expect(tryConsumeToken(later.bucket, limitPerMinute, t0 + 1000).result.allowed).toBe(false);
    });

    it('limite <= 0 (ou não finito) desativa o limite — sempre permite', () => {
        expect(tryConsumeToken(undefined, 0, 0).result.allowed).toBe(true);
        expect(tryConsumeToken(undefined, -5, 0).result.allowed).toBe(true);
        expect(tryConsumeToken(undefined, NaN, 0).result.allowed).toBe(true);
    });
});

describe('getRateLimitPerMinute', () => {
    it('usa o default documentado quando a env var específica do provider não está setada', () => {
        expect(getRateLimitPerMinute('apollo', {})).toBe(DEFAULT_RATE_LIMIT_PER_MINUTE.apollo);
        expect(getRateLimitPerMinute('hunter', {})).toBe(DEFAULT_RATE_LIMIT_PER_MINUTE.hunter);
    });

    it('usa o valor configurado via env quando é um número válido', () => {
        expect(getRateLimitPerMinute('apollo', { APOLLO_RATE_LIMIT_PER_MINUTE: '5' })).toBe(5);
        expect(getRateLimitPerMinute('hunter', { HUNTER_RATE_LIMIT_PER_MINUTE: '12' })).toBe(12);
    });

    it('ignora valor inválido (zero, negativo ou não numérico) e cai no default', () => {
        expect(getRateLimitPerMinute('apollo', { APOLLO_RATE_LIMIT_PER_MINUTE: '0' })).toBe(DEFAULT_RATE_LIMIT_PER_MINUTE.apollo);
        expect(getRateLimitPerMinute('apollo', { APOLLO_RATE_LIMIT_PER_MINUTE: '-1' })).toBe(DEFAULT_RATE_LIMIT_PER_MINUTE.apollo);
        expect(getRateLimitPerMinute('apollo', { APOLLO_RATE_LIMIT_PER_MINUTE: 'abc' })).toBe(DEFAULT_RATE_LIMIT_PER_MINUTE.apollo);
    });
});

describe('checkProviderRateLimit', () => {
    it('bloqueia acima do limite configurado e devolve uma mensagem clara (não lança/derruba o chamador)', () => {
        const env = { APOLLO_RATE_LIMIT_PER_MINUTE: '2' };

        expect(checkProviderRateLimit('apollo', 0, env).allowed).toBe(true);
        expect(checkProviderRateLimit('apollo', 0, env).allowed).toBe(true);

        const blocked = checkProviderRateLimit('apollo', 0, env);
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterMs).toBeGreaterThan(0);
        expect(blocked.message).toMatch(/apollo/i);
        expect(blocked.message).toMatch(/2\/min/);
    });

    it('libera a chamada de novo depois que passa tempo suficiente para repor um token', () => {
        const env = { APOLLO_RATE_LIMIT_PER_MINUTE: '60' }; // 1 token/segundo
        for (let i = 0; i < 60; i++) checkProviderRateLimit('apollo', 0, env);

        expect(checkProviderRateLimit('apollo', 0, env).allowed).toBe(false);
        expect(checkProviderRateLimit('apollo', 1000, env).allowed).toBe(true);
    });

    it('mantém buckets independentes por provider — estourar o limite da Apollo não afeta o da Hunter', () => {
        const env = { APOLLO_RATE_LIMIT_PER_MINUTE: '1', HUNTER_RATE_LIMIT_PER_MINUTE: '1' };
        const providers: ProspectingRateLimitedProvider[] = ['apollo', 'hunter'];

        expect(checkProviderRateLimit(providers[0], 0, env).allowed).toBe(true);
        expect(checkProviderRateLimit(providers[0], 0, env).allowed).toBe(false);
        expect(checkProviderRateLimit(providers[1], 0, env).allowed).toBe(true);
    });
});
