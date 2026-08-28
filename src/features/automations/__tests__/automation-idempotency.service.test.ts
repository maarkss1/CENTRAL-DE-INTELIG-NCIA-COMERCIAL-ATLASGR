import { describe, it, expect, vi, beforeEach } from 'vitest';

// Onda 7 (Agente 07) — gap real de idempotência: o mesmo evento de gatilho podia chegar ao motor
// mais de uma vez (replay, corrida entre workers) e rodar a ação duas vezes. Este arquivo testa o
// primitivo de dedupe isoladamente (a integração completa com `automation.engine.ts` está em
// `automation.engine.retry-idempotency.test.ts`).

const mocks = vi.hoisted(() => ({
    redisConfigured: true,
    set: vi.fn<(key: string, value: string, ex: string, ttl: number, nx: string) => Promise<'OK' | null>>(),
    loggerWarn: vi.fn(),
}));

vi.mock('../../../lib/queue/redis.js', () => ({
    get redisConfigured() {
        return mocks.redisConfigured;
    },
    cacheConnection: {
        set: mocks.set,
    },
}));

vi.mock('../../../lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: mocks.loggerWarn, error: vi.fn() },
}));

import {
    buildTriggerIdempotencyKey,
    claimAutomationTrigger,
    TRIGGER_IDEMPOTENCY_TTL_SECONDS,
} from '../automation-idempotency.service';

describe('buildTriggerIdempotencyKey', () => {
    const identity = {
        automationId: 'auto-1',
        organizationId: 'org-1',
        entity: 'Lead',
        entityId: 'lead-1',
        trigger: 'Lead criado',
        data: { status: 'Novo', owner: 'Maria' },
    };

    it('é determinístico: a mesma identidade sempre produz a mesma chave', () => {
        expect(buildTriggerIdempotencyKey(identity)).toBe(buildTriggerIdempotencyKey({ ...identity }));
    });

    it('é indiferente à ordem das chaves de `data` (hash estável, não string bruta)', () => {
        const reordered = { ...identity, data: { owner: 'Maria', status: 'Novo' } };
        expect(buildTriggerIdempotencyKey(identity)).toBe(buildTriggerIdempotencyKey(reordered));
    });

    it('muda quando o conteúdo do evento muda — dois disparos legítimos e distintos nunca colidem', () => {
        const distinct = { ...identity, data: { status: 'Proposta Enviada', owner: 'Maria' } };
        expect(buildTriggerIdempotencyKey(identity)).not.toBe(buildTriggerIdempotencyKey(distinct));
    });

    it('muda por automationId, entityId ou trigger — nunca cruza automação/entidade/gatilho diferentes', () => {
        expect(buildTriggerIdempotencyKey(identity)).not.toBe(
            buildTriggerIdempotencyKey({ ...identity, automationId: 'auto-2' }),
        );
        expect(buildTriggerIdempotencyKey(identity)).not.toBe(
            buildTriggerIdempotencyKey({ ...identity, entityId: 'lead-2' }),
        );
        expect(buildTriggerIdempotencyKey(identity)).not.toBe(
            buildTriggerIdempotencyKey({ ...identity, trigger: 'Lead mudou de status' }),
        );
    });
});

describe('claimAutomationTrigger', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.redisConfigured = true;
    });

    it('primeira reivindicação (SET NX bem-sucedido) retorna "claimed"', async () => {
        mocks.set.mockResolvedValue('OK');
        const result = await claimAutomationTrigger('chave-1');
        expect(result).toBe('claimed');
        expect(mocks.set).toHaveBeenCalledWith(
            'automation:trigger:chave-1',
            '1',
            'EX',
            TRIGGER_IDEMPOTENCY_TTL_SECONDS,
            'NX',
        );
    });

    it('segunda reivindicação da mesma chave (SET NX recusado) retorna "duplicate"', async () => {
        mocks.set.mockResolvedValue(null);
        const result = await claimAutomationTrigger('chave-1');
        expect(result).toBe('duplicate');
    });

    it('sem Redis configurado, não chama o Redis e falha aberto ("unavailable")', async () => {
        mocks.redisConfigured = false;
        const result = await claimAutomationTrigger('chave-1');
        expect(result).toBe('unavailable');
        expect(mocks.set).not.toHaveBeenCalled();
    });

    it('Redis indisponível (erro na chamada) falha aberto ("unavailable") e loga o problema', async () => {
        mocks.set.mockRejectedValue(new Error('ECONNREFUSED'));
        const result = await claimAutomationTrigger('chave-1');
        expect(result).toBe('unavailable');
        expect(mocks.loggerWarn).toHaveBeenCalledTimes(1);
    });

    it('aceita um TTL customizado', async () => {
        mocks.set.mockResolvedValue('OK');
        await claimAutomationTrigger('chave-1', 60);
        expect(mocks.set).toHaveBeenCalledWith('automation:trigger:chave-1', '1', 'EX', 60, 'NX');
    });
});
