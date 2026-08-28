import client from 'prom-client';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { getTenantId } from '../../../lib/async-context.js';
import { cacheConnection, redisConfigured } from '../../../lib/queue/redis.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';

/** Providers de prospecção faturáveis — definido aqui (não em `providerCostMetrics.ts`) para
 * evitar um ciclo de import: `providerCostMetrics.ts` já depende deste arquivo em runtime
 * (`recordProspectingProviderSpend`), então a dependência do tipo segue a mesma direção.
 * `providerCostMetrics.ts` reexporta este tipo para quem já importava de lá. */
export type ProspectingCostProvider = 'apollo' | 'hunter';

/**
 * DEC-09 (dossiê CPI, onda 42, opção B escolhida pelo usuário): teto REAL (bloqueante) de gasto
 * mensal de provider de prospecção (Apollo/Hunter), por organização. Diferente de
 * `providerCostMetrics.ts` (Counter Prometheus só de observação — sem rótulo de organização nem
 * corte por mês, documentado ali como "NÃO é um teto/orçamento"), este módulo aplica o bloqueio de
 * verdade.
 *
 * Diferença deliberada em relação a `src/lib/ai/budget.ts` (o mesmo tipo de circuit breaker para
 * IA): lá, o custo acumulado por organização já existe em Postgres (`AILog.organizationId` +
 * `cost`) — só faltava a checagem. Aqui NÃO existe hoje nenhuma tabela com o custo de Apollo/Hunter
 * por organização (nem por chamada) — `providerCostMetrics.ts` só incrementa um Counter Prometheus
 * sem rótulo de tenant, que também não tem corte por mês (Counter só cresce, nunca é comparável
 * entre "este mês" e "mês passado" sem uma tabela ou reset explícito). Uma tabela Postgres nova
 * (o equivalente de AILog para custo de provider) resolveria isso com a mesma robustez do lado de
 * IA, mas exigiria uma migration de schema além dos dois campos em Organization já pedidos no
 * handoff (`.agents/handoffs/onda-42/03-para-00-campo-orcamento-organization.md`) — fora do meu
 * boundary nesta execução (não editar `prisma/schema.prisma`).
 *
 * Solução adotada enquanto essa tabela não existe: Redis (`cacheConnection`, já usado como
 * armazenamento durável — não só cache — por outros módulos deste mesmo domínio, ex. o token
 * bucket de `providerRateLimit.ts`) com uma chave por (organização, mês) incrementada via
 * `INCRBYFLOAT`. Isso é REAL bloqueio, não só observação: sobrevive a restart do processo (ao
 * contrário de um contador em memória) e é compartilhado entre todos os processos web (ao
 * contrário do Counter Prometheus, que é por processo). Quando Redis não está configurado (dev
 * local sem REDIS_URL, ou instância caída), cai para um Map em memória por processo — mesmo
 * trade-off já aceito por `providerRateLimit.ts`/`providerCache.ts` neste mesmo domínio: proteção
 * pior nesse cenário (não compartilhada entre processos, não sobrevive a restart), mas nunca o
 * motivo de um 5xx, e nunca finge ser mais durável do que é.
 *
 * Ver o handoff citado acima para a recomendação de migrar isto para uma tabela Postgres dedicada
 * assim que ela existir — o contrato público (`recordProspectingProviderSpend`,
 * `getOrgMonthProspectingCostUsd`, `assertProspectingBudgetNotExceeded`) não precisa mudar, só a
 * implementação interna.
 */

const REDIS_KEY_PREFIX = 'prospecting-budget:org:';
// ~2 meses: cobre qualquer atraso entre o fim do mês e a última leitura dele, sem deixar a chave
// viver para sempre no Redis (cada mês novo já usa uma chave própria, então a antiga só precisa
// sobreviver o suficiente para qualquer consulta tardia — nunca precisa ser lida de novo depois
// disso).
const REDIS_KEY_TTL_SECONDS = 60 * 60 * 24 * 62;

function currentMonthKey(date: Date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildKey(organizationId: string, monthKey: string = currentMonthKey()): string {
    return `${REDIS_KEY_PREFIX}${organizationId}:${monthKey}`;
}

// Fallback em memória — bounded (mesma eviction simples "mais antigo inserido" de providerCache.ts)
// para nunca crescer sem limite num processo de vida longa.
const MEMORY_MAX_ENTRIES = 1000;
const memoryTotals = new Map<string, number>();

function memoryIncr(key: string, amountUsd: number): number {
    const current = memoryTotals.get(key) ?? 0;
    const next = current + amountUsd;
    if (!memoryTotals.has(key) && memoryTotals.size >= MEMORY_MAX_ENTRIES) {
        const oldestKey = memoryTotals.keys().next().value;
        if (oldestKey !== undefined) memoryTotals.delete(oldestKey);
    }
    memoryTotals.set(key, next);
    return next;
}

/** Só para testes: limpa o fallback em memória entre casos. */
export function __resetProspectingBudgetForTests(): void {
    memoryTotals.clear();
}

/**
 * Registra `costUsd` no acumulado do mês corrente da organização (via `getTenantId()`, a menos que
 * `organizationId` seja passado explicitamente — usado pelos testes). Chamado por
 * `recordProviderCallCost` (providerCostMetrics.ts) logo depois de incrementar o Counter
 * Prometheus, sempre com o MESMO valor (mesma estimativa por chamada). Nunca lançado ao chamador
 * (best-effort: uma falha ao gravar o gasto nunca deve derrubar a resposta ao usuário que já
 * recebeu o resultado real do provider) — só logado.
 */
export async function recordProspectingProviderSpend(
    provider: ProspectingCostProvider,
    costUsd: number,
    organizationId: string | undefined = getTenantId(),
): Promise<void> {
    if (!organizationId) return; // chamada sem tenant conhecido (script/worker) — nada a debitar por organização
    if (!Number.isFinite(costUsd) || costUsd <= 0) return;

    const key = buildKey(organizationId);
    if (redisConfigured) {
        try {
            await cacheConnection.incrbyfloat(key, costUsd);
            await cacheConnection.expire(key, REDIS_KEY_TTL_SECONDS);
            return;
        } catch (err) {
            logger.warn(
                { err, organizationId, provider },
                'providerBudget: falha ao gravar gasto no Redis — usando fallback em memória só para esta chamada',
            );
        }
    }
    memoryIncr(key, costUsd);
}

/** Gasto acumulado (USD) do mês corrente de UMA organização com providers de prospecção pagos. */
export async function getOrgMonthProspectingCostUsd(organizationId: string): Promise<number> {
    const key = buildKey(organizationId);
    if (redisConfigured) {
        try {
            const raw = await cacheConnection.get(key);
            return raw != null ? Number(raw) : 0;
        } catch (err) {
            logger.warn(
                { err, organizationId },
                'providerBudget: falha ao ler gasto do Redis — tratando como custo desconhecido (nunca bloqueia por falha de leitura)',
            );
            return 0;
        }
    }
    return memoryTotals.get(key) ?? 0;
}

/**
 * Teto mensal de prospecção configurado para UMA organização
 * (`Organization.monthlyProspectingBudgetUsd`). `null`/ausente = sem teto (nunca bloqueia).
 */
async function getOrgProspectingBudgetUsd(organizationId: string): Promise<number | null> {
    try {
        const org = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { monthlyProspectingBudgetUsd: true },
        });
        return org?.monthlyProspectingBudgetUsd ?? null;
    } catch (err) {
        logger.warn(
            { err, organizationId },
            'providerBudget: falha ao ler o teto mensal de prospecção da organização — tratando como sem teto configurado',
        );
        return null;
    }
}

export const prospectingBudgetBlockedTotal = new client.Counter({
    name: 'prospecting_budget_blocked_total',
    help: 'Chamadas a providers de prospecção (Apollo/Hunter) bloqueadas pelo teto mensal por organização (DEC-09, Organization.monthlyProspectingBudgetUsd), por organização e provider.',
    labelNames: ['organization', 'provider'] as const,
});

export class ProspectingBudgetExceededError extends AppError {
    constructor(
        public readonly organizationId: string,
        public readonly provider: ProspectingCostProvider,
        public readonly monthCostUsd: number,
        public readonly budgetUsd: number,
    ) {
        super(
            `Orçamento mensal de prospecção (Apollo/Hunter) desta organização foi atingido ` +
            `(US$ ${monthCostUsd.toFixed(2)} de US$ ${budgetUsd.toFixed(2)}). Novas buscas em providers pagos de ` +
            'prospecção estão bloqueadas para esta organização até o início do próximo mês ou até o teto mensal ' +
            'de prospecção da organização ser aumentado.',
            429,
        );
        this.name = 'ProspectingBudgetExceededError';
    }
}

/**
 * Ponto único de checagem, chamado ANTES de qualquer chamada de rede real a Apollo/Hunter — mesmo
 * lugar (e mesma forma "cheque, então retorne/lance cedo") onde `checkProviderRateLimit` já é
 * checado em cada um dos 7 pontos de chamada reais (apollo/organizationSearch.ts,
 * apollo/organizationEnrich.ts, apollo/people.ts ×3, hunter.service.ts ×2).
 *
 * Fail-OPEN (nunca bloqueia) quando: (a) não há organização conhecida no `requestContext` —
 * chamada de worker/script sem tenant; ou (b) a organização não tem teto configurado
 * (`monthlyProspectingBudgetUsd` nulo — nullable significa SEM LIMITE, nunca um teto implícito de
 * US$0). Fail-CLOSED (bloqueia, lançando `ProspectingBudgetExceededError`) só quando um teto real
 * está configurado E foi atingido/excedido — mesma decisão de segurança/produto documentada (e
 * pendente de confirmação) no handoff citado acima, espelhando `assertAiBudgetNotExceeded`.
 */
export async function assertProspectingBudgetNotExceeded(provider: ProspectingCostProvider): Promise<void> {
    const organizationId = getTenantId();
    if (!organizationId) return;

    const budgetUsd = await getOrgProspectingBudgetUsd(organizationId);
    if (budgetUsd === null) return;

    const monthCostUsd = await getOrgMonthProspectingCostUsd(organizationId);
    if (monthCostUsd >= budgetUsd) {
        prospectingBudgetBlockedTotal.inc({ organization: organizationId, provider });
        throw new ProspectingBudgetExceededError(organizationId, provider, monthCostUsd, budgetUsd);
    }
}
