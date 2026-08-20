import { prisma } from '../../../lib/prisma.js';
import { getSwarmSloSnapshot, emptyRate, type SloRate } from './swarmScheduler.service.js';

/**
 * AI-006 (onda 35): harness real das 9 dimensões de avaliação do enxame de IA
 * (`SPRINT-07-IA-ENXAME-EVALUATION.md`). Antes desta correção só 3/9 existiam (cost, latency,
 * human override — via `getSwarmSloSnapshot`/`AILog`); as outras 6 não tinham nada.
 *
 * Esta correção fecha 3 a mais com dado real de produção (fallback rate, tool correctness —
 * proxy —, PII leakage rate — proxy) e reporta as 3 restantes (factualidade, aderência ao
 * playbook, hallucination) como EXPLICITAMENTE indisponíveis — nunca um número fabricado. Essas
 * 3 exigem uma resposta de referência para comparar (o Golden Dataset de AI-005, que ainda não
 * existe) — não são "0" nem "não medido silenciosamente", são um estado reportado com o motivo.
 */

const AI005_BLOCKED_REASON =
    'Requer AI-005 (Golden Dataset) — nenhuma resposta de referência existe hoje para comparar contra o que a IA gerou.';

export interface AvailableMetric<T> {
    available: true;
    value: T;
    /** Ressalva sobre cobertura/precisão do dado — ex.: "proxy", "só cobre um fluxo". */
    note?: string;
}

export interface UnavailableMetric {
    available: false;
    reason: string;
}

export type Metric<T> = AvailableMetric<T> | UnavailableMetric;

function available<T>(value: T, note?: string): AvailableMetric<T> {
    return note ? { available: true, value, note } : { available: true, value };
}

function unavailable(reason: string): UnavailableMetric {
    return { available: false, reason };
}

export interface EvaluationMetricsSnapshot {
    organizationId: string;
    windowDays: number;
    generatedAt: string;
    dimensions: {
        cost: Metric<{ totalCostUsd: number; totalTokens: number; requestCount: number }>;
        latency: Metric<{ avgLatencyMs: number | null }>;
        humanOverride: Metric<SloRate>;
        fallbackRate: Metric<SloRate>;
        toolCorrectness: Metric<SloRate>;
        piiLeakageRate: Metric<SloRate>;
        factuality: UnavailableMetric;
        playbookAdherence: UnavailableMetric;
        hallucination: UnavailableMetric;
    };
}

/**
 * Snapshot das 9 dimensões de avaliação do enxame para uma organização, na janela solicitada.
 * Reaproveita `getSwarmSloSnapshot` (AI-009) para cost/latency/humanOverride/toolCorrectness —
 * não reimplementa a mesma agregação de `AIPendingAction`/`AILog` que ela já faz corretamente.
 */
export async function getEvaluationMetricsSnapshot(
    organizationId: string,
    windowDays = 30,
    now: Date = new Date(),
): Promise<EvaluationMetricsSnapshot> {
    const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const [sloSnapshot, aiLogRequestCount, piiRedactionCount, sdrOutboundActions] = await Promise.all([
        getSwarmSloSnapshot(organizationId, windowDays, now),
        prisma.aILog.count({ where: { organizationId, createdAt: { gte: since } } }),
        prisma.aIGuardrailEvent.count({ where: { organizationId, type: 'pii_redacted', createdAt: { gte: since } } }),
        // AI-004 (onda-20): hoje só SDROutboundDraftAgent grava `structuredOutputValid` no payload
        // de AIPendingAction — nenhum outro agente do enxame emite structured output com esse
        // contrato. fallbackRate abaixo é honesto sobre essa cobertura parcial, não a esconde.
        prisma.aIPendingAction.findMany({
            where: { organizationId, action: 'send_email', createdAt: { gte: since } },
            select: { payload: true },
        }),
    ]);

    // Agrega humanOverride/toolCorrectness (proxy de errorRate) através dos papéis com ledger —
    // OPS não tem AIPendingAction (executa direto), já vem como estado vazio de getSwarmSloSnapshot.
    const ledgerAgents = sloSnapshot.agents.filter((agent) => agent.role !== 'OPS');
    const humanOverride = emptyRate(
        ledgerAgents.reduce((sum, agent) => sum + agent.humanOverride.numerator, 0),
        ledgerAgents.reduce((sum, agent) => sum + agent.humanOverride.denominator, 0),
        'Nenhuma decisão do enxame foi aprovada ou descartada por um humano ainda nesta janela.',
    );
    const errorDenominator = ledgerAgents.reduce((sum, agent) => sum + agent.errorRate.denominator, 0);
    const errorNumerator = ledgerAgents.reduce((sum, agent) => sum + agent.errorRate.numerator, 0);
    const toolCorrectness = emptyRate(
        errorDenominator - errorNumerator,
        errorDenominator,
        'Nenhuma execução foi tentada pelo enxame ainda nesta janela.',
    );

    const structuredOutputFlags = sdrOutboundActions
        .map((action) => (action.payload as { structuredOutputValid?: unknown } | null)?.structuredOutputValid)
        .filter((flag): flag is boolean => typeof flag === 'boolean');
    const fallbackRate = emptyRate(
        structuredOutputFlags.filter((valid) => !valid).length,
        structuredOutputFlags.length,
        'Nenhum rascunho de e-mail do SDR Outbound foi gerado ainda nesta janela.',
    );

    const piiLeakageRate = emptyRate(
        piiRedactionCount,
        aiLogRequestCount,
        'Nenhuma chamada de IA registrada ainda nesta janela.',
    );

    return {
        organizationId,
        windowDays,
        generatedAt: now.toISOString(),
        dimensions: {
            cost: available({
                totalCostUsd: sloSnapshot.cost.totalCostUsd,
                totalTokens: sloSnapshot.cost.totalTokens,
                requestCount: sloSnapshot.cost.requestCount,
            }),
            latency: available({ avgLatencyMs: sloSnapshot.cost.avgLatencyMs }),
            humanOverride: available(humanOverride),
            fallbackRate: available(
                fallbackRate,
                'Cobertura parcial: hoje só o SDR Outbound (AI-004) registra se a saída estruturada foi validada; os demais agentes do enxame ainda não emitem esse dado.',
            ),
            toolCorrectness: available(
                toolCorrectness,
                'Proxy: taxa de execução sem erro operacional (AIPendingAction.executionError), não corretude semântica real da ação escolhida — isso exige comparar contra a ação esperada (AI-005).',
            ),
            piiLeakageRate: available(
                piiLeakageRate,
                'Proxy: taxa de respostas de IA em que o guardrail de saída (redactSensitiveData) precisou mascarar um CPF — mede o que o guardrail já pegou, não vazamentos que ele não detecta.',
            ),
            factuality: unavailable(AI005_BLOCKED_REASON),
            playbookAdherence: unavailable(AI005_BLOCKED_REASON),
            hallucination: unavailable(AI005_BLOCKED_REASON),
        },
    };
}
