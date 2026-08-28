import { prisma } from '../prisma.js';
import { logger } from '../logger.js';
import { requestContext } from '../async-context.js';
import { cacheConnection } from '../queue/redis.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/middlewares/errorHandler.js';
import { recordAiBudgetBlocked, recordOrgAiBudgetBlocked } from './metrics.js';

/**
 * Circuit breaker de orçamento mensal de IA (AI-011). Diferente do circuit breaker por provedor
 * (mais acima em gateway.ts, que reage a falhas de rede/HTTP de um provedor específico), este
 * reage ao CUSTO acumulado do mês corrente — não à confiabilidade de um provedor.
 *
 * Decisão de produto já tomada nesta rodada (docs/AI-SWARM-GOVERNANCE-AUDIT.md, item AI-011, que
 * deixava em aberto "o que 'cortar' significa"): exceder o teto BLOQUEIA novas chamadas de IA, não
 * degrada para outro modelo nem só notifica.
 *
 * O teto descrito acima (`AI_MONTHLY_BUDGET_USD`) é GLOBAL (soma de todas as organizações), não por
 * tenant — continua existindo tal como foi implementado em AI-011. Desde DEC-09 (onda 42, ver
 * seção "Orçamento por organização" mais abaixo) ele passou a coexistir com um segundo teto, esse
 * sim por tenant (`Organization.monthlyAiBudgetUsd`).
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

// ─── Orçamento por organização (DEC-09, onda 42) ───────────────────────────────────────────────
//
// Diferente do teto global acima (uma única leitura agregada, cross-tenant, exigindo o bypass de
// RLS documentado no topo do arquivo), o teto por organização é uma leitura ESCOPADA à própria
// organização — roda dentro do `requestContext` já ativo da chamada (tenantId == organizationId
// sendo checado), então RLS comum já restringe a leitura sem precisar de bypass nenhum: mesmo
// padrão já usado por `usageService.summary()` (src/features/billing/usage.service.ts).
//
// Qualquer erro de leitura (Postgres indisponível) é tratado como "sem teto configurado" —
// fail-OPEN nesse erro, nunca um teto implícito.

const ORG_CACHE_KEY_PREFIX = 'ai-gateway:budget:org:';
const ORG_CACHE_TTL_SECONDS = 60;

interface LocalOrgCacheState {
    value: number;
    expiresAt: number;
}
const localOrgCostCache = new Map<string, LocalOrgCacheState>();

/** Só para testes: limpa o fallback em memória por organização entre casos. */
export function __resetOrgAiBudgetCacheForTests(): void {
    localOrgCostCache.clear();
}

function currentMonthKey(date: Date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Soma real de `AILog.cost` do mês corrente de UMA organização — mesma fonte de verdade que
 * `usageService.summary`, mas só o número que a checagem de orçamento precisa. Escopada por
 * `organizationId` explícito (nunca vaza custo de outro tenant) e por `createdAt >= início do mês
 * corrente` (nunca herda custo de um mês anterior).
 */
async function computeOrgMonthCostUsd(organizationId: string): Promise<number> {
    const result = await prisma.aILog.aggregate({
        where: { organizationId, createdAt: { gte: currentMonthStart() } },
        _sum: { cost: true },
    });
    return result._sum.cost ?? 0;
}

/**
 * Custo do mês corrente de UMA organização, cacheado por até ORG_CACHE_TTL_SECONDS — mesmo
 * raciocínio de `getMonthCostUsd` (evita um aggregate no Postgres por chamada de IA), mas chaveado
 * por organização E por mês (`YYYY-MM` na própria chave), então a virada do mês nunca mistura o
 * total antigo com o novo: o primeiro check do mês novo simplesmente recalcula do zero.
 */
async function getOrgMonthCostUsd(organizationId: string): Promise<number> {
    const cacheKey = `${ORG_CACHE_KEY_PREFIX}${organizationId}:${currentMonthKey()}`;
    try {
        const cached = await cacheConnection.get(cacheKey);
        if (cached !== null) return Number(cached);
    } catch (err) {
        logger.warn({ err, organizationId }, '[AI Budget] Redis indisponível ao ler cache por organização, recalculando direto do Postgres');
    }

    const now = Date.now();
    const local = localOrgCostCache.get(cacheKey);
    if (local && local.expiresAt > now) return local.value;

    let fresh: number;
    try {
        fresh = await computeOrgMonthCostUsd(organizationId);
    } catch (err) {
        logger.warn({ err, organizationId }, '[AI Budget] Falha ao calcular custo do mês da organização (Postgres indisponível) — tratando como custo desconhecido, não como orçamento excedido');
        return 0;
    }

    localOrgCostCache.set(cacheKey, { value: fresh, expiresAt: now + ORG_CACHE_TTL_SECONDS * 1000 });
    try {
        await cacheConnection.set(cacheKey, fresh.toString(), 'EX', ORG_CACHE_TTL_SECONDS);
    } catch (err) {
        logger.warn({ err, organizationId }, '[AI Budget] Redis indisponível ao gravar cache por organização — fallback em memória local já cobre a janela');
    }
    return fresh;
}

/**
 * Teto mensal de IA configurado para UMA organização. `null`/ausente = sem teto (nunca bloqueia).
 */
async function getOrgAiBudgetUsd(organizationId: string): Promise<number | null> {
    try {
        const org = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { monthlyAiBudgetUsd: true },
        });
        return org?.monthlyAiBudgetUsd ?? null;
    } catch (err) {
        logger.warn({ err, organizationId }, '[AI Budget] Falha ao ler o teto mensal de IA da organização — tratando como sem teto configurado');
        return null;
    }
}

export class AiOrgBudgetExceededError extends AppError {
    constructor(
        public readonly organizationId: string,
        public readonly monthCostUsd: number,
        public readonly budgetUsd: number,
    ) {
        super(
            `Orçamento mensal de IA desta organização foi atingido (US$ ${monthCostUsd.toFixed(2)} de US$ ${budgetUsd.toFixed(2)}). ` +
            'Novas chamadas de IA estão bloqueadas para esta organização até o início do próximo mês ou até o teto ' +
            'mensal de IA da organização ser aumentado.',
            429,
        );
        this.name = 'AiOrgBudgetExceededError';
    }
}

/**
 * DEC-09 (dossiê CPI, onda 42, opção B escolhida pelo usuário): teto REAL por organização, além do
 * teto global de plataforma já existente (AI-011, acima). Chamada de dentro de
 * `assertAiBudgetNotExceeded` — os mesmos 3 pontos de chamada reais (gateway/chat-model.ts,
 * gateway/streaming.ts, base.agent.ts::runWithTools) ganham a checagem por organização
 * automaticamente, sem precisar tocar em nenhum deles.
 *
 * Fail-OPEN (nunca bloqueia) quando: (a) não há organização conhecida no `requestContext` —
 * chamada de worker/script sem tenant, mesmo tratamento que `AILog.organizationId` nulo já recebe
 * hoje; ou (b) a organização não tem teto configurado (`monthlyAiBudgetUsd` nulo — nullable
 * significa SEM LIMITE, nunca um teto implícito de US$0). Fail-CLOSED (bloqueia) só quando um teto
 * real está configurado E foi atingido/excedido — essa é a decisão de segurança/produto registrada
 * no handoff (`.agents/handoffs/onda-42/03-para-00-campo-orcamento-organization.md`) para
 * confirmação.
 */
async function assertOrgAiBudgetNotExceeded(): Promise<void> {
    const organizationId = requestContext.getStore()?.tenantId;
    if (!organizationId) return;

    const budgetUsd = await getOrgAiBudgetUsd(organizationId);
    if (budgetUsd === null) return;

    const monthCostUsd = await getOrgMonthCostUsd(organizationId);
    if (monthCostUsd >= budgetUsd) {
        recordOrgAiBudgetBlocked(organizationId);
        throw new AiOrgBudgetExceededError(organizationId, monthCostUsd, budgetUsd);
    }
}

/**
 * Ponto único de checagem, chamado antes de QUALQUER chamada de IA — `getAiModel().invoke()`
 * (gateway.ts) e `BaseAgent.runWithTools()` (base.agent.ts), os dois caminhos reais de saída para
 * um provedor (ver docs/AI-SWARM-GOVERNANCE-AUDIT.md, AI-011). Verifica primeiro o teto POR
 * ORGANIZAÇÃO (mais específico, acionável pelo próprio tenant) e só depois o teto GLOBAL de
 * plataforma. Sem `AI_MONTHLY_BUDGET_USD` configurada, a parte global é sempre um no-op — mesmo
 * comportamento "sem teto" que a métrica passiva já tinha, não inventa um teto implícito.
 */
export async function assertAiBudgetNotExceeded(): Promise<void> {
    await assertOrgAiBudgetNotExceeded();

    if (env.AI_MONTHLY_BUDGET_USD === undefined) return;
    const monthCostUsd = await getMonthCostUsd();
    if (monthCostUsd >= env.AI_MONTHLY_BUDGET_USD) {
        recordAiBudgetBlocked();
        throw new AiBudgetExceededError(monthCostUsd, env.AI_MONTHLY_BUDGET_USD);
    }
}
