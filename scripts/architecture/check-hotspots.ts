// scripts/architecture/check-hotspots.ts
//
// Gate de "arquivo excessivamente grande" (ITEM-13, dívida técnica). Sem isso, um arquivo pode
// crescer sem limite depois de uma refatoração (ex.: server.ts, 774 linhas antes do ITEM-07) sem
// nenhum sinal automático — só uma auditoria manual eventual descobre.
//
// Varre src/**/*.{ts,tsx} + server.ts + worker.ts (exclui testes, .d.ts, dist/build/android/ios),
// conta linhas, e classifica cada arquivo:
//   - <= WARN_LIMIT_LINES: OK.
//   - > WARN_LIMIT_LINES e <= HARD_LIMIT_LINES: aviso não-bloqueante.
//   - > HARD_LIMIT_LINES: falha o gate, a menos que docs/architecture/HOTSPOT_EXCEPTIONS.md tenha
//     uma exceção ativa (dono + prazo não vencido) cobrindo um limite >= ao tamanho atual.
//
// Segue o mesmo padrão de waiver documentado já usado neste repositório para `npm audit`
// (scripts/security/check-audit-waivers.ts + docs/security/AUDIT_WAIVERS.md): dívida aceita é
// dívida explícita, com dono e prazo, não dívida escondida atrás de um `continue-on-error` solto.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARD_LIMIT_LINES = 1000;
export const WARN_LIMIT_LINES = 700;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXCEPTIONS_PATH = path.join(ROOT, 'docs/architecture/HOTSPOT_EXCEPTIONS.md');

const SCAN_ROOTS = ['src', 'server.ts', 'worker.ts'];

const EXCLUDED_DIR_NAMES = new Set([
    'node_modules',
    'dist',
    'build',
    'coverage',
    'playwright-report',
    'android',
    'ios',
    '__tests__',
    'tests',
]);

function isSourceFile(fileName: string): boolean {
    if (!/\.(ts|tsx)$/.test(fileName)) return false;
    if (/\.d\.ts$/.test(fileName)) return false;
    if (/\.(test|spec)\.(ts|tsx)$/.test(fileName)) return false;
    return true;
}

export function listSourceFiles(root: string = ROOT): string[] {
    const results: string[] = [];

    function walk(absDir: string, relDir: string) {
        for (const entry of readdirSync(absDir, { withFileTypes: true })) {
            if (entry.name.startsWith('.')) continue;
            const absPath = path.join(absDir, entry.name);
            const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

            if (entry.isDirectory()) {
                if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
                walk(absPath, relPath);
                continue;
            }
            if (entry.isFile() && isSourceFile(entry.name)) {
                results.push(relPath);
            }
        }
    }

    for (const scanRoot of SCAN_ROOTS) {
        const absRoot = path.join(root, scanRoot);
        let stat;
        try {
            stat = statSync(absRoot);
        } catch {
            continue; // worker.ts pode não existir em todo checkout; não é erro do gate.
        }
        if (stat.isDirectory()) {
            walk(absRoot, scanRoot);
        } else if (stat.isFile() && isSourceFile(scanRoot)) {
            results.push(scanRoot);
        }
    }

    return results.sort();
}

export function countLines(absPath: string): number {
    const content = readFileSync(absPath, 'utf-8');
    if (content.length === 0) return 0;
    return content.split('\n').length;
}

export type HotspotException = {
    file: string;
    limitLines: number;
    owner: string | null;
    reavaliarAte: string | null; // YYYY-MM-DD, texto cru do doc
};

// Extrai os blocos "### `caminho`" da seção "## Exceções ativas" — para antes do próximo "## ".
export function parseExceptions(markdown: string): HotspotException[] {
    const sectionMatch = markdown.match(/## Exceções ativas\n([\s\S]*?)(?=\n## |$)/);
    if (!sectionMatch) return [];
    const section = sectionMatch[1];

    const entries: HotspotException[] = [];
    const blockPattern = /### `([^`]+)`\n([\s\S]*?)(?=\n### |$)/g;
    let match: RegExpExecArray | null;
    while ((match = blockPattern.exec(section)) !== null) {
        const [, file, body] = match;
        const limitMatch = body.match(/\*\*Limite excepcional:\*\*\s*(\d+)/);
        const ownerMatch = body.match(/\*\*Dono:\*\*\s*(.+)/);
        const dateMatch = body.match(/\*\*Reavaliar até:\*\*\s*(\d{4}-\d{2}-\d{2})/);
        entries.push({
            file: file.trim(),
            limitLines: limitMatch ? Number(limitMatch[1]) : 0,
            owner: ownerMatch ? ownerMatch[1].trim() : null,
            reavaliarAte: dateMatch ? dateMatch[1] : null,
        });
    }
    return entries;
}

export type FileVerdict =
    | { status: 'ok'; file: string; lines: number }
    | { status: 'warn'; file: string; lines: number; reason: string }
    | { status: 'ok-exception'; file: string; lines: number; exception: HotspotException }
    | { status: 'fail'; file: string; lines: number; reason: string };

export function evaluateFile(
    file: string,
    lines: number,
    exceptions: HotspotException[],
    now: Date = new Date(),
): FileVerdict {
    if (lines <= WARN_LIMIT_LINES) {
        return { status: 'ok', file, lines };
    }

    if (lines <= HARD_LIMIT_LINES) {
        return {
            status: 'warn',
            file,
            lines,
            reason: `${lines} linhas (limite de aviso: ${WARN_LIMIT_LINES}, limite de falha: ${HARD_LIMIT_LINES}). Considere modularizar antes de crescer mais.`,
        };
    }

    const exception = exceptions.find((entry) => entry.file === file);
    if (!exception) {
        return {
            status: 'fail',
            file,
            lines,
            reason: `${lines} linhas > limite de ${HARD_LIMIT_LINES} e sem exceção registrada em docs/architecture/HOTSPOT_EXCEPTIONS.md.`,
        };
    }
    if (!exception.owner || !exception.reavaliarAte) {
        return {
            status: 'fail',
            file,
            lines,
            reason: `exceção registrada para este arquivo em HOTSPOT_EXCEPTIONS.md está incompleta (falta Dono e/ou Reavaliar até) — exceção inválida.`,
        };
    }
    const reavaliarAte = new Date(exception.reavaliarAte);
    if (Number.isNaN(reavaliarAte.getTime()) || reavaliarAte.getTime() < now.getTime()) {
        return {
            status: 'fail',
            file,
            lines,
            reason: `exceção registrada em HOTSPOT_EXCEPTIONS.md está com prazo vencido (Reavaliar até: ${exception.reavaliarAte}) — renove a exceção (nova data + confirmação do dono) ou modularize o arquivo.`,
        };
    }
    if (lines > exception.limitLines) {
        return {
            status: 'fail',
            file,
            lines,
            reason: `${lines} linhas excede o limite excepcional registrado (${exception.limitLines}) — atualize a exceção ou reduza o arquivo.`,
        };
    }

    return { status: 'ok-exception', file, lines, exception };
}

function readExceptions(): HotspotException[] {
    let raw: string;
    try {
        raw = readFileSync(EXCEPTIONS_PATH, 'utf-8');
    } catch {
        return [];
    }
    return parseExceptions(raw);
}

function main(): void {
    const exceptions = readExceptions();
    const files = listSourceFiles();
    const now = new Date();

    const warns: FileVerdict[] = [];
    const fails: FileVerdict[] = [];
    const okExceptions: FileVerdict[] = [];

    for (const file of files) {
        const lines = countLines(path.join(ROOT, file));
        const verdict = evaluateFile(file, lines, exceptions, now);
        if (verdict.status === 'warn') warns.push(verdict);
        if (verdict.status === 'fail') fails.push(verdict);
        if (verdict.status === 'ok-exception') okExceptions.push(verdict);
    }

    // Exceções registradas para arquivos que não existem mais, ou que já não precisam mais dela
    // (arquivo encolheu abaixo do limite de falha) — aviso não-bloqueante para manter o doc limpo.
    const usedFiles = new Set(okExceptions.map((v) => v.file));
    const staleExceptions = exceptions.filter((exception) => !usedFiles.has(exception.file));

    if (warns.length > 0) {
        console.warn(`⚠️  ${warns.length} arquivo(s) grande(s) (aviso não-bloqueante):`);
        for (const w of warns) {
            if (w.status === 'warn') console.warn(`   - ${w.file}: ${w.reason}`);
        }
    }

    if (okExceptions.length > 0) {
        console.log(`ℹ️  ${okExceptions.length} arquivo(s) cobertos por exceção ativa em HOTSPOT_EXCEPTIONS.md:`);
        for (const v of okExceptions) {
            if (v.status === 'ok-exception') {
                console.log(`   - ${v.file}: ${v.lines} linhas (limite excepcional: ${v.exception.limitLines}, dono: ${v.exception.owner}, reavaliar até: ${v.exception.reavaliarAte})`);
            }
        }
    }

    if (staleExceptions.length > 0) {
        console.warn(`⚠️  ${staleExceptions.length} exceção(ões) em HOTSPOT_EXCEPTIONS.md não correspondem a nenhum arquivo que hoje precise dela (arquivo removido ou encolhido) — considere limpar o doc:`);
        for (const e of staleExceptions) console.warn(`   - ${e.file}`);
    }

    if (fails.length > 0) {
        console.error(`❌ ${fails.length} hotspot(s) bloqueando o gate:`);
        for (const f of fails) {
            if (f.status === 'fail') console.error(`   - ${f.file}: ${f.reason}`);
        }
        console.error(
            'Registre uma exceção em docs/architecture/HOTSPOT_EXCEPTIONS.md (dono + prazo) ou reduza o arquivo.',
        );
        process.exit(1);
    }

    console.log(
        `✅ check:hotspots — ${files.length} arquivo(s) verificado(s), 0 acima de ${HARD_LIMIT_LINES} linhas sem exceção válida.`,
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
