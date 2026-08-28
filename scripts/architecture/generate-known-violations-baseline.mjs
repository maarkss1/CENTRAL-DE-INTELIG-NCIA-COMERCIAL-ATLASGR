// scripts/architecture/generate-known-violations-baseline.mjs
//
// Regenera .dependency-cruiser-known-violations.json a partir do estado ATUAL do repositório.
//
// Uso deliberadamente manual (`npm run lint:architecture:baseline`) — NUNCA rodar isso em CI.
// Se o CI regenerasse a baseline sozinho, qualquer PR que introduzisse um import cross-feature
// novo "resolveria" a violação apenas re-gerando o arquivo, o que anula o propósito do gate (ver
// docs/architecture/DEPENDENCY_RULES.md, "Mecanismo de ratchet").
//
// Depois de rodar, revise o diff de `.dependency-cruiser-known-violations.json` manualmente: o
// total só deve mudar por (a) uma violação real ter sido corrigida (some da baseline) ou (b) uma
// exceção nova, documentada com dono em docs/architecture/KNOWN_VIOLATIONS.md, ter sido aceita.

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUTPUT_PATH = path.join(ROOT, '.dependency-cruiser-known-violations.json');

// Comando fixo, sem nenhum valor vindo de fora deste arquivo (nem argv, nem env) — seguro para
// montar como string única em vez de array de args, o padrão que `execSync` (sempre via shell)
// espera. No Windows, `npx` só existe como `npx.cmd`; `execFileSync('npx', [...])` sem shell falha
// com ENOENT, e `execFileSync(..., { shell: true })` dispara o aviso de depreciação DEP0190 do
// Node por misturar `args` com `shell: true`. `execSync` com uma string já monta o comando dessa
// forma sem gerar o aviso.
const DEPCRUISE_CMD = 'npx depcruise --config .dependency-cruiser.cjs --output-type json src server.ts worker.ts';

function runDepcruise() {
    const stdout = execSync(DEPCRUISE_CMD, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(stdout);
}

export function buildBaseline(report) {
    const violations = report?.summary?.violations ?? [];

    const trimmed = violations.map((violation) => {
        const entry = {
            type: violation.type,
            from: violation.from,
            rule: { name: violation.rule.name, severity: violation.rule.severity },
        };
        if (violation.to) entry.to = violation.to;
        if (violation.cycle) entry.cycle = violation.cycle;
        return entry;
    });

    trimmed.sort((a, b) => {
        const keyA = `${a.from}|${a.to ?? ''}|${a.rule.name}`;
        const keyB = `${b.from}|${b.to ?? ''}|${b.rule.name}`;
        return keyA.localeCompare(keyB);
    });

    return trimmed;
}

function main() {
    const report = runDepcruise();
    const baseline = buildBaseline(report);
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf-8');
    // eslint-disable-next-line no-console
    console.log(
        `Baseline regenerada: ${baseline.length} violação(ões) em ${path.relative(ROOT, OUTPUT_PATH)}.\n` +
            'Revise o diff manualmente antes de commitar — ver docs/architecture/KNOWN_VIOLATIONS.md.',
    );
}

// `file://${process.argv[1]}` quebra no Windows: `import.meta.url` normaliza pra
// `file:///C:/...` (barra invertida virada, host vazio triplo-slash), enquanto `process.argv[1]`
// continua com o separador nativo (`C:\...`) — a comparação nunca batia, e o script saía
// silenciosamente (exit 0, main() nunca chamado) sem regenerar nada nem avisar. pathToFileURL
// normaliza os dois lados da mesma forma em qualquer plataforma.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
