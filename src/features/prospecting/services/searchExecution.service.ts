import { createId } from '@paralleldrive/cuid2';
import { Prisma } from '@prisma/client';
import { logger } from '../../../lib/logger.js';
import { prisma } from '../../../lib/prisma.js';
import { getCostPerCallUsd, type ProspectingCostProvider } from './providerCostMetrics.js';

/**
 * Onda 42 (dossiê CPI, DEC-13, opção A): hoje não existe um identificador de EXECUÇÃO de busca que
 * amarre critério → providers chamados → resultados → custo → timestamps, de ponta a ponta, para
 * auditoria/replay. `SavedSearch` (schema.prisma) só guarda o FILTRO salvo para reexecutar depois,
 * nunca um histórico de cada execução individual. Este módulo introduz o "Search-ID": um cuid
 * gerado no INÍCIO de toda execução real de `discoverCandidates` (prospecting.service.ts), que
 * acompanha os logs estruturados da execução inteira e é persistido ao final (sucesso ou erro) no
 * model `ProspectingSearchExecution`.
 *
 * IMPORTANTE — model ainda não migrado: `prisma/schema.prisma` e as migrations são arquivos de
 * dono único (não editados diretamente por este agente). O model completo está proposto em
 * `.agents/handoffs/onda-42/06-para-00-model-search-execution.md`, junto com a policy de RLS
 * (`tenant_isolation_policy`) que a migration precisa trazer. Até essa migration ser aplicada,
 * `prisma.prospectingSearchExecution` NÃO existe na Prisma Client gerada — `searchExecutionDelegate()`
 * abaixo é um cast controlado para o shape proposto, só para este arquivo poder ser escrito com o
 * código Prisma "real" (mesmos nomes de campo do handoff) sem quebrar `tsc --noEmit` enquanto o
 * model não existe. Assim que a migration for aplicada e `prisma generate` rodar de novo: apague
 * `ProspectingSearchExecutionRecord`/`ProspectingSearchExecutionDelegate`/`searchExecutionDelegate`
 * abaixo e troque toda chamada por `prisma.prospectingSearchExecution` direto (tipos gerados).
 */

export type SearchExecutionStatus = 'success' | 'partial' | 'error';
export type SearchExecutionProviderCallStatus = 'ok' | 'error';

export interface SearchExecutionProviderCall {
    /** 'apollo' | 'hunter' | 'google_places' | 'nominatim' | 'receita_federal' | 'news_search' —
     * texto livre de propósito (não enum): novo provider entra sem migration nova, só um novo
     * ponto de chamada em `recordProviderCall`. */
    provider: string;
    /** Ordem de chamada dentro desta execução (1-based). Chamadas paralelas (ex.: Apollo/Google
     * Places/Nominatim na fase de descoberta) recebem ordem pela ordem de CONCLUSÃO, não de
     * disparo — a única ordem observável de fora sem instrumentar o `fetch` em si. */
    order: number;
    resultCount: number;
    /** Estimativa conservadora por chamada, reaproveitada de `providerCostMetrics.ts`
     * (`getCostPerCallUsd`) — só > 0 quando `status: 'ok'` e o provider é faturável (apollo/hunter).
     * Mesma ressalva documentada lá: NÃO é o valor exato faturado, é um piso para tornar o gasto
     * observável por execução. */
    costUsd: number;
    status: SearchExecutionProviderCallStatus;
    errorMessage?: string;
}

/** Espelha o model `ProspectingSearchExecution` proposto no handoff (ver cabeçalho do arquivo). */
export interface ProspectingSearchExecutionRecord {
    id: string;
    organizationId: string;
    savedSearchId: string | null;
    /** Mesmo formato de `SavedSearch.criteria` (JSON livre — `ProspectCriteria` serializado). */
    criteria: Prisma.JsonValue;
    providerMode: string;
    /** `SearchExecutionProviderCall[]` serializado. */
    providersCalled: Prisma.JsonValue;
    totalResults: number;
    costUsd: number;
    status: string;
    errorMessage: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    durationMs: number | null;
    createdAt: Date;
    updatedAt: Date;
}

type ProspectingSearchExecutionCreateData = Omit<ProspectingSearchExecutionRecord, 'createdAt' | 'updatedAt'>;

interface ProspectingSearchExecutionDelegate {
    create(args: { data: ProspectingSearchExecutionCreateData }): Promise<ProspectingSearchExecutionRecord>;
    findFirst(args: { where: { id: string; organizationId: string } }): Promise<ProspectingSearchExecutionRecord | null>;
}

/** Ver nota "IMPORTANTE" no topo do arquivo — remover este cast assim que o model existir na
 * Prisma Client gerada. */
function searchExecutionDelegate(): ProspectingSearchExecutionDelegate {
    return (prisma as unknown as { prospectingSearchExecution: ProspectingSearchExecutionDelegate })
        .prospectingSearchExecution;
}

const BILLABLE_PROVIDERS = new Set<ProspectingCostProvider>(['apollo', 'hunter']);

function isBillableProvider(provider: string): provider is ProspectingCostProvider {
    return BILLABLE_PROVIDERS.has(provider as ProspectingCostProvider);
}

/**
 * Acumula, ao longo de UMA execução real de `discoverCandidates`, tudo que o Search-ID precisa
 * amarrar — critério usado, providers chamados (em ordem, com contagem de resultado e custo) e o
 * total gasto — e persiste um registro único ao final (sucesso ou erro).
 *
 * Construído no INÍCIO da execução (antes de qualquer chamada a provider), para que o Search-ID já
 * exista e possa ser propagado nos logs estruturados da execução inteira mesmo que a busca falhe
 * antes de qualquer persistência real.
 */
export class SearchExecutionTracker {
    readonly searchId: string;
    private readonly organizationId?: string;
    private readonly savedSearchId: string | null;
    private readonly criteria: unknown;
    private readonly providerMode: string;
    private readonly startedAt: Date;
    private readonly calls: SearchExecutionProviderCall[] = [];
    private finished = false;

    constructor(params: {
        organizationId?: string;
        savedSearchId?: string | null;
        criteria: unknown;
        providerMode: string;
    }) {
        this.searchId = createId();
        this.organizationId = params.organizationId;
        this.savedSearchId = params.savedSearchId ?? null;
        this.criteria = params.criteria;
        this.providerMode = params.providerMode;
        this.startedAt = new Date();
        logger.info(
            {
                searchId: this.searchId,
                organizationId: this.organizationId,
                savedSearchId: this.savedSearchId,
                providerMode: this.providerMode,
            },
            'Execução de busca de prospecção iniciada'
        );
    }

    /**
     * Registra UMA chamada real (bem ou malsucedida) a um provider dentro desta execução. Chame
     * sempre depois de saber o resultado da chamada (nunca antes, mesmo princípio já documentado em
     * `providerCostMetrics.ts::recordProviderCallCost`) — uma chamada bloqueada por rate limit ou
     * nunca disparada não é uma chamada real.
     */
    recordProviderCall(input: {
        provider: string;
        resultCount: number;
        status?: SearchExecutionProviderCallStatus;
        errorMessage?: string;
    }): void {
        const status = input.status ?? 'ok';
        const costUsd = status === 'ok' && isBillableProvider(input.provider)
            ? getCostPerCallUsd(input.provider)
            : 0;
        const call: SearchExecutionProviderCall = {
            provider: input.provider,
            order: this.calls.length + 1,
            resultCount: input.resultCount,
            costUsd,
            status,
            errorMessage: input.errorMessage,
        };
        this.calls.push(call);
        logger.info(
            { searchId: this.searchId, ...call },
            `Provider "${call.provider}" chamado na execução de busca (Search-ID ${this.searchId})`
        );
    }

    /** Custo acumulado (USD) de todas as chamadas registradas até agora nesta execução. */
    get totalCostUsd(): number {
        // Arredonda a 6 casas — soma de floats pode gerar ruído tipo 0.030000000000000002.
        return Math.round(this.calls.reduce((sum, c) => sum + c.costUsd, 0) * 1e6) / 1e6;
    }

    get providerCalls(): SearchExecutionProviderCall[] {
        return [...this.calls];
    }

    /**
     * Persiste o registro final — chamado exatamente uma vez, sempre no `finally` (ou equivalente)
     * de `discoverCandidates`, tanto no caminho de sucesso quanto no de erro. Nunca lança:
     * rastreabilidade é um extra sobre uma busca que já rodou de verdade — sua falha de persistência
     * não pode derrubar a resposta ao usuário (mesmo princípio já usado em
     * `promoteToCrm`/`enrichCompany` para o enriquecimento automático).
     *
     * Sem `organizationId` conhecido (ex.: chamada de teste unitário sem tenant, ou uma ferramenta
     * standalone que não passa organização) não há RLS para escopar a escrita — não persiste, só
     * loga o desfecho.
     */
    async finish(input: { status: SearchExecutionStatus; totalResults: number; errorMessage?: string }): Promise<void> {
        if (this.finished) return;
        this.finished = true;

        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - this.startedAt.getTime();
        const costUsd = this.totalCostUsd;

        logger.info(
            {
                searchId: this.searchId,
                organizationId: this.organizationId,
                status: input.status,
                totalResults: input.totalResults,
                providerCalls: this.calls.length,
                costUsd,
                durationMs,
            },
            'Execução de busca de prospecção finalizada'
        );

        if (!this.organizationId) return;

        try {
            await searchExecutionDelegate().create({
                data: {
                    id: this.searchId,
                    organizationId: this.organizationId,
                    savedSearchId: this.savedSearchId,
                    criteria: this.criteria as Prisma.JsonValue,
                    providerMode: this.providerMode,
                    providersCalled: this.calls as unknown as Prisma.JsonValue,
                    totalResults: input.totalResults,
                    costUsd,
                    status: input.status,
                    errorMessage: input.errorMessage ?? null,
                    startedAt: this.startedAt,
                    finishedAt,
                    durationMs,
                },
            });
        } catch (error) {
            logger.error(
                { err: error, searchId: this.searchId },
                'Falha ao persistir ProspectingSearchExecution — Search-ID segue válido nos logs, só a auditoria persistida falhou'
            );
        }
    }
}

/**
 * Leitura de uma execução de busca para `GET /api/prospecting/searches/:searchId` — sempre
 * escopada por `organizationId` explícito (defesa em profundidade, mesmo padrão já usado por
 * `findExistingCompany`/`prospectRejection` no resto deste módulo), além da RLS real que a
 * migration do model deve trazer (ver handoff). Nunca lança: um erro de leitura vira 404/log, não
 * um 500 que expõe detalhe interno.
 */
export async function findSearchExecution(
    searchId: string,
    organizationId: string
): Promise<ProspectingSearchExecutionRecord | null> {
    try {
        return await searchExecutionDelegate().findFirst({ where: { id: searchId, organizationId } });
    } catch (error) {
        logger.error({ err: error, searchId, organizationId }, 'Falha ao buscar ProspectingSearchExecution');
        return null;
    }
}
