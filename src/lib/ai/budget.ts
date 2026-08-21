import { prisma } from '../prisma.js';
import { logger } from '../logger.js';
import { requestContext } from '../async-context.js';
import { cacheConnection } from '../queue/redis.js';
import { env } from '../../config/env.js';
import { recordAiBudgetBlocked } from './metrics.js';

/**
 * Circuit breaker de orçamento mensal de IA (AI-011). Diferente do circuit breaker por provedor
 * (mais acima em gateway.ts, que reage a falhas de rede/HTTP de um provedor específico), este
 * reage ao CUSTO acumulado do mês corrente — não à confiabilidade de um provedor.
 *
 * Decisão de produto já tomada nesta rodada (docs/AI-SWARM-GOVERNANCE-AUDIT.md, item AI-011, que
 * deixava em aberto "o que 'cortar' significa"): exceder o teto BLOQUEIA novas chamadas de IA, não
 * degrada para outro modelo nem só notifica.
 *
 * Orçamento é GLOBAL (soma de todas as organizações), não por tenant: `AI_MONTHLY_BUDGET_USD` já é
 * hoje um único valor escalar (ao contrário de outros pares flag+allowlist-por-organização deste
 * repo, como SWARM_SCHEDULER_ORGANIZATIONS) — orçamento por tenant exigiria uma coluna/tabela nova,
 * fora do escopo desta correção.
 */

const CACHE_KEY = 'ai-gateway:budget:month-cost-usd';
const CACHE_TTL_SECONDS = 60;

interface LocalCacheState {
    value: number;
    expiresAt: number;
}
let localCacheFallback: LocalCacheState | null = null;

/** Só para testes: limpa o cache do custo mensal (Redis e o fallback local) entre casos. */
export async function __resetAiBudgetCacheForTests(): Promise<void> {
    localCacheFallback = null;
    try {
        await cacheConnection.del(CACHE_KEY);
    } catch {
        // Redis indisponível — só o fallback local importava mesmo, e já foi limpo acima.
    }
}

function currentMonthStart(): Date {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Soma real de `AILog.cost` do mês corrente em TODAS as organizações — mesma fonte de verdade de
 * `usageService.summary` (que soma por uma organização), mas sem filtro de tenant, por isso precisa
 * do bypass de RLS (AILog em BYPASS_RLS_ALLOWED_MODELS, src/lib/prisma.ts). Pode lançar se o
 * Postgres estiver indisponível — quem chama decide como reagir a isso.
 */
async function computeMonthCostUsd(): Promise<number> {
    const result = await requestContext.run({ bypassRls: true }, () =>
        prisma.aILog.aggregate({
            where: { createdAt: { gte: currentMonthStart() } },
            _sum: { cost: true },
        }),
    );
    return result._sum.cost ?? 0;
}

/**
 * Custo do mês corrente, cacheado por até CACHE_TTL_SECONDS (Redis, com fallback em memória local
 * se o Redis estiver indisponível — mesmo padrão do circuit breaker por provedor em gateway.ts):
 * evita um aggregate no Postgres por CHAMADA de IA (o gateway é invocado com alta frequência por
 * missões do enxame), mantendo o teto reativo em segundos, não minutos.
 *
 * Falha ao CALCULAR o custo (Postgres indisponível) nunca bloqueia uma chamada de IA por conta
 * própria — é tratada como "custo desconhecido", não como "orçamento excedido": um Postgres
 * temporariamente fora do ar não deveria ter um raio de impacto maior (derrubar toda a superfície
 * de IA do produto) do que o problema que este circuit breaker existe para prevenir.
 */
export async function getMonthCostUsd(): Promise<number> {
    try {
        const cached = await cacheConnection.get(CACHE_KEY);
        if (cached !== null) return Number(cached);
    } catch (err) {
        logger.warn({ err }, '[AI Budget] Redis indisponível ao ler cache, recalculando direto do Postgres');
    }

    const now = Date.now();
    if (localCacheFallback && localCacheFallback.expiresAt > now) return localCacheFallback.value;

    let fresh: number;
    try {
        fresh = await computeMonthCostUsd();
    } catch (err) {
        logger.warn({ err }, '[AI Budget] Falha ao calcular custo do mês (Postgres indisponível) — tratando como custo desconhecido, não como orçamento excedido');
        return 0;
    }

    localCacheFallback = { value: fresh, expiresAt: now + CACHE_TTL_SECONDS * 1000 };
    try {
        await cacheConnection.set(CACHE_KEY, fresh.toString(), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
        logger.warn({ err }, '[AI Budget] Redis indisponível ao gravar cache — fallback em memória local já cobre a janela');
    }
    return fresh;
}

export class AiBudgetExceededError extends Error {
    constructor(public readonly monthCostUsd: number, public readonly budgetUsd: number) {
        super(
            `Orçamento mensal de IA excedido (US$ ${monthCostUsd.toFixed(2)} de US$ ${budgetUsd.toFixed(2)}). ` +
            'Novas chamadas de IA estão bloqueadas até o início do próximo mês ou até o teto ' +
            '(AI_MONTHLY_BUDGET_USD) ser aumentado.',
        );
        this.name = 'AiBudgetExceededError';
    }
}

/**
 * Ponto único de checagem, chamado antes de QUALQUER chamada de IA — `getAiModel().invoke()`
 * (gateway.ts) e `BaseAgent.runWithTools()` (base.agent.ts), os dois caminhos reais de saída para
 * um provedor (ver docs/AI-SWARM-GOVERNANCE-AUDIT.md, AI-011). Sem `AI_MONTHLY_BUDGET_USD`
 * configurada, é sempre um no-op — mesmo comportamento "sem teto" que a métrica passiva já tinha,
 * não inventa um teto implícito.
 */
export async function assertAiBudgetNotExceeded(): Promise<void> {
    if (env.AI_MONTHLY_BUDGET_USD === undefined) return;
    const monthCostUsd = await getMonthCostUsd();
    if (monthCostUsd >= env.AI_MONTHLY_BUDGET_USD) {
        recordAiBudgetBlocked();
        throw new AiBudgetExceededError(monthCostUsd, env.AI_MONTHLY_BUDGET_USD);
    }
}
