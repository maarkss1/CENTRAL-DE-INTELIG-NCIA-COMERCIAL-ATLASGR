import { describe, it, expect, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import * as ExcelJS from 'exceljs';

// Precisa ser setado ANTES do primeiro import de src/config/env.ts (transitivo, via
// extractionFiles.js) — env.ts lê process.env uma única vez, no module load.
const TMP_ROOT = path.join(os.tmpdir(), `bitrix-extraction-files-test-${Date.now()}`);
process.env.BITRIX_EXTRACTION_STORAGE_DIR = TMP_ROOT;

afterAll(async () => {
    await fs.rm(TMP_ROOT, { recursive: true, force: true });
});

describe('toCsv — compatível com Excel PT-BR (06A, seção 12)', () => {
    it('usa ; como delimitador (não , — que é separador decimal em PT-BR) e BOM UTF-8', async () => {
        const { toCsv } = await import('../extractionFiles.js');
        const csv = toCsv([{ NOME: 'João', VALOR: '10,50' }]);
        expect(csv.startsWith('﻿')).toBe(true);
        expect(csv).toContain('NOME;VALOR');
        expect(csv).toContain('João;10,50');
    });

    it('escapa valor com ; ou aspas ou quebra de linha (formato RFC4180)', async () => {
        const { toCsv } = await import('../extractionFiles.js');
        const csv = toCsv([{ COMENTARIO: 'linha1;"citada"\nlinha2' }]);
        expect(csv).toContain('"linha1;""citada""\nlinha2"');
    });

    it('une o cabeçalho de linhas com formas diferentes (campos UF_CRM_* variáveis) sem perder colunas', async () => {
        const { toCsv } = await import('../extractionFiles.js');
        const csv = toCsv([{ A: '1' }, { A: '2', B: '3' }]);
        const [header] = csv.replace('﻿', '').split('\r\n');
        expect(header.split(';').sort()).toEqual(['A', 'B']);
    });

    it('nunca inclui webhook/token/segredo — os registros do Bitrix não carregam essas chaves, mas confirma que nenhuma transformação as introduz', async () => {
        const { toCsv } = await import('../extractionFiles.js');
        const csv = toCsv([{ TITLE: 'Negócio X', ID: '42' }]);
        expect(csv.toLowerCase()).not.toContain('webhook');
        expect(csv.toLowerCase()).not.toContain('token');
    });
});

describe('writeExtractionFile / readExtractionFile / deleteExtractionRunFiles — armazenamento em disco escopado por organização+execução', () => {
    it('escreve e lê de volta o conteúdo exato', async () => {
        const { writeExtractionFile, readExtractionFile } = await import('../extractionFiles.js');
        const { sizeBytes } = await writeExtractionFile('org-1', 'run-1', 'lead.csv', 'conteudo-de-teste');
        expect(sizeBytes).toBeGreaterThan(0);
        const buffer = await readExtractionFile('org-1', 'run-1', 'lead.csv');
        expect(buffer?.toString('utf8')).toBe('conteudo-de-teste');
    });

    it('devolve null (não lança) quando o arquivo não existe — a rota de download trata isso como 410, nunca como 500', async () => {
        const { readExtractionFile } = await import('../extractionFiles.js');
        const buffer = await readExtractionFile('org-1', 'run-inexistente', 'lead.csv');
        expect(buffer).toBeNull();
    });

    it('isola por organização — a mesma runId sob outra organização não enxerga o arquivo', async () => {
        const { writeExtractionFile, readExtractionFile } = await import('../extractionFiles.js');
        await writeExtractionFile('org-a', 'run-x', 'lead.csv', 'dado-da-org-a');
        const crossTenantRead = await readExtractionFile('org-b', 'run-x', 'lead.csv');
        expect(crossTenantRead).toBeNull();
    });

    it('deleteExtractionRunFiles remove o diretório inteiro da execução', async () => {
        const { writeExtractionFile, readExtractionFile, deleteExtractionRunFiles } = await import('../extractionFiles.js');
        await writeExtractionFile('org-del', 'run-del', 'lead.csv', 'x');
        await deleteExtractionRunFiles('org-del', 'run-del');
        expect(await readExtractionFile('org-del', 'run-del', 'lead.csv')).toBeNull();
    });
});

describe('buildXlsxWorkbook — pacote consolidado (06A, seção 12)', () => {
    it('gera uma aba por entidade, com cabeçalho em negrito e os dados corretos', async () => {
        const { buildXlsxWorkbook } = await import('../extractionFiles.js');
        const buffer = await buildXlsxWorkbook([
            { entity: 'lead', label: 'Leads', rows: [{ ID: '1', TITLE: 'Lead A' }, { ID: '2', TITLE: 'Lead B' }] },
            { entity: 'deal', label: 'Negócios', rows: [{ ID: '10', TITLE: 'Negócio X' }] },
        ]);
        expect(buffer.length).toBeGreaterThan(0);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        expect(workbook.worksheets.map((s) => s.name)).toEqual(['Leads', 'Negócios']);

        const leadsSheet = workbook.getWorksheet('Leads')!;
        expect(leadsSheet.getRow(1).getCell(1).value).toBe('ID');
        expect(leadsSheet.getRow(2).getCell(2).value).toBe('Lead A');
        expect(leadsSheet.getRow(1).font?.bold).toBe(true);
    });

    it('entidade sem nenhum registro ainda gera a aba, com aviso em vez de planilha vazia sem explicação', async () => {
        const { buildXlsxWorkbook } = await import('../extractionFiles.js');
        const buffer = await buildXlsxWorkbook([{ entity: 'contact', label: 'Contatos', rows: [] }]);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.getWorksheet('Contatos')!;
        expect(String(sheet.getRow(1).getCell(1).value)).toMatch(/nenhum registro/i);
    });
});

describe('toJson', () => {
    it('serializa com identação legível e preserva a estrutura', async () => {
        const { toJson } = await import('../extractionFiles.js');
        const json = toJson({ a: 1, b: [1, 2, 3] });
        expect(JSON.parse(json)).toEqual({ a: 1, b: [1, 2, 3] });
        expect(json).toContain('\n');
    });
});
