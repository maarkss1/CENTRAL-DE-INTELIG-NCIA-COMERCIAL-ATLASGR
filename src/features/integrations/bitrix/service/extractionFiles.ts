import fs from 'node:fs/promises';
import path from 'node:path';
// Named exports apenas (sem `export default`/`export =` no .d.ts do pacote) — import default
// quebraria o typecheck (`npx tsc --noEmit`), já que este projeto não liga `esModuleInterop`.
import * as ExcelJS from 'exceljs';
import { env } from '../../../../config/env.js';

/**
 * Geração/persistência dos arquivos exportados pelo serviço real de Extrações Bitrix. Guarda só o
 * conteúdo gerado em disco, escopado por organização+execução — `BitrixExtractionRun.files` (json)
 * guarda apenas METADADOS (formato, tamanho, data), nunca o conteúdo, conforme o handoff que
 * destravou o schema (`.agents/handoffs/onda-6/01A-para-06-bitrix-extraction-run-schema.md`).
 *
 * Limitação conhecida, documentada (não escondida): em produção (Render, plano free — ver
 * render.yaml e o aviso já existente sobre a sessão do WhatsApp em Integrations.tsx) o disco não é
 * garantidamente persistente entre reinícios/hibernação do processo. Um arquivo pode deixar de
 * existir mesmo com o histórico da extração (linha em BitrixExtractionRun) continuando íntegro —
 * `readExtractionFile` devolve `null` nesse caso, e a rota de download responde 410 explicando a
 * situação, nunca silenciosamente um arquivo vazio/corrompido ou um 200 mentiroso.
 */

export type ExtractionFileFormat = 'csv' | 'xlsx' | 'json';

export const EXTRACTION_FILE_FORMATS: readonly ExtractionFileFormat[] = ['csv', 'xlsx', 'json'];

const STORAGE_ROOT = path.resolve(env.BITRIX_EXTRACTION_STORAGE_DIR);

export interface ExtractionEntityDataset {
    entity: string;
    label: string;
    rows: Record<string, unknown>[];
}

// organizationId/runId são sempre ids gerados pelo próprio sistema (cuid), nunca aceitos cru do
// cliente para montar caminho — path.basename() é defesa em profundidade contra path traversal,
// não a única barreira (a rota de download nunca aceita um path vindo do cliente, só reconstrói
// determinaticamente a partir de organizationId (do usuário autenticado) + runId (validado contra
// o banco) + um enum fechado de formato/entidade).
function runDir(organizationId: string, runId: string): string {
    return path.join(STORAGE_ROOT, path.basename(organizationId), path.basename(runId));
}

function extractionFilePath(organizationId: string, runId: string, filename: string): string {
    return path.join(runDir(organizationId, runId), path.basename(filename));
}

async function ensureRunDir(organizationId: string, runId: string): Promise<void> {
    await fs.mkdir(runDir(organizationId, runId), { recursive: true });
}

export async function writeExtractionFile(
    organizationId: string,
    runId: string,
    filename: string,
    content: string | Buffer,
): Promise<{ sizeBytes: number }> {
    await ensureRunDir(organizationId, runId);
    const filePath = extractionFilePath(organizationId, runId, filename);
    await fs.writeFile(filePath, content);
    const stat = await fs.stat(filePath);
    return { sizeBytes: stat.size };
}

export async function readExtractionFile(organizationId: string, runId: string, filename: string): Promise<Buffer | null> {
    try {
        return await fs.readFile(extractionFilePath(organizationId, runId, filename));
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
    }
}

/** Remove todos os arquivos gerados de uma execução — usado pelo cancelamento/expurgo futuro (ver seção LGPD do handoff do schema: excluir o histórico precisa remover o arquivo, não só a linha). */
export async function deleteExtractionRunFiles(organizationId: string, runId: string): Promise<void> {
    await fs.rm(runDir(organizationId, runId), { recursive: true, force: true });
}

function csvEscape(value: unknown): string {
    if (value === null || value === undefined) return '';
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * `;` como delimitador (não `,`) — no Excel configurado em PT-BR, `,` é o separador decimal, e um
 * CSV com `,` como delimitador de campo abre com todos os valores numa coluna só. BOM UTF-8 no
 * início (mesmo padrão de `LeadController.exportLeadsCsv`) evita acento quebrado no Excel Windows.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
    const headerSet = new Set<string>();
    for (const row of rows) for (const key of Object.keys(row)) headerSet.add(key);
    const headers = Array.from(headerSet);
    if (headers.length === 0) return '﻿';
    const lines = [headers.join(';')];
    for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(';'));
    return '﻿' + lines.join('\r\n');
}

function serializeCell(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    return JSON.stringify(value);
}

/** Nome de aba do Excel é limitado a 31 caracteres e não aceita alguns símbolos — normaliza antes de usar. */
function safeSheetName(label: string): string {
    return label.replace(/[[\]*/\\?:]/g, ' ').slice(0, 31) || 'Dados';
}

export async function buildXlsxWorkbook(datasets: ExtractionEntityDataset[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AtlasGR Prospector — Extrações Bitrix24';
    workbook.created = new Date();

    for (const dataset of datasets) {
        const sheet = workbook.addWorksheet(safeSheetName(dataset.label));
        const headerSet = new Set<string>();
        for (const row of dataset.rows) for (const key of Object.keys(row)) headerSet.add(key);
        const headers = Array.from(headerSet);

        if (headers.length === 0) {
            sheet.addRow(['Nenhum registro encontrado para esta entidade com os filtros aplicados.']);
            continue;
        }

        sheet.columns = headers.map((h) => ({ header: h, key: h, width: Math.min(40, Math.max(12, h.length + 2)) }));
        for (const row of dataset.rows) {
            sheet.addRow(headers.reduce<Record<string, unknown>>((acc, h) => { acc[h] = serializeCell(row[h]); return acc; }, {}));
        }
        sheet.getRow(1).font = { bold: true };
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    }

    if (workbook.worksheets.length === 0) {
        workbook.addWorksheet('Sem dados');
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
}

export function toJson(payload: unknown): string {
    return JSON.stringify(payload, null, 2);
}
