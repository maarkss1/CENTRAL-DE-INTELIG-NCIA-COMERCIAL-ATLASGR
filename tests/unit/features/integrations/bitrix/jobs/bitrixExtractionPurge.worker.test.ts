import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Gap real de LGPD (dossiê CPI, DEC-04, opção B): `BitrixExtractionRun` guarda histórico de
 * extrações do Bitrix24 com dado pessoal real exportado (arquivos CSV/XLSX/JSON em disco) e nunca
 * teve expurgo automático — `BITRIX_EXTRACTION_RETENTION_DAYS`/`BITRIX_EXTRACTION_PURGE_ENABLED`
 * existiam em `src/config/env.ts` desde a Onda 6 sem nenhum consumidor (ver
 * `.agents/handoffs/onda-40/06-para-16-bitrix-extraction-purge-worker-ausente.md`).
 *
 * Este teste prova, com Prisma/fs mockados (sem depender de Postgres/disco real), que
 * `runBitrixExtractionPurgeSweep`:
 * (1) com a flag desligada (default), não consulta nem altera NADA — fail-safe;
 * (2) com a flag ligada, respeita a janela de retenção (não toca run dentro do prazo);
 * (3) ANONIMIZA (não apaga a linha) um run expirado: remove os arquivos em disco, redige
 *     `filters.search`, zera `files`, mas preserva id/datas/contadores/status/entities/requestedBy;
 * (4) é idempotente: rodar duas vezes seguidas não reprocessa nem duplica efeito num run já
 *     marcado como expurgado (`progress.purgedAt`);
 * (5) descoberta cross-tenant roda sob bypass; o expurgo por linha roda sempre com o tenant real.
 */

vi.mock('../../../../../../src/lib/queue/redis.js', () => ({ connection: {} }));

const organizationFindMany = vi.fn();
const bitrixExtractionRunFindMany = vi.fn();
const bitrixExtractionRunUpdate = vi.fn();
const bitrixExtractionRunDelete = vi.fn();
vi.mock('../../../../../../src/lib/prisma.js', () => ({
    prisma: {
        organization: { findMany: (...args: unknown[]) => organizationFindMany(...args) },
        bitrixExtractionRun: {
            findMany: (...args: unknown[]) => bitrixExtractionRunFindMany(...args),
            update: (...args: unknown[]) => bitrixExtractionRunUpdate(...args),
            delete: (...args: unknown[]) => bitrixExtractionRunDelete(...args),
        },
    },
}));

let purgeEnabled = false;
let retentionDays = 45;
vi.mock('../../../../../../src/config/env.js', () => ({
    // getters (não um objeto congelado) para que cada teste ajuste a flag/retenção sem re-mockar o módulo.
    get env() {
        return { BITRIX_EXTRACTION_PURGE_ENABLED: purgeEnabled, BITRIX_EXTRACTION_RETENTION_DAYS: retentionDays };
    },
}));

const deleteExtractionRunFiles = vi.fn();
vi.mock('../../../../../../src/features/integrations/bitrix/service/extractionFiles.js', () => ({
    deleteExtractionRunFiles: (...args: unknown[]) => deleteExtractionRunFiles(...args),
}));

const auditLog = vi.fn();
vi.mock('../../../../../../src/lib/audit/audit.service.js', () => ({
    AuditService: { log: (...args: unknown[]) => auditLog(...args) },
}));

import { requestContext } from '../../../../../../src/lib/async-context';
import {
    runBitrixExtractionPurgeSweep,
} from '../../../../../../src/features/integrations/bitrix/jobs/bitrixExtractionPurge.worker';

beforeEach(() => {
    vi.clearAllMocks();
    purgeEnabled = false;
    retentionDays = 45;
    deleteExtractionRunFiles.mockResolvedValue(undefined);
    bitrixExtractionRunUpdate.mockResolvedValue({});
    auditLog.mockResolvedValue(undefined);
});

describe('runBitrixExtractionPurgeSweep — fail-safe (flag desligada)', () => {
    it('não consulta nem altera nada quando BITRIX_EXTRACTION_PURGE_ENABLED=false (default)', async () => {
        const result = await runBitrixExtractionPurgeSweep();

        expect(result).toEqual({ enabled: false, purgedCount: 0, organizationsProcessed: 0, retentionDays: 45 });
        expect(organizationFindMany).not.toHaveBeenCalled();
        expect(bitrixExtractionRunFindMany).not.toHaveBeenCalled();
        expect(bitrixExtractionRunUpdate).not.toHaveBeenCalled();
        expect(deleteExtractionRunFiles).not.toHaveBeenCalled();
    });
});

describe('runBitrixExtractionPurgeSweep — descoberta cross-tenant (flag ligada)', () => {
    beforeEach(() => {
        purgeEnabled = true;
    });

    it('processa TODA organização retornada, não só a primeira', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-a' }, { id: 'org-b' }]);
        bitrixExtractionRunFindMany.mockResolvedValue([]);

        const result = await runBitrixExtractionPurgeSweep();

        expect(result.organizationsProcessed).toBe(2);
        expect(bitrixExtractionRunFindMany).toHaveBeenCalledTimes(2);
    });

    it('a descoberta cross-tenant roda com bypass; a consulta por organização roda com o tenant real (nunca bypass)', async () => {
        organizationFindMany.mockImplementation(async () => {
            expect(requestContext.getStore()?.bypassRls).toBe(true);
            return [{ id: 'org-a' }];
        });
        bitrixExtractionRunFindMany.mockImplementation(async () => {
            expect(requestContext.getStore()?.tenantId).toBe('org-a');
            expect(requestContext.getStore()?.bypassRls).toBeUndefined();
            return [];
        });

        await runBitrixExtractionPurgeSweep();

        expect(bitrixExtractionRunFindMany).toHaveBeenCalledTimes(1);
    });

    it('nenhuma organização: não tenta expurgar nada e reporta zero', async () => {
        organizationFindMany.mockResolvedValue([]);

        const result = await runBitrixExtractionPurgeSweep();

        expect(result).toEqual({ enabled: true, purgedCount: 0, organizationsProcessed: 0, retentionDays: 45 });
        expect(bitrixExtractionRunFindMany).not.toHaveBeenCalled();
    });

    it('falha ao buscar uma organização não derruba a varredura das demais', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-falha' }, { id: 'org-b' }]);
        bitrixExtractionRunFindMany
            .mockRejectedValueOnce(new Error('timeout de banco'))
            .mockResolvedValueOnce([]);

        const result = await runBitrixExtractionPurgeSweep();

        expect(result.organizationsProcessed).toBe(2);
        expect(bitrixExtractionRunFindMany).toHaveBeenCalledTimes(2);
    });
});

describe('runBitrixExtractionPurgeSweep — janela de retenção', () => {
    beforeEach(() => {
        purgeEnabled = true;
    });

    it('filtra por createdAt <= cutoff derivado de BITRIX_EXTRACTION_RETENTION_DAYS e só por status terminal', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-a' }]);
        bitrixExtractionRunFindMany.mockResolvedValue([]);

        const before = Date.now();
        await runBitrixExtractionPurgeSweep();
        const after = Date.now();

        const [args] = bitrixExtractionRunFindMany.mock.calls[0] as [{ where: { createdAt: { lte: Date }; status: { in: string[] } } }];
        const cutoffMs = args.where.createdAt.lte.getTime();

        const expectedMin = before - 45 * 24 * 60 * 60 * 1000;
        const expectedMax = after - 45 * 24 * 60 * 60 * 1000;
        expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin - 1000);
        expect(cutoffMs).toBeLessThanOrEqual(expectedMax + 1000);
        expect(args.where.status.in.sort()).toEqual(['cancelled', 'completed', 'completed_partial', 'failed']);
        // nunca inclui runs em andamento (queued/running) — mesmo se antigos/travados.
        expect(args.where.status.in).not.toContain('queued');
        expect(args.where.status.in).not.toContain('running');
    });

    it('não toca um run que a própria query já não devolveu (fora da janela de retenção)', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-a' }]);
        bitrixExtractionRunFindMany.mockResolvedValue([]); // simula: nenhum run bateu no cutoff no WHERE do Prisma

        const result = await runBitrixExtractionPurgeSweep();

        expect(result.purgedCount).toBe(0);
        expect(deleteExtractionRunFiles).not.toHaveBeenCalled();
        expect(bitrixExtractionRunUpdate).not.toHaveBeenCalled();
    });
});

describe('runBitrixExtractionPurgeSweep — anonimização (DEC-04 opção B: nunca hard delete)', () => {
    beforeEach(() => {
        purgeEnabled = true;
    });

    it('remove os arquivos em disco e redige filters.search, mas preserva id/status/contadores/entities/requestedBy', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-a' }]);
        bitrixExtractionRunFindMany.mockResolvedValue([
            {
                id: 'run-1',
                filters: { period: 'last30days', search: 'joao.silva@empresa.com', assignedById: '42' },
                progress: { entities: [{ entity: 'lead', status: 'done', checkpointTo: '2026-01-01T00:00:00.000Z' }] },
            },
        ]);

        const result = await runBitrixExtractionPurgeSweep();

        expect(result.purgedCount).toBe(1);
        expect(deleteExtractionRunFiles).toHaveBeenCalledWith('org-a', 'run-1');

        const [updateArgs] = bitrixExtractionRunUpdate.mock.calls[0] as [{ where: { id: string }; data: Record<string, unknown> }];
        expect(updateArgs.where).toEqual({ id: 'run-1' });
        expect(updateArgs.data.files).toBeNull();

        // filters: search removido, resto preservado.
        const filters = updateArgs.data.filters as Record<string, unknown>;
        expect(filters.search).toBeUndefined();
        expect(filters.period).toBe('last30days');
        expect(filters.assignedById).toBe('42');

        // progress: checkpoint preservado (não é dado pessoal) + marcador de idempotência adicionado.
        const progress = updateArgs.data.progress as { entities: unknown[]; purgedAt: string };
        expect(progress.entities).toEqual([{ entity: 'lead', status: 'done', checkpointTo: '2026-01-01T00:00:00.000Z' }]);
        expect(typeof progress.purgedAt).toBe('string');

        // Nunca chama delete() na linha — DEC-04 opção B é anonimizar, não apagar o registro.
        expect(bitrixExtractionRunDelete).not.toHaveBeenCalled();

        // Auditoria da anonimização é registrada.
        expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'UPDATE',
            entity: 'BitrixExtractionRun',
            entityId: 'run-1',
            tenantId: 'org-a',
        }));
    });

    it('arquivo é removido ANTES da linha ser marcada como expurgada (nunca a linha sozinha)', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-a' }]);
        bitrixExtractionRunFindMany.mockResolvedValue([{ id: 'run-1', filters: {}, progress: null }]);

        const callOrder: string[] = [];
        deleteExtractionRunFiles.mockImplementation(async () => { callOrder.push('deleteFiles'); });
        bitrixExtractionRunUpdate.mockImplementation(async () => { callOrder.push('updateRow'); return {}; });

        await runBitrixExtractionPurgeSweep();

        expect(callOrder).toEqual(['deleteFiles', 'updateRow']);
    });

    it('uma extração sem progress prévio (null) ainda ganha o marcador purgedAt', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-a' }]);
        bitrixExtractionRunFindMany.mockResolvedValue([{ id: 'run-1', filters: null, progress: null }]);

        await runBitrixExtractionPurgeSweep();

        const [updateArgs] = bitrixExtractionRunUpdate.mock.calls[0] as [{ data: { progress: { purgedAt: string } } }];
        expect(typeof updateArgs.data.progress.purgedAt).toBe('string');
    });

    it('falha ao expurgar um run não derruba os demais da mesma organização', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-a' }]);
        bitrixExtractionRunFindMany.mockResolvedValue([
            { id: 'run-falha', filters: {}, progress: null },
            { id: 'run-ok', filters: {}, progress: null },
        ]);
        deleteExtractionRunFiles
            .mockRejectedValueOnce(new Error('disco indisponível'))
            .mockResolvedValueOnce(undefined);

        const result = await runBitrixExtractionPurgeSweep();

        expect(result.purgedCount).toBe(1);
        expect(bitrixExtractionRunUpdate).toHaveBeenCalledTimes(1);
    });
});

describe('runBitrixExtractionPurgeSweep — idempotência', () => {
    beforeEach(() => {
        purgeEnabled = true;
    });

    it('pula um run cujo progress já tem purgedAt (já expurgado numa rodada anterior)', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-a' }]);
        bitrixExtractionRunFindMany.mockResolvedValue([
            { id: 'run-ja-expurgado', filters: {}, progress: { purgedAt: '2026-01-01T00:00:00.000Z' } },
        ]);

        const result = await runBitrixExtractionPurgeSweep();

        expect(result.purgedCount).toBe(0);
        expect(deleteExtractionRunFiles).not.toHaveBeenCalled();
        expect(bitrixExtractionRunUpdate).not.toHaveBeenCalled();
    });

    it('rodar a varredura duas vezes seguidas com o mesmo lote não duplica efeito nem falha', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-a' }]);
        // Primeira rodada: run ainda não expurgado.
        bitrixExtractionRunFindMany.mockResolvedValueOnce([{ id: 'run-1', filters: { search: 'x' }, progress: null }]);

        const first = await runBitrixExtractionPurgeSweep();
        expect(first.purgedCount).toBe(1);
        expect(deleteExtractionRunFiles).toHaveBeenCalledTimes(1);

        // Segunda rodada: o Prisma real não devolveria mais este run (createdAt ainda velho, mas
        // suponha que ele continue no WHERE do teste — o guard de idempotência é o que importa aqui).
        const purgedProgress = (bitrixExtractionRunUpdate.mock.calls[0][0] as { data: { progress: unknown } }).data.progress;
        bitrixExtractionRunFindMany.mockResolvedValueOnce([{ id: 'run-1', filters: {}, progress: purgedProgress }]);

        const second = await runBitrixExtractionPurgeSweep();

        expect(second.purgedCount).toBe(0);
        expect(deleteExtractionRunFiles).toHaveBeenCalledTimes(1); // não chamou de novo
        expect(bitrixExtractionRunUpdate).toHaveBeenCalledTimes(1); // não chamou de novo
    });
});
