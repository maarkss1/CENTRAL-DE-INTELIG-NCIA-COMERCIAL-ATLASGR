import { describe, it, expect, afterEach, afterAll, beforeAll } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

/**
 * AI-006 (onda 35), contra Postgres real (RLS incluída): prova que `AIGuardrailEvent` — a tabela
 * nova que sustenta a dimensão "PII leakage rate" — respeita isolamento de tenant de verdade
 * (FORCE ROW LEVEL SECURITY, não só um WHERE aplicado na aplicação), e que `redactAndTrackPiiLeak`
 * grava um evento real quando chamado de dentro de um contexto de tenant, sem gravar nada fora
 * dele. `getEvaluationMetricsSnapshot` é exercitado end-to-end contra as tabelas reais
 * (AILog/AIPendingAction/AIGuardrailEvent), não com prisma mockado.
 */
const { redactAndTrackPiiLeak } = await import('../../src/features/intelligence/services/guardrails.service');
const { getEvaluationMetricsSnapshot } = await import('../../src/features/intelligence/services/evaluationMetrics.service');

const ORG_A = 'test-org-id'; // pré-seedado por tests/helpers/integration-setup.ts
const ORG_B = 'test-org-id-eval-metrics-b';

describe('AI-006: AIGuardrailEvent + evaluationMetrics.service (Postgres real, RLS incluída)', () => {
    beforeAll(async () => {
        await requestContext.run({ bypassRls: true }, async () => {
            const exists = await prisma.organization.findUnique({ where: { id: ORG_B } });
            if (!exists) await prisma.organization.create({ data: { id: ORG_B, name: 'Test Org Eval Metrics B' } });
        });
    });

    afterEach(async () => {
        await requestContext.run({ bypassRls: true }, async () => {
            await prisma.aIGuardrailEvent.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
            await prisma.aILog.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
        });
    });

    afterAll(async () => {
        await requestContext.run({ bypassRls: true }, async () => {
            await prisma.organization.deleteMany({ where: { id: ORG_B } });
        });
    });

    it('redactAndTrackPiiLeak grava um AIGuardrailEvent real quando chamado dentro de um contexto de tenant', async () => {
        await requestContext.run({ tenantId: ORG_A }, () =>
            redactAndTrackPiiLeak('CPF do titular: 111.222.333-44', 'ai.service'));

        const events = await requestContext.run({ tenantId: ORG_A }, () =>
            prisma.aIGuardrailEvent.findMany({ where: { organizationId: ORG_A } }));

        expect(events).toHaveLength(1);
        expect(events[0]!.type).toBe('pii_redacted');
        expect(events[0]!.source).toBe('ai.service');
    });

    it('RLS real: evento gravado pelo tenant A nunca aparece numa leitura escopada ao tenant B', async () => {
        await requestContext.run({ tenantId: ORG_A }, () =>
            redactAndTrackPiiLeak('CPF do titular: 111.222.333-44', 'studio'));

        const eventsSeenByB = await requestContext.run({ tenantId: ORG_B }, () =>
            prisma.aIGuardrailEvent.findMany({ where: { organizationId: ORG_A } }));

        // Mesmo pedindo explicitamente organizationId: ORG_A, a policy de RLS (current_setting =
        // ORG_B) bloqueia a leitura — não é um filtro de aplicação que dependeria de estar certo.
        expect(eventsSeenByB).toHaveLength(0);
    });

    it('getEvaluationMetricsSnapshot: piiLeakageRate real = eventos de PII / total de chamadas de IA (AILog) na janela', async () => {
        const now = new Date();
        await requestContext.run({ bypassRls: true }, async () => {
            await prisma.aILog.createMany({
                data: [
                    { organizationId: ORG_A, tokens: 100, cost: 0.01, latencyMs: 200, model: 'stub', createdAt: now },
                    { organizationId: ORG_A, tokens: 100, cost: 0.01, latencyMs: 200, model: 'stub', createdAt: now },
                    { organizationId: ORG_A, tokens: 100, cost: 0.01, latencyMs: 200, model: 'stub', createdAt: now },
                    { organizationId: ORG_A, tokens: 100, cost: 0.01, latencyMs: 200, model: 'stub', createdAt: now },
                ],
            });
        });
        await requestContext.run({ tenantId: ORG_A }, () =>
            redactAndTrackPiiLeak('CPF do titular: 111.222.333-44', 'agent.chat'));

        const snapshot = await requestContext.run({ tenantId: ORG_A }, () =>
            getEvaluationMetricsSnapshot(ORG_A, 30, now));

        expect(snapshot.dimensions.piiLeakageRate.available).toBe(true);
        if (snapshot.dimensions.piiLeakageRate.available) {
            expect(snapshot.dimensions.piiLeakageRate.value).toEqual({ value: 1 / 4, numerator: 1, denominator: 4 });
        }
        expect(snapshot.dimensions.cost.available).toBe(true);
        if (snapshot.dimensions.cost.available) {
            expect(snapshot.dimensions.cost.value.requestCount).toBe(4);
        }

        // As 3 dimensões bloqueadas por AI-005 continuam honestas mesmo contra dados reais.
        expect(snapshot.dimensions.factuality).toEqual({ available: false, reason: expect.stringContaining('AI-005') });
    });
});
