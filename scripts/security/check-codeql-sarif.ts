// scripts/security/check-codeql-sarif.ts
//
// Gate real de CodeQL (ITEM-10, Onda 2 — CodeQL/Trivy/Dependency Review bloqueantes).
//
// `github/codeql-action/analyze` publica o SARIF na aba Security do GitHub, mas o *step* em si
// sai com código 0 mesmo quando a análise encontra achados — CodeQL não bloqueia PR sozinho por
// padrão. Este script fecha essa lacuna lendo o(s) arquivo(s) `.sarif` que o próprio
// `codeql-action/analyze` grava localmente (input `output`, default `../results`) e falha
// (exit 1) se algum resultado tiver `level: "error"` — o nível que os suites padrão do CodeQL
// (`security-extended`/`security-and-quality`) usam para achado de segurança de alta confiança,
// distinto de `warning`/`note` (estilo, manutenibilidade, baixa confiança).
//
// Falso positivo: nunca suprimir desativando a query inteira ou pulando este gate. A política
// deste repositório é excluir a regra específica (por `id`) via `query-filters` em
// `.github/codeql/codeql-config.yml`, com um comentário obrigatório (dono, data, motivo) acima da
// exclusão — mesmo padrão de governança usado em docs/security/AUDIT_WAIVERS.md para npm audit.
//
// AUDITORIA (27/08/2026) — "`npm run security:codeql-sarif` sai com exit 0 e nenhum .sarif é
// gerado neste ambiente": comportamento esperado, não um bug. Este script nunca gera SARIF — ele
// só LÊ o que `github/codeql-action/analyze` (a CodeQL Action real do GitHub, que embute o CLI e
// os bancos de dados de query) já gravou em `results/` antes dele, no mesmo job de
// `.github/workflows/codeql.yml`. Um sandbox/dev local não tem esse passo anterior (não há
// instalação do CodeQL CLI/Action aqui), então `results/` não existe, cai no ramo "nenhum arquivo
// .sarif encontrado" abaixo e sai 0 de propósito — ausência de SARIF é tratada como "nada a
// checar", não como "nenhum achado", e a mensagem de log já diz isso explicitamente. Isto NÃO é a
// fonte de verdade de segurança: o gate real roda em CI, onde o SARIF existe de verdade (ver
// `tests/unit/security-codeql-sarif.test.ts` para a lógica de `findBlockingResults` testada com
// SARIF sintético). Rodar `npx tsx scripts/security/check-codeql-sarif.ts <dir>` localmente só é
// significativo depois de gerar SARIF de verdade nesse `<dir>` (ex.: rodando o CodeQL CLI à mão).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

type SarifResult = {
    level?: string;
    ruleId?: string;
    message?: { text?: string };
    locations?: Array<{
        physicalLocation?: {
            artifactLocation?: { uri?: string };
            region?: { startLine?: number };
        };
    }>;
};

type SarifRun = { results?: SarifResult[] };
type SarifLog = { runs?: SarifRun[] };

export function findBlockingResults(sarif: SarifLog): SarifResult[] {
    const runs = sarif.runs ?? [];
    return runs.flatMap((run) => (run.results ?? []).filter((result) => result.level === 'error'));
}

export function describeResult(result: SarifResult): string {
    const loc = result.locations?.[0]?.physicalLocation;
    const uri = loc?.artifactLocation?.uri ?? '(local desconhecido)';
    const line = loc?.region?.startLine;
    const where = line ? `${uri}:${line}` : uri;
    const message = result.message?.text ?? '';
    return `   - [${result.ruleId ?? 'regra desconhecida'}] ${where} — ${message}`.trimEnd();
}

function listSarifFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => f.endsWith('.sarif'));
}

function main(): void {
    const dir = process.argv[2] ?? path.resolve(process.cwd(), 'results');
    const sarifFiles = listSarifFiles(dir);

    if (sarifFiles.length === 0) {
        console.log(
            `ℹ️  Nenhum arquivo .sarif encontrado em "${dir}" — nada a checar (a análise desta ` +
            `linguagem pode não ter rodado, ou o diretório de output foi outro).`
        );
        return;
    }

    const blocking: Array<{ file: string; result: SarifResult }> = [];
    for (const file of sarifFiles) {
        const full = path.join(dir, file);
        const parsed = JSON.parse(readFileSync(full, 'utf-8')) as SarifLog;
        for (const result of findBlockingResults(parsed)) {
            blocking.push({ file, result });
        }
    }

    if (blocking.length === 0) {
        console.log(
            `✅ CodeQL: nenhum achado "error"-level em ${sarifFiles.length} arquivo(s) SARIF (${dir}). Gate OK.`
        );
        return;
    }

    console.error(`❌ CodeQL encontrou ${blocking.length} achado(s) "error"-level:`);
    for (const { file, result } of blocking) {
        console.error(`   SARIF: ${file}`);
        console.error(describeResult(result));
    }
    console.error(
        'Corrija o achado, ou registre uma exclusão de regra específica (com dono/data/motivo) em ' +
        '.github/codeql/codeql-config.yml (query-filters) — nunca desative a query inteira ou este ' +
        'gate para contornar.'
    );
    process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
