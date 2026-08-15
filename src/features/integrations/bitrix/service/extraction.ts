import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../../lib/prisma.js';
import { logger } from '../../../../lib/logger.js';
import { AppError } from '../../../../shared/middlewares/errorHandler.js';
import { AuditService } from '../../../../lib/audit/audit.service.js';
import { callBitrix, getConnectionWebhookUrl } from './client.js';
import { bitrixExtractionFailuresTotal } from './metrics.js';
import {
    ALL_EXTRACTION_ENTITIES, EXTRACTION_ENTITY_SPECS, isExtractionEntity,
    type BitrixExtractionEntity,
} from './extractionEntities.js';
import {
    resolvePeriodRange, EXTRACTION_PERIODS, InvalidExtractionPeriodError,
    type BitrixExtractionPeriod, type PeriodRange,
} from './extractionPeriod.js';
import {
    writeExtractionFile, readExtractionFile, deleteExtractionRunFiles,
    toCsv, toJson, buildXlsxWorkbook, type ExtractionFileFormat, type ExtractionEntityDataset,
} from './extractionFiles.js';

// ── Serviço real de Extrações Bitrix (Onda 7, Agente 06/06A) ───────────────────────────────────
//
// Constrói em cima do schema `BitrixExtractionRun` destravado pelo Agente 01A na Onda 6 (ver
// `.agents/handoffs/onda-6/01A-para-06-bitrix-extraction-run-schema.md`) — status/histórico
// persistidos no Postgres, retenção via `BITRIX_EXTRACTION_RETENTION_DAYS` (worker de expurgo
// continua DESLIGADO por padrão, fora do escopo desta rodada).
//
// Execução em segundo plano: SEM fila BullMQ dedicada. `worker.ts`/`server.ts` são arquivos
// compartilhados fora da propriedade deste agente nesta onda (ver matriz de propriedade em
// `.agents/runs/onda-7.md`) — registrar um `Worker` novo ali exigiria editar um arquivo de dono
// concorrente, o mesmo tipo de colisão que já aconteceu uma vez nesta base
// (`bitrixSync.worker.ts`, Onda 5, 06×07). Em vez disso, a extração roda "fire-and-forget" dentro
// do próprio processo HTTP, no mesmo padrão já estabelecido por `pushLeadToBitrix`
// (`outboundSync.ts`): a rota devolve a resposta assim que a linha `queued` é criada, e
// `void executeExtractionRun(...)` continua rodando depois disso, dentro do mesmo contexto de
// tenant (AsyncLocalStorage) capturado no momento da chamada. Isso não bloqueia a UI (item
// obrigatório da spec) mas tem uma limitação real, documentada em vez de escondida: uma extração
// em andamento NÃO sobrevive a um restart do processo HTTP (fica travada em "running" para sempre
// — ver `reconcileStuckRuns` abaixo). Migrar para um worker dedicado (mesmo padrão de
// `bitrixSync.worker.ts`) é a evolução natural, registrada como pendência no relatório da onda.

export interface CreateExtractionRunInput {
    connectionId: string;
    entities: string[];
    /** Campos selecionados por entidade — vazio/omitido para uma entidade = todos os campos (inclui UF_CRM_*). */
    fields?: Partial<Record<string, string[]>>;
    filters: {
        period: string;
        customFrom?: string;
        customTo?: string;
        /** Só se aplica a Negócios (pipeline). */
        categoryId?: string;
        /** Etapa (Negócio) ou status (Lead). */
        stageId?: string;
        /** Só se aplica a Leads e Negócios — Bitrix não expõe um "responsável" equivalente para Empresas/Contatos/Atividades/Usuários nesta API. */
        assignedById?: string;
        search?: string;
    };
}

interface StoredExtractionFilters {
    period: BitrixExtractionPeriod;
    customFrom?: string;
    customTo?: string;
    categoryId?: string;
    stageId?: string;
    assignedById?: string;
    search?: string;
}

interface ExtractionEntityProgress {
    entity: BitrixExtractionEntity;
    status: 'pending' | 'running' | 'done' | 'error';
    processed: number;
    pagesScanned: number;
    pagesExhausted: boolean;
    error?: string;
}

interface ExtractionFileMeta {
    format: ExtractionFileFormat;
    /** `null` = arquivo consolidado (todas as entidades, ver JSON/XLSX abaixo). CSV é sempre por entidade. */
    entity: string | null;
    filename: string;
    sizeBytes: number;
    generatedAt: string;
}

// Proteção contra loop infinito (item obrigatório da spec de extração) — 500 páginas de 50
// registros = até 25.000 registros por entidade numa única execução. Não é um teto de produto
// (uma organização grande pode ter mais que isso), é uma rede de segurança: se atingido,
// `pagesExhausted: false` fica registrado no progresso em vez de a extração rodar para sempre.
const PAGE_SAFETY_CAP = 500;

function resolveSelect(entity: BitrixExtractionEntity, fields: Partial<Record<string, string[]>>): string[] | undefined {
    if (entity === 'user') return undefined; // user.get não aceita `select` — sempre devolve o conjunto fixo de campos
    const requested = fields[entity];
    if (!requested || requested.length === 0) return ['*', 'UF_*']; // "extração completa": todos os campos, incluindo os personalizados
    return Array.from(new Set(['ID', ...requested]));
}

function buildFilter(entity: BitrixExtractionEntity, filters: StoredExtractionFilters, periodRange: PeriodRange | null): Record<string, unknown> {
    const spec = EXTRACTION_ENTITY_SPECS[entity];
    const filter: Record<string, unknown> = {};

    if (periodRange && spec.dateField) {
        filter[`>=${spec.dateField}`] = periodRange.from.toISOString();
        filter[`<=${spec.dateField}`] = periodRange.to.toISOString();
    }
    if (filters.search && spec.searchField) {
        filter[`%${spec.searchField}`] = filters.search;
    }
    // ASSIGNED_BY_ID só existe em Lead/Deal nesta API — aplicar a Empresa/Contato/Atividade/
    // Usuário seria um filtro que o Bitrix rejeitaria (campo inexistente = erro definitivo), não
    // um "sem efeito" silencioso. Documentado em CreateExtractionRunInput.filters.assignedById.
    if (filters.assignedById && (entity === 'lead' || entity === 'deal')) {
        filter.ASSIGNED_BY_ID = filters.assignedById;
    }
    if (entity === 'deal') {
        if (filters.categoryId) filter.CATEGORY_ID = filters.categoryId;
        if (filters.stageId) filter.STAGE_ID = filters.stageId;
    }
    if (entity === 'lead' && filters.stageId) {
        filter.STATUS_ID = filters.stageId;
    }
    return filter;
}

interface BitrixListResponse {
    result: Record<string, unknown>[];
    next?: number;
    total?: number;
}

async function extractEntityPages(
    webhookUrl: string,
    entity: BitrixExtractionEntity,
    filter: Record<string, unknown>,
    select: string[] | undefined,
    correlationId: string,
    onPage: (processedSoFar: number) => Promise<boolean>,
): Promise<{ rows: Record<string, unknown>[]; pagesScanned: number; pagesExhausted: boolean; cancelled: boolean }> {
    const method = EXTRACTION_ENTITY_SPECS[entity].listMethod;
    const rows: Record<string, unknown>[] = [];
    let start = 0;
    let pagesScanned = 0;
    let pagesExhausted = false;
    let cancelled = false;

    while (pagesScanned < PAGE_SAFETY_CAP) {
        const params: Record<string, unknown> = { filter, start };
        if (select) params.select = select;
        if (entity !== 'user') params.order = { ID: 'ASC' }; // ordem estável — evita pular/duplicar registro se algo for criado/alterado entre páginas
        const data = await callBitrix<BitrixListResponse>(webhookUrl, method, params, { correlationId });
        rows.push(...data.result);
        pagesScanned++;

        cancelled = await onPage(rows.length);
        if (cancelled) break;

        if (data.next == null || data.result.length === 0) { pagesExhausted = true; break; }
        start = data.next;
    }

    return { rows, pagesScanned, pagesExhausted, cancelled };
}

async function isCancelled(organizationId: string, runId: string): Promise<boolean> {
    const row = await prisma.bitrixExtractionRun.findFirst({ where: { id: runId, organizationId }, select: { status: true } });
    return row?.status === 'cancelled';
}

async function persistProgress(
    organizationId: string,
    runId: string,
    entities: ExtractionEntityProgress[],
    totalCount: number,
    countByEntity: Record<string, number>,
): Promise<void> {
    // `status: 'running'` no WHERE: se a linha já foi cancelada/marcada como falha por outra via
    // enquanto esta atualização estava em voo, não sobrescreve esse estado terminal com progresso
    // obsoleto.
    await prisma.bitrixExtractionRun.updateMany({
        where: { id: runId, organizationId, status: 'running' },
        data: {
            progress: { entities } as unknown as Prisma.InputJsonValue,
            totalCount,
            countByEntity: countByEntity as unknown as Prisma.InputJsonValue,
        },
    }).catch((err) => logger.error({ err, organizationId, runId }, '[bitrix] Falha ao gravar progresso da extração'));
}

async function failRun(organizationId: string, runId: string, message: string, entity: string): Promise<void> {
    bitrixExtractionFailuresTotal.inc({ tenant: organizationId, entity });
    await prisma.bitrixExtractionRun.updateMany({
        where: { id: runId, organizationId, status: 'running' },
        data: { status: 'failed', errorMessage: message, completedAt: new Date() },
    }).catch((err) => logger.error({ err, organizationId, runId }, '[bitrix] Falha ao gravar status de erro da extração'));
    logger.error({ organizationId, runId, entity, message }, '[bitrix] Extração falhou');
}

async function generateFiles(organizationId: string, runId: string, datasets: ExtractionEntityDataset[]): Promise<ExtractionFileMeta[]> {
    const files: ExtractionFileMeta[] = [];
    const now = new Date().toISOString();

    for (const dataset of datasets) {
        const filename = `${dataset.entity}.csv`;
        const { sizeBytes } = await writeExtractionFile(organizationId, runId, filename, toCsv(dataset.rows));
        files.push({ format: 'csv', entity: dataset.entity, filename, sizeBytes, generatedAt: now });
    }

    const jsonPayload = {
        generatedAt: now,
        entities: datasets.map((d) => ({ entity: d.entity, label: d.label, count: d.rows.length })),
        data: Object.fromEntries(datasets.map((d) => [d.entity, d.rows])),
    };
    const jsonFilename = 'extraction.json';
    const jsonMeta = await writeExtractionFile(organizationId, runId, jsonFilename, toJson(jsonPayload));
    files.push({ format: 'json', entity: null, filename: jsonFilename, sizeBytes: jsonMeta.sizeBytes, generatedAt: now });

    const xlsxFilename = 'extraction.xlsx';
    const xlsxBuffer = await buildXlsxWorkbook(datasets);
    const xlsxMeta = await writeExtractionFile(organizationId, runId, xlsxFilename, xlsxBuffer);
    files.push({ format: 'xlsx', entity: null, filename: xlsxFilename, sizeBytes: xlsxMeta.sizeBytes, generatedAt: now });

    return files;
}

/**
 * Executor de segundo plano — chamado (sem `await`) por `createExtractionRun` logo depois de
 * criar a linha `queued`. Ver nota de arquitetura no topo do arquivo sobre por que isto não é um
 * worker BullMQ nesta rodada.
 */
export async function executeExtractionRun(organizationId: string, runId: string): Promise<void> {
    // Transição atômica queued -> running: se outra chamada concorrente (ou um cancelamento que
    // chegou antes de a linha sequer começar a rodar) já mudou o status, `count !== 1` e esta
    // execução simplesmente não faz nada — sem isso, duas chamadas quase simultâneas processariam
    // a mesma extração em paralelo (duplicando arquivos/contagens).
    const claimed = await prisma.bitrixExtractionRun.updateMany({
        where: { id: runId, organizationId, status: 'queued' },
        data: { status: 'running', startedAt: new Date() },
    });
    if (claimed.count !== 1) return;

    const run = await prisma.bitrixExtractionRun.findFirst({ where: { id: runId, organizationId } });
    if (!run) return;

    const correlationId = run.correlationId || randomUUID();
    const entities = (run.entities as string[]).filter(isExtractionEntity);
    const fields = (run.fields as Partial<Record<string, string[]>> | null) ?? {};
    const filters = run.filters as unknown as StoredExtractionFilters;

    let periodRange: PeriodRange | null;
    try {
        periodRange = resolvePeriodRange(filters.period, { from: filters.customFrom, to: filters.customTo });
    } catch (err) {
        await failRun(organizationId, runId, err instanceof Error ? err.message : String(err), 'run');
        return;
    }

    let webhookUrl: string;
    try {
        if (!run.connectionId) throw new AppError('Extração sem conexão Bitrix24 associada.', 400);
        webhookUrl = await getConnectionWebhookUrl(organizationId, run.connectionId);
    } catch (err) {
        await failRun(organizationId, runId, err instanceof Error ? err.message : String(err), 'run');
        return;
    }

    const datasets: ExtractionEntityDataset[] = [];
    const countByEntity: Record<string, number> = {};
    const progressEntities: ExtractionEntityProgress[] = entities.map((entity) => ({
        entity, status: 'pending', processed: 0, pagesScanned: 0, pagesExhausted: false,
    }));
    let totalCount = 0;
    let wasCancelled = false;

    for (const entity of entities) {
        if (await isCancelled(organizationId, runId)) { wasCancelled = true; break; }

        const entry = progressEntities.find((p) => p.entity === entity);
        if (!entry) continue; // não deveria acontecer — entities e progressEntities vêm da mesma lista
        entry.status = 'running';
        await persistProgress(organizationId, runId, progressEntities, totalCount, countByEntity);

        const select = resolveSelect(entity, fields);
        const filter = buildFilter(entity, filters, periodRange);

        try {
            const { rows, pagesScanned, pagesExhausted, cancelled } = await extractEntityPages(
                webhookUrl, entity, filter, select, correlationId,
                async (processedSoFar) => {
                    entry.processed = processedSoFar;
                    await persistProgress(organizationId, runId, progressEntities, totalCount + processedSoFar, countByEntity);
                    return isCancelled(organizationId, runId);
                },
            );

            entry.pagesScanned = pagesScanned;
            entry.pagesExhausted = pagesExhausted;
            entry.processed = rows.length;
            entry.status = cancelled ? 'pending' : 'done';
            countByEntity[entity] = rows.length;
            totalCount += rows.length;
            datasets.push({ entity, label: EXTRACTION_ENTITY_SPECS[entity].label, rows });
            await persistProgress(organizationId, runId, progressEntities, totalCount, countByEntity);

            if (!pagesExhausted && !cancelled) {
                logger.warn({ organizationId, runId, entity, pagesScanned }, '[bitrix] Extração atingiu o teto de segurança de páginas antes de esgotar o portal — contagem desta entidade é parcial');
            }
            if (cancelled) { wasCancelled = true; break; }
        } catch (err) {
            entry.status = 'error';
            entry.error = err instanceof Error ? err.message : String(err);
            await persistProgress(organizationId, runId, progressEntities, totalCount, countByEntity);
            await failRun(organizationId, runId, entry.error, entity);
            return;
        }
    }

    if (wasCancelled) {
        logger.info({ organizationId, runId, correlationId }, '[bitrix] Extração cancelada durante o processamento — nenhum arquivo gerado, contagem parcial preservada no histórico.');
        return; // cancelExtractionRun já gravou status='cancelled'/cancelledAt — nada a sobrescrever aqui
    }

    try {
        const files = await generateFiles(organizationId, runId, datasets);
        await prisma.bitrixExtractionRun.update({
            where: { id: runId },
            data: {
                status: 'completed',
                completedAt: new Date(),
                totalCount,
                countByEntity: countByEntity as unknown as Prisma.InputJsonValue,
                progress: { entities: progressEntities } as unknown as Prisma.InputJsonValue,
                files: files as unknown as Prisma.InputJsonValue,
            },
        });
        logger.info({ organizationId, runId, correlationId, totalCount }, '[bitrix] Extração concluída');
    } catch (err) {
        await failRun(organizationId, runId, err instanceof Error ? err.message : String(err), 'run');
    }
}

export async function createExtractionRun(organizationId: string, userId: string, input: CreateExtractionRunInput) {
    if (!input.connectionId) throw new AppError('Informe qual portal Bitrix24 extrair.', 400);
    await getConnectionWebhookUrl(organizationId, input.connectionId); // valida tenant + existência da conexão

    const entities = Array.from(new Set(input.entities || []));
    if (entities.length === 0) throw new AppError('Selecione ao menos uma entidade para extrair.', 400);
    const invalid = entities.filter((e) => !isExtractionEntity(e));
    if (invalid.length > 0) {
        throw new AppError(`Entidade(s) desconhecida(s): ${invalid.join(', ')}. Válidas: ${ALL_EXTRACTION_ENTITIES.join(', ')}.`, 400);
    }

    const period = input.filters?.period;
    if (!EXTRACTION_PERIODS.includes(period as BitrixExtractionPeriod)) {
        throw new AppError(`Período inválido. Válidos: ${EXTRACTION_PERIODS.join(', ')}.`, 400);
    }
    try {
        // Falha rápido (400 síncrono) em vez de só descobrir o período inválido na execução em
        // segundo plano, onde o único jeito de a pessoa saber seria reabrir o histórico.
        resolvePeriodRange(period as BitrixExtractionPeriod, { from: input.filters.customFrom, to: input.filters.customTo });
    } catch (err) {
        if (err instanceof InvalidExtractionPeriodError) throw new AppError(err.message, 400);
        throw err;
    }

    const correlationId = randomUUID();
    const run = await prisma.bitrixExtractionRun.create({
        data: {
            organizationId,
            connectionId: input.connectionId,
            requestedBy: userId,
            entities,
            fields: (input.fields ?? {}) as unknown as Prisma.InputJsonValue,
            filters: input.filters as unknown as Prisma.InputJsonValue,
            status: 'queued',
            correlationId,
        },
    });

    await AuditService.log({
        action: 'CREATE', entity: 'BitrixExtractionRun', entityId: run.id, tenantId: organizationId,
        afterState: { entities, connectionId: input.connectionId, period },
    });

    // Fire-and-forget dentro do próprio contexto de tenant da requisição (ver nota de arquitetura
    // no topo do arquivo) — mesmo padrão de `pushLeadToBitrix`. O `.catch` aqui é só uma rede de
    // segurança para um bug de programação genuíno (algo que escapou de todos os try/catch
    // internos de `executeExtractionRun`); o caminho normal de erro já grava status='failed'.
    void executeExtractionRun(organizationId, run.id).catch((err) => {
        logger.error({ err, organizationId, runId: run.id }, '[bitrix] Execução da extração falhou de forma inesperada, fora do tratamento interno');
    });

    return run;
}

export async function listExtractionRuns(organizationId: string, take = 50) {
    return prisma.bitrixExtractionRun.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(take, 1), 100),
    });
}

export async function getExtractionRun(organizationId: string, runId: string) {
    const run = await prisma.bitrixExtractionRun.findFirst({ where: { id: runId, organizationId } });
    if (!run) throw new AppError('Extração não encontrada.', 404);
    return run;
}

export async function cancelExtractionRun(organizationId: string, runId: string): Promise<void> {
    const { count } = await prisma.bitrixExtractionRun.updateMany({
        where: { id: runId, organizationId, status: { in: ['queued', 'running'] } },
        data: { status: 'cancelled', cancelledAt: new Date() },
    });
    if (count === 0) {
        const existing = await prisma.bitrixExtractionRun.findFirst({ where: { id: runId, organizationId }, select: { id: true } });
        if (!existing) throw new AppError('Extração não encontrada.', 404);
        throw new AppError('Esta extração já foi finalizada — não é possível cancelar.', 400);
    }
    await AuditService.log({ action: 'UPDATE', entity: 'BitrixExtractionRun', entityId: runId, tenantId: organizationId, afterState: { status: 'cancelled' } });
}

/** Remove os arquivos gerados + a linha de histórico — a exclusão de uma extração precisa apagar o arquivo, não só o registro (ver handoff do schema, seção LGPD). */
export async function deleteExtractionRun(organizationId: string, runId: string): Promise<void> {
    const run = await prisma.bitrixExtractionRun.findFirst({ where: { id: runId, organizationId }, select: { id: true } });
    if (!run) throw new AppError('Extração não encontrada.', 404);
    await deleteExtractionRunFiles(organizationId, runId);
    await prisma.bitrixExtractionRun.delete({ where: { id: runId } });
    await AuditService.log({ action: 'DELETE', entity: 'BitrixExtractionRun', entityId: runId, tenantId: organizationId });
}

export async function downloadExtractionFile(
    organizationId: string,
    runId: string,
    format: ExtractionFileFormat,
    entity?: string,
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const run = await prisma.bitrixExtractionRun.findFirst({ where: { id: runId, organizationId } });
    if (!run) throw new AppError('Extração não encontrada.', 404);
    if (run.status !== 'completed') {
        throw new AppError('Esta extração ainda não foi concluída — não há arquivo para baixar.', 400);
    }

    const files = (run.files as unknown as ExtractionFileMeta[] | null) ?? [];
    // CSV é sempre por entidade (uma aba não faz sentido fora de uma planilha); JSON/XLSX são
    // sempre o pacote consolidado — mesmo quando `entity` é passado por engano, ignora.
    const wantedEntity = format === 'csv' ? (entity ?? null) : null;
    const meta = files.find((f) => f.format === format && f.entity === wantedEntity);
    if (!meta) {
        throw new AppError(
            format === 'csv' && !entity
                ? 'Informe a entidade para baixar em CSV (um arquivo por entidade extraída).'
                : 'Arquivo não encontrado para este formato/entidade nesta extração.',
            400,
        );
    }

    const buffer = await readExtractionFile(organizationId, runId, meta.filename);
    if (!buffer) {
        throw new AppError('Arquivo não está mais disponível neste servidor (armazenamento efêmero) — gere a extração novamente.', 410);
    }

    const contentType = format === 'csv'
        ? 'text/csv; charset=utf-8'
        : format === 'json'
            ? 'application/json; charset=utf-8'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return { buffer, filename: meta.filename, contentType };
}

export { ALL_EXTRACTION_ENTITIES, EXTRACTION_PERIODS };
export type { BitrixExtractionEntity, BitrixExtractionPeriod };
