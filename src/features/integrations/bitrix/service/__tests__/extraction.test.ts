import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bitrixExtractionFailuresTotal } from '../metrics.js';
import { AppError } from '../../../../../shared/middlewares/errorHandler.js';

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const auditServiceMock = { log: vi.fn() };
vi.mock('@/lib/audit/audit.service', () => ({ AuditService: auditServiceMock }));

const prismaMock = {
    bitrixExtractionRun: {
        create: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn(),
    },
};
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const clientMock = { callBitrix: vi.fn(), getConnectionWebhookUrl: vi.fn() };
vi.mock('../client.js', () => clientMock);

const filesMock = {
    writeExtractionFile: vi.fn(),
    readExtractionFile: vi.fn(),
    deleteExtractionRunFiles: vi.fn(),
    toCsv: vi.fn(() => 'csv-content'),
    toJson: vi.fn(() => 'json-content'),
    buildXlsxWorkbook: vi.fn(async () => Buffer.from('xlsx-content')),
};
vi.mock('../extractionFiles.js', () => filesMock);

// Flush de microtasks — `executeExtractionRun` é sempre chamado com `void` (fire-and-forget), então
// os testes precisam de um ponto de sincronização explícito para esperar a cadeia de `await`
// internos terminar antes de fazer as asserções.
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const WEBHOOK_URL = 'https://portal.bitrix24.com.br/rest/1/token/';

function baseRun(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: 'run-1',
        organizationId: 'org-1',
        connectionId: 'conn-1',
        correlationId: 'corr-1',
        entities: ['lead'],
        fields: {},
        filters: { period: 'all' },
        status: 'running',
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    bitrixExtractionFailuresTotal.reset();
    clientMock.getConnectionWebhookUrl.mockResolvedValue(WEBHOOK_URL);
    prismaMock.bitrixExtractionRun.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.bitrixExtractionRun.update.mockResolvedValue({});
    filesMock.writeExtractionFile.mockResolvedValue({ sizeBytes: 10 });
});

describe('createExtractionRun — validação server-side (06A, seções 9/18)', () => {
    it('rejeita sem connectionId', async () => {
        const { createExtractionRun } = await import('../extraction.js');
        await expect(createExtractionRun('org-1', 'user-1', {
            connectionId: '', entities: ['lead'], filters: { period: 'all' },
        })).rejects.toThrow('Informe qual portal Bitrix24 extrair.');
    });

    it('propaga 404 quando a conexão não pertence a esta organização (isolamento de tenant)', async () => {
        clientMock.getConnectionWebhookUrl.mockRejectedValue(new AppError('Conexão Bitrix24 não encontrada para esta organização.', 404));
        const { createExtractionRun } = await import('../extraction.js');
        await expect(createExtractionRun('org-1', 'user-1', {
            connectionId: 'conn-de-outra-org', entities: ['lead'], filters: { period: 'all' },
        })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejeita lista de entidades vazia', async () => {
        const { createExtractionRun } = await import('../extraction.js');
        await expect(createExtractionRun('org-1', 'user-1', {
            connectionId: 'conn-1', entities: [], filters: { period: 'all' },
        })).rejects.toThrow('Selecione ao menos uma entidade');
    });

    it('rejeita entidade desconhecida', async () => {
        const { createExtractionRun } = await import('../extraction.js');
        await expect(createExtractionRun('org-1', 'user-1', {
            connectionId: 'conn-1', entities: ['fatura'], filters: { period: 'all' },
        })).rejects.toThrow(/Entidade\(s\) desconhecida/);
    });

    it('rejeita período inválido', async () => {
        const { createExtractionRun } = await import('../extraction.js');
        await expect(createExtractionRun('org-1', 'user-1', {
            connectionId: 'conn-1', entities: ['lead'], filters: { period: 'ontem' },
        })).rejects.toThrow('Período inválido');
    });

    it('rejeita período "custom" sem data inicial ANTES de criar a linha (falha rápida, síncrona)', async () => {
        const { createExtractionRun } = await import('../extraction.js');
        await expect(createExtractionRun('org-1', 'user-1', {
            connectionId: 'conn-1', entities: ['lead'], filters: { period: 'custom' },
        })).rejects.toThrow('data inicial');
        expect(prismaMock.bitrixExtractionRun.create).not.toHaveBeenCalled();
    });

    it('cria a linha como "queued", grava auditoria e dispara a execução em segundo plano', async () => {
        prismaMock.bitrixExtractionRun.create.mockResolvedValue(baseRun({ status: 'queued' }));
        prismaMock.bitrixExtractionRun.updateMany.mockResolvedValueOnce({ count: 0 }); // execução em segundo plano: já não está mais "queued" quando checarmos (evita side effects nesta suíte)

        const { createExtractionRun } = await import('../extraction.js');
        const run = await createExtractionRun('org-1', 'user-1', {
            connectionId: 'conn-1', entities: ['lead', 'deal'], filters: { period: 'thisMonth' },
        });

        expect(run.status).toBe('queued');
        expect(prismaMock.bitrixExtractionRun.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ organizationId: 'org-1', requestedBy: 'user-1', entities: ['lead', 'deal'], status: 'queued' }),
        }));
        expect(auditServiceMock.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entity: 'BitrixExtractionRun', tenantId: 'org-1' }));

        await flush();
        // A execução em segundo plano tentou reivindicar queued->running — prova de que
        // `createExtractionRun` não é "cria e esquece", ela de fato inicia o processamento.
        expect(prismaMock.bitrixExtractionRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'run-1', organizationId: 'org-1', status: 'queued' },
            data: expect.objectContaining({ status: 'running' }),
        }));
    });
});

describe('executeExtractionRun — paginação, progresso, cancelamento e resiliência (06A, seção 10)', () => {
    it('não faz nada quando a linha não está mais "queued" (corrida/cancelamento antes de começar)', async () => {
        prismaMock.bitrixExtractionRun.updateMany.mockResolvedValue({ count: 0 });
        const { executeExtractionRun } = await import('../extraction.js');
        await executeExtractionRun('org-1', 'run-1');
        expect(prismaMock.bitrixExtractionRun.findFirst).not.toHaveBeenCalled();
    });

    it('pagina até esgotar (next === null), soma o total e marca "completed" com os 3 formatos de arquivo', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue(baseRun({ entities: ['lead'] }));
        clientMock.callBitrix
            .mockResolvedValueOnce({ result: [{ ID: '1' }, { ID: '2' }], next: 2 })
            .mockResolvedValueOnce({ result: [{ ID: '3' }], next: null });

        const { executeExtractionRun } = await import('../extraction.js');
        await executeExtractionRun('org-1', 'run-1');

        expect(clientMock.callBitrix).toHaveBeenCalledTimes(2);
        expect(clientMock.callBitrix).toHaveBeenNthCalledWith(1, WEBHOOK_URL, 'crm.lead.list', expect.objectContaining({ start: 0 }), { correlationId: 'corr-1' });
        expect(clientMock.callBitrix).toHaveBeenNthCalledWith(2, WEBHOOK_URL, 'crm.lead.list', expect.objectContaining({ start: 2 }), { correlationId: 'corr-1' });

        // 3 formatos: CSV por entidade + JSON consolidado + XLSX consolidado.
        expect(filesMock.writeExtractionFile).toHaveBeenCalledTimes(3);
        expect(filesMock.writeExtractionFile).toHaveBeenCalledWith('org-1', 'run-1', 'lead.csv', 'csv-content');
        expect(filesMock.writeExtractionFile).toHaveBeenCalledWith('org-1', 'run-1', 'extraction.json', 'json-content');
        expect(filesMock.writeExtractionFile).toHaveBeenCalledWith('org-1', 'run-1', 'extraction.xlsx', Buffer.from('xlsx-content'));

        expect(prismaMock.bitrixExtractionRun.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'run-1' },
            data: expect.objectContaining({ status: 'completed', totalCount: 3, countByEntity: { lead: 3 } }),
        }));
    });

    it('interrompe no meio ao detectar status "cancelled" — não gera arquivo nem marca "completed"', async () => {
        prismaMock.bitrixExtractionRun.findFirst
            .mockResolvedValueOnce(baseRun({ entities: ['lead'] })) // carga inicial da execução
            .mockResolvedValueOnce({ status: 'running' })          // checagem de cancelamento ANTES da entidade
            .mockResolvedValueOnce({ status: 'cancelled' });       // checagem DENTRO do onPage da 1ª página

        clientMock.callBitrix.mockResolvedValueOnce({ result: [{ ID: '1' }], next: 5 });

        const { executeExtractionRun } = await import('../extraction.js');
        await executeExtractionRun('org-1', 'run-1');

        // só uma página buscada — a 2ª nunca aconteceu porque o cancelamento foi detectado antes
        expect(clientMock.callBitrix).toHaveBeenCalledTimes(1);
        expect(filesMock.writeExtractionFile).not.toHaveBeenCalled();
        expect(prismaMock.bitrixExtractionRun.update).not.toHaveBeenCalled(); // nunca sobrescreve o status 'cancelled' já gravado por cancelExtractionRun
    });

    it('entidade que falha marca status "failed", grava errorMessage e incrementa a métrica de falha por entidade', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue(baseRun({ entities: ['deal'] }));
        clientMock.callBitrix.mockRejectedValue(new Error('Bitrix24 aplicou limite de chamadas (HTTP 429).'));

        const { executeExtractionRun } = await import('../extraction.js');
        await executeExtractionRun('org-1', 'run-1');

        expect(prismaMock.bitrixExtractionRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'run-1', organizationId: 'org-1', status: 'running' },
            data: expect.objectContaining({ status: 'failed', errorMessage: 'Bitrix24 aplicou limite de chamadas (HTTP 429).' }),
        }));
        expect(filesMock.writeExtractionFile).not.toHaveBeenCalled();
        expect(await bitrixExtractionFailuresTotal.get()).toMatchObject({
            values: expect.arrayContaining([expect.objectContaining({ labels: { tenant: 'org-1', entity: 'deal' }, value: 1 })]),
        });
    });

    it('conexão sem webhook associado falha o run inteiro com entity="run" (não processa nenhuma entidade)', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue(baseRun({ connectionId: null }));

        const { executeExtractionRun } = await import('../extraction.js');
        await executeExtractionRun('org-1', 'run-1');

        expect(clientMock.callBitrix).not.toHaveBeenCalled();
        expect(prismaMock.bitrixExtractionRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'failed' }),
        }));
        expect(await bitrixExtractionFailuresTotal.get()).toMatchObject({
            values: expect.arrayContaining([expect.objectContaining({ labels: { tenant: 'org-1', entity: 'run' } })]),
        });
    });

    it('período "custom" inválido persistido na linha (corrompido/editado fora do fluxo normal) falha o run com mensagem clara', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue(baseRun({ filters: { period: 'custom' } }));

        const { executeExtractionRun } = await import('../extraction.js');
        await executeExtractionRun('org-1', 'run-1');

        expect(prismaMock.bitrixExtractionRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'failed', errorMessage: expect.stringContaining('data inicial') }),
        }));
    });

    it('respeita o teto de segurança de páginas em vez de rodar para sempre quando o Bitrix nunca devolve next=null', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue(baseRun({ entities: ['lead'] }));
        let call = 0;
        clientMock.callBitrix.mockImplementation(async () => {
            call++;
            return { result: [{ ID: String(call) }], next: call * 50 }; // nunca esgota
        });

        const { executeExtractionRun } = await import('../extraction.js');
        await executeExtractionRun('org-1', 'run-1');

        expect(clientMock.callBitrix).toHaveBeenCalledTimes(500); // PAGE_SAFETY_CAP
        // Mesmo tendo batido no teto (não esgotou o portal), a execução ainda finaliza como
        // "completed" com o que conseguiu — não trava a linha em "running" para sempre.
        expect(prismaMock.bitrixExtractionRun.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'completed', totalCount: 500 }),
        }));
    });

    it('não aplica ASSIGNED_BY_ID a entidades sem esse campo (empresa) — evita filtro que o Bitrix rejeitaria', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue(baseRun({
            entities: ['company'],
            filters: { period: 'all', assignedById: '7' },
        }));
        clientMock.callBitrix.mockResolvedValueOnce({ result: [], next: null });

        const { executeExtractionRun } = await import('../extraction.js');
        await executeExtractionRun('org-1', 'run-1');

        const [, , params] = clientMock.callBitrix.mock.calls[0];
        expect((params as { filter: Record<string, unknown> }).filter).not.toHaveProperty('ASSIGNED_BY_ID');
    });

    it('user.get nunca recebe "select" (a API não aceita) mesmo com campos pedidos', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue(baseRun({ entities: ['user'], fields: { user: ['EMAIL'] } }));
        clientMock.callBitrix.mockResolvedValueOnce({ result: [], next: null });

        const { executeExtractionRun } = await import('../extraction.js');
        await executeExtractionRun('org-1', 'run-1');

        const [, method, params] = clientMock.callBitrix.mock.calls[0];
        expect(method).toBe('user.get');
        expect(params).not.toHaveProperty('select');
    });
});

describe('cancelExtractionRun', () => {
    it('cancela quando está queued/running (transição atômica) e grava auditoria', async () => {
        prismaMock.bitrixExtractionRun.updateMany.mockResolvedValue({ count: 1 });
        const { cancelExtractionRun } = await import('../extraction.js');
        await cancelExtractionRun('org-1', 'run-1');
        expect(prismaMock.bitrixExtractionRun.updateMany).toHaveBeenCalledWith({
            where: { id: 'run-1', organizationId: 'org-1', status: { in: ['queued', 'running'] } },
            data: expect.objectContaining({ status: 'cancelled' }),
        });
        expect(auditServiceMock.log).toHaveBeenCalled();
    });

    it('404 quando a extração não existe (ou é de outra organização)', async () => {
        prismaMock.bitrixExtractionRun.updateMany.mockResolvedValue({ count: 0 });
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue(null);
        const { cancelExtractionRun } = await import('../extraction.js');
        await expect(cancelExtractionRun('org-1', 'run-inexistente')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('400 quando a extração já terminou (não é mais queued/running)', async () => {
        prismaMock.bitrixExtractionRun.updateMany.mockResolvedValue({ count: 0 });
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue({ id: 'run-1' });
        const { cancelExtractionRun } = await import('../extraction.js');
        await expect(cancelExtractionRun('org-1', 'run-1')).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('getExtractionRun / listExtractionRuns — isolamento de tenant', () => {
    it('getExtractionRun busca sempre com organizationId no WHERE (nunca só pelo id)', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue(baseRun());
        const { getExtractionRun } = await import('../extraction.js');
        await getExtractionRun('org-1', 'run-1');
        expect(prismaMock.bitrixExtractionRun.findFirst).toHaveBeenCalledWith({ where: { id: 'run-1', organizationId: 'org-1' } });
    });

    it('getExtractionRun 404 para execução de outra organização', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue(null);
        const { getExtractionRun } = await import('../extraction.js');
        await expect(getExtractionRun('org-1', 'run-de-outra-org')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('listExtractionRuns escopa por organizationId e limita "take" a 100', async () => {
        prismaMock.bitrixExtractionRun.findMany.mockResolvedValue([]);
        const { listExtractionRuns } = await import('../extraction.js');
        await listExtractionRuns('org-1', 9999);
        expect(prismaMock.bitrixExtractionRun.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-1' }, take: 100 }));
    });
});

describe('deleteExtractionRun — exclusão precisa remover o arquivo, não só a linha (LGPD)', () => {
    it('remove os arquivos em disco E a linha do histórico', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue({ id: 'run-1' });
        prismaMock.bitrixExtractionRun.delete.mockResolvedValue({});
        const { deleteExtractionRun } = await import('../extraction.js');
        await deleteExtractionRun('org-1', 'run-1');
        expect(filesMock.deleteExtractionRunFiles).toHaveBeenCalledWith('org-1', 'run-1');
        expect(prismaMock.bitrixExtractionRun.delete).toHaveBeenCalledWith({ where: { id: 'run-1' } });
    });

    it('404 sem deletar nada quando a extração não é desta organização', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue(null);
        const { deleteExtractionRun } = await import('../extraction.js');
        await expect(deleteExtractionRun('org-1', 'run-de-outra-org')).rejects.toMatchObject({ statusCode: 404 });
        expect(filesMock.deleteExtractionRunFiles).not.toHaveBeenCalled();
    });
});

describe('downloadExtractionFile — nunca serve arquivo sem checar tenant/status/existência real em disco', () => {
    it('404 quando a extração não é desta organização', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue(null);
        const { downloadExtractionFile } = await import('../extraction.js');
        await expect(downloadExtractionFile('org-1', 'run-x', 'csv', 'lead')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('400 quando a extração ainda não terminou', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue({ status: 'running', files: null });
        const { downloadExtractionFile } = await import('../extraction.js');
        await expect(downloadExtractionFile('org-1', 'run-x', 'csv', 'lead')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('CSV sem "entity" informado devolve 400 pedindo a entidade', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue({ status: 'completed', files: [{ format: 'csv', entity: 'lead', filename: 'lead.csv' }] });
        const { downloadExtractionFile } = await import('../extraction.js');
        await expect(downloadExtractionFile('org-1', 'run-x', 'csv')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('410 quando o histórico existe mas o arquivo não está mais em disco (armazenamento efêmero)', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue({ status: 'completed', files: [{ format: 'json', entity: null, filename: 'extraction.json' }] });
        filesMock.readExtractionFile.mockResolvedValue(null);
        const { downloadExtractionFile } = await import('../extraction.js');
        await expect(downloadExtractionFile('org-1', 'run-x', 'json')).rejects.toMatchObject({ statusCode: 410 });
    });

    it('devolve o buffer, nome e content-type corretos para cada formato', async () => {
        prismaMock.bitrixExtractionRun.findFirst.mockResolvedValue({
            status: 'completed',
            files: [
                { format: 'csv', entity: 'lead', filename: 'lead.csv' },
                { format: 'xlsx', entity: null, filename: 'extraction.xlsx' },
            ],
        });
        filesMock.readExtractionFile.mockResolvedValue(Buffer.from('conteudo'));
        const { downloadExtractionFile } = await import('../extraction.js');

        const csvResult = await downloadExtractionFile('org-1', 'run-x', 'csv', 'lead');
        expect(csvResult.filename).toBe('lead.csv');
        expect(csvResult.contentType).toBe('text/csv; charset=utf-8');

        const xlsxResult = await downloadExtractionFile('org-1', 'run-x', 'xlsx');
        expect(xlsxResult.filename).toBe('extraction.xlsx');
        expect(xlsxResult.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });
});
