import { Worker, Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../../lib/prisma.js';
import { logger } from '../../../../lib/logger.js';
import { connection } from '../../../../lib/queue/redis.js';
import { recordDeadLetter, isFinalAttempt } from '../../../../lib/queue/deadLetter.js';
import { requestContext } from '../../../../lib/async-context.js';
import { env } from '../../../../config/env.js';
import { AuditService } from '../../../../lib/audit/audit.service.js';
import { deleteExtractionRunFiles } from '../service/extractionFiles.js';

// ── Expurgo LGPD de BitrixExtractionRun (Onda 42, dossiê CPI DEC-04, opção B) ───────────────────
//
// Gap corrigido: `BITRIX_EXTRACTION_RETENTION_DAYS`/`BITRIX_EXTRACTION_PURGE_ENABLED` existem em
// `src/config/env.ts` desde a Onda 6, mas nenhum consumidor lia essas envs — o worker de expurgo em
// si nunca foi construído (ver `.agents/handoffs/onda-40/06-para-16-bitrix-extraction-purge-worker-
// ausente.md`). Sem isto, o histórico de extrações com dado pessoal exportado do Bitrix24 (nomes,
// e-mails, telefones de leads/contatos/empresas reais, nos arquivos CSV/XLSX/JSON gerados por
// `generateFiles`/`extractionFiles.ts`) nunca expirava.
//
// DECISÃO DO PRODUTO (dossiê CPI, DEC-04, opção B — confirmada pelo dono do produto, não inferida
// por este worker): ANONIMIZAR, não apagar a linha (hard delete). O registro estatístico
// (id, datas, contadores, status, conexão, entidades extraídas) é preservado para auditoria/
// relatório; só o dado pessoal REAL EXPORTADO é removido/redigido. Isso difere do padrão de
// `agentMemoryCleanup.worker.ts` (que faz `deleteMany` de verdade) e segue o mesmo espírito de
// `autoAnonymizeDisqualified.worker.ts` (anonimizar mantendo o registro).
//
// O QUE É "dado pessoal real exportado" NESTA TABELA, e o que este worker faz com cada parte:
// 1. O CONTEÚDO real (nome/e-mail/telefone/etc. de leads/contatos/empresas do Bitrix24) NUNCA fica
//    na linha do Postgres — só nos arquivos em `BITRIX_EXTRACTION_STORAGE_DIR`
//    (`extractionFiles.ts`, já documentado: "guarda só METADADOS, nunca o conteúdo do arquivo").
//    Esses arquivos são o expurgo real — removidos via `deleteExtractionRunFiles` (mesma função já
//    usada pelo cancelamento manual e por `deleteExtractionRun`), idempotente (`fs.rm force:true`
//    é no-op se o diretório já não existe — inclusive o caso comum de disco efêmero em produção,
//    ver comentário em `extractionFiles.ts`).
// 2. `files` (Json) — metadados (formato/entidade/nome/tamanho/data) apontando para arquivos que
//    acabaram de ser apagados acima. Zerado (`null`) para não sugerir que o arquivo ainda existe.
// 3. `filters.search` (Json) — o ÚNICO campo de filtro que é texto livre digitado por um humano, e
//    por isso o único campo desta linha que pode conter, ele mesmo, dado pessoal de um titular real
//    (ex.: alguém buscou "joao.silva@empresa.com" ou um nome próprio). Removido. O resto de
//    `filters` (period/categoryId/stageId/assignedById) é configuração/estatística, não dado
//    pessoal de um titular — preservado.
// 4. `entities`, `fields`, `requestedBy`, `connectionId`, `status`, `progress`, `totalCount`,
//    `countByEntity`, `errorMessage`, `correlationId`, `attempts`, `startedAt`/`completedAt`/
//    `cancelledAt`/`createdAt`/`updatedAt` — preservados como registro estatístico/auditoria
//    (`requestedBy` é justamente "quem exportou este dado pessoal e quando", auditoria que a opção B
//    pede para MANTER, não o dado pessoal em si). `progress.entities[].checkpointTo` também é
//    preservado — é só uma data-cursor do checkpoint incremental (Onda 41), não dado pessoal, e
//    zerá-lo quebraria a retomada incremental de `findEntityCheckpoint` sem necessidade.
//
// IDEMPOTÊNCIA sem coluna nova: o schema não tem `purgedAt` (fora do escopo deste agente editar
// `prisma/schema.prisma` — ver handoff `.agents/handoffs/onda-42/02-para-00-registrar-worker-purge-
// bitrix.md`, que documenta o campo dedicado recomendado para quando isso puder ser migrado). Até
// lá, o marcador de "já expurgado" vive dentro do próprio `progress` (Json já existente): um run
// expurgado ganha `progress.purgedAt` (ISO). Mesmo idioma já usado neste código para "já tratado"
// sem coluna dedicada (`autoAnonymizeDisqualified.worker.ts` marca o Contact anonimizado pelo nome
// `'[titular anonimizado — LGPD]'` em vez de uma coluna `anonymizedAt`).
export const BITRIX_EXTRACTION_PURGE_QUEUE_NAME = 'bitrix-extraction-purge-queue';

/** Só extrações em estado TERMINAL são candidatas — nunca `queued`/`running` (em andamento, mesmo que antiga/travada; reconciliar runs travados é responsabilidade de outra rotina, não deste expurgo). */
const TERMINAL_STATUSES = ['completed', 'completed_partial', 'failed', 'cancelled'] as const;

/** Teto por organização por varredura — mesmo espírito de `CHECKPOINT_LOOKBACK`/`take` já usados em extraction.ts: não existe hoje volume que justifique paginação real, e um teto evita uma varredura descontrolada se um tenant acumular um histórico muito grande. */
const PURGE_BATCH_SIZE = 500;

interface PurgeCandidate {
    id: string;
    filters: unknown;
    progress: unknown;
}

interface StoredFilters {
    search?: string;
    [key: string]: unknown;
}

interface StoredProgress {
    purgedAt?: string;
    [key: string]: unknown;
}

export interface BitrixExtractionPurgeResult {
    enabled: boolean;
    purgedCount: number;
    organizationsProcessed: number;
    retentionDays: number;
}

function isAlreadyPurged(progress: unknown): boolean {
    return typeof (progress as StoredProgress | null)?.purgedAt === 'string';
}

/** Remove só o texto livre digitado pelo usuário — o resto do filtro é configuração/estatística, não dado pessoal de um titular. */
function redactFilters(filters: unknown): Prisma.InputJsonValue {
    if (!filters || typeof filters !== 'object') return {} as Prisma.InputJsonValue;
    const { search: _search, ...rest } = filters as StoredFilters;
    void _search; // descartado de propósito — é o único campo de texto livre desta linha, ver comentário de topo do arquivo.
    return rest as Prisma.InputJsonValue;
}

function markPurgedProgress(progress: unknown, purgedAt: string): Prisma.InputJsonValue {
    const base = (progress && typeof progress === 'object') ? (progress as Record<string, unknown>) : {};
    return { ...base, purgedAt } as Prisma.InputJsonValue;
}

/**
 * Corpo do job, exportado à parte do worker BullMQ (mesmo padrão de `runAgentMemoryCleanupSweep`/
 * `runAutoAnonymizeSweep`) para ser testável sem depender de Redis/BullMQ real.
 *
 * Fail-safe explícito: `BITRIX_EXTRACTION_PURGE_ENABLED=false` (default) faz este worker não tocar
 * em NADA, nem sequer consultar o banco — mesmo que o BullMQ scheduler continue registrado/rodando
 * (mesmo padrão de dois-fatores já documentado em `src/config/env.ts` para estas duas envs).
 */
export async function runBitrixExtractionPurgeSweep(): Promise<BitrixExtractionPurgeResult> {
    const retentionDays = env.BITRIX_EXTRACTION_RETENTION_DAYS;

    if (!env.BITRIX_EXTRACTION_PURGE_ENABLED) {
        logger.info(
            { retentionDays },
            '[bitrix] Expurgo de BitrixExtractionRun DESLIGADO (BITRIX_EXTRACTION_PURGE_ENABLED=false) — nenhuma linha consultada nem alterada.',
        );
        return { enabled: false, purgedCount: 0, organizationsProcessed: 0, retentionDays };
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    logger.info({ retentionDays, cutoff: cutoff.toISOString() }, '[bitrix] Iniciando expurgo LGPD de BitrixExtractionRun antigos (todas as organizações)');

    // Descoberta cross-tenant sob bypass (Organization está no allowlist, BYPASS_RLS_ALLOWED_MODELS
    // em src/lib/prisma.ts) — só para listar organizações existentes, nunca para ler/gravar
    // BitrixExtractionRun diretamente (esse model NÃO está no allowlist, mesmo tratamento de
    // AgentMemory — ver agentMemoryCleanup.worker.ts). Cada expurgo por linha roda dentro do tenant
    // real (`requestContext.run({ tenantId })`), nunca sob bypass.
    const organizations = await requestContext.run({ bypassRls: true }, () =>
        prisma.organization.findMany({ select: { id: true } }),
    );

    let purgedCount = 0;
    for (const org of organizations) {
        try {
            const candidates = await requestContext.run({ tenantId: org.id }, () =>
                prisma.bitrixExtractionRun.findMany({
                    where: {
                        organizationId: org.id,
                        createdAt: { lte: cutoff },
                        status: { in: [...TERMINAL_STATUSES] },
                    },
                    select: { id: true, filters: true, progress: true },
                    take: PURGE_BATCH_SIZE,
                }),
            ) as PurgeCandidate[];

            for (const candidate of candidates) {
                // Idempotência: rodar a varredura duas vezes seguidas não reprocessa (nem falha) um
                // run já expurgado numa rodada anterior.
                if (isAlreadyPurged(candidate.progress)) continue;

                try {
                    const purgedAt = new Date().toISOString();
                    // Arquivo primeiro, linha depois (mesmo motivo/ordem de `deleteExtractionRun`):
                    // nunca deixar a linha marcada como "expurgada" com o arquivo real ainda em
                    // disco caso o processo caia entre as duas operações. `deleteExtractionRunFiles`
                    // é `fs`/disco puro (não usa Prisma), então não precisa de `requestContext`.
                    await deleteExtractionRunFiles(org.id, candidate.id);

                    await requestContext.run({ tenantId: org.id }, () =>
                        prisma.bitrixExtractionRun.update({
                            where: { id: candidate.id },
                            data: {
                                files: null as unknown as Prisma.InputJsonValue,
                                filters: redactFilters(candidate.filters),
                                progress: markPurgedProgress(candidate.progress, purgedAt),
                            },
                        }),
                    );

                    await AuditService.log({
                        action: 'UPDATE',
                        entity: 'BitrixExtractionRun',
                        entityId: candidate.id,
                        tenantId: org.id,
                        afterState: { purgedAt, reason: 'lgpd-retention-expired', retentionDays },
                    });

                    purgedCount++;
                } catch (err) {
                    logger.error({ err, organizationId: org.id, runId: candidate.id }, '[bitrix] Falha ao expurgar uma extração — seguindo com as demais desta organização');
                }
            }
        } catch (err) {
            logger.error({ err, organizationId: org.id }, '[bitrix] Falha ao buscar extrações expiradas desta organização — seguindo com as demais organizações');
        }
    }

    logger.info({ purgedCount, organizationsProcessed: organizations.length, retentionDays }, '[bitrix] Expurgo LGPD de BitrixExtractionRun concluído');
    return { enabled: true, purgedCount, organizationsProcessed: organizations.length, retentionDays };
}

export function createBitrixExtractionPurgeWorker() {
    const worker = new Worker(BITRIX_EXTRACTION_PURGE_QUEUE_NAME, async (_job) => runBitrixExtractionPurgeSweep(), {
        connection: connection as any,
    });

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'BitrixExtractionPurge worker job falhou');
        if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
        void recordDeadLetter({
            queue: BITRIX_EXTRACTION_PURGE_QUEUE_NAME,
            jobId: job.id,
            jobName: job.name,
            attemptsMade: job.attemptsMade,
            error: err,
        });
    });

    worker.on('error', (err) => {
        logger.warn({ message: err.message }, 'BitrixExtractionPurge worker error suppressed (Redis offline)');
    });

    return worker;
}

export async function scheduleBitrixExtractionPurgeJob() {
    if (!connection) return;
    const queue = new Queue(BITRIX_EXTRACTION_PURGE_QUEUE_NAME, { connection: connection as any });
    // Roda todo dia às 5h da manhã — fora do horário de auto-anonimização de leads (3h), do
    // expurgo de AgentMemory (4h) e do follow-up diário (9h). BullMQ v6 removeu `repeat` de
    // `Queue.add` (viraria um job avulso, nunca mais se repete) — agendamento recorrente exige
    // `upsertJobScheduler`, idempotente pelo id abaixo. O agendamento em si roda sempre; quem
    // decide se algo é de fato expurgado é `BITRIX_EXTRACTION_PURGE_ENABLED`, checado dentro de
    // `runBitrixExtractionPurgeSweep` (fail-safe: flag desligada = job dispara e não faz nada).
    await queue.upsertJobScheduler(
        'bitrix-extraction-purge-daily',
        { pattern: '0 5 * * *' },
        { name: 'purge-old-bitrix-extraction-runs', data: {} },
    );

    logger.info('BitrixExtractionPurge job scheduled (cron: 0 5 * * *)');
}
