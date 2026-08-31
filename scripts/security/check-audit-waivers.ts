// scripts/security/check-audit-waivers.ts
//
// Gate real de `npm audit`, substituindo o `continue-on-error: true` solto que existia em
// ci.yml/cd-homolog.yml/production.yaml (SEC-005, Sprint 01/Onda 13). Até esta correção, o waiver
// documentado em docs/security/AUDIT_WAIVERS.md era só texto lido por humanos — nenhum script
// cruzava o achado real do `npm audit` com o que estava formalmente aprovado, e o
// `continue-on-error: true` suprimia falha do step inteiro, não só do(s) advisory(s) waivado(s).
//
// Este script:
//   1. roda `npm audit --audit-level=high --json`;
//   2. extrai os advisory IDs (GHSA-...) de todo achado HIGH/CRITICAL;
//   3. lê docs/security/AUDIT_WAIVERS.md e extrai os advisory IDs listados sob "## Waivers ativos"
//      (nunca sob "Débito conhecido" nem "Histórico" — essas seções não autorizam nada);
//   4. falha (exit 1) se existir advisory HIGH/CRITICAL não coberto por um waiver ativo, ou se o
//      arquivo de waivers não puder ser lido/parseado;
//   5. passa (exit 0) só quando todo achado HIGH/CRITICAL está coberto.
//
// Não valida automaticamente a "data de reavaliação" (texto livre em prosa, não um campo
// estruturado) — CHECK-EXPIRACAO abaixo emite um aviso não-bloqueante quando a reavaliação parece
// vencida, para revisão humana, mas não derruba o gate por isso: reavaliação vencida é motivo para
// abrir handoff/reunião, não para travar o pipeline sem aviso prévio.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const WAIVERS_PATH = path.resolve(process.cwd(), 'docs/security/AUDIT_WAIVERS.md');
const GHSA_PATTERN = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/gi;

type AuditVulnerability = {
    severity: string;
    via: Array<string | { url?: string; source?: unknown }>;
};

type AuditReport = {
    auditReportVersion?: number;
    vulnerabilities?: Record<string, AuditVulnerability>;
    metadata?: unknown;
    error?: unknown;
};

export function parseAuditReport(stdout: string): AuditReport {
    const parsed = JSON.parse(stdout) as AuditReport;

    // Falhas do registry também são JSON e podem sair em stdout (por exemplo E403). Tratar esse
    // payload como relatório vazio faria o gate declarar "nenhum achado" sem ter auditado nada.
    if (
        !parsed ||
        typeof parsed !== 'object' ||
        parsed.error != null ||
        parsed.auditReportVersion !== 2 ||
        parsed.vulnerabilities == null ||
        typeof parsed.vulnerabilities !== 'object' ||
        parsed.metadata == null ||
        typeof parsed.metadata !== 'object'
    ) {
        throw new Error('`npm audit` did not return a valid audit report; refusing to pass open.');
    }

    return parsed;
}

// No Windows, `npm` é um script `.cmd`, não um executável nativo — `execFileSync('npm', [...])`
// sem shell falha com ENOENT (CreateProcess não sabe interpretar `.cmd` sozinho), e resolver só o
// nome (`npm.cmd`) ainda falha com EINVAL pelo mesmo motivo: um `.cmd` só roda através de um
// shell. `execSync` com a linha de comando já montada como string roda através do shell do SO em
// qualquer plataforma (cmd.exe no Windows, sh nos demais) sem o aviso de depreciação do Node que
// `execFileSync(file, args, { shell: true })` emite (DEP0190, sobre argumentos de array não
// escapados) — aqui não há argumento vindo de input externo, a string é 100% literal fixa, então
// não há superfície de injeção de shell para escapar. Achado real (Onda 43): sem isto, o gate
// nunca roda num checkout Windows — não é falta de Docker/DB, é o próprio spawn que nunca sai do
// chão.
const AUDIT_COMMAND = 'npm audit --audit-level=high --json';

function runAudit(): AuditReport {
    try {
        const stdout = execSync(AUDIT_COMMAND, {
            encoding: 'utf-8',
            // `npm audit` sai com código != 0 quando encontra achado — isso é esperado e não é
            // falha de execução do comando em si, então não deixamos o child_process lançar.
            maxBuffer: 20 * 1024 * 1024,
        });
        return parseAuditReport(stdout);
    } catch (err) {
        // execSync lança quando o processo sai com código != 0 (o caso comum aqui: achou
        // vulnerabilidade). O JSON completo ainda vem em err.stdout.
        const stdout = (err as { stdout?: string }).stdout;
        if (typeof stdout === 'string' && stdout.trim().length > 0) {
            try {
                return parseAuditReport(stdout);
            } catch (parseErr) {
                console.error('❌ `npm audit` não produziu um relatório de auditoria válido.');
                console.error(stdout.slice(0, 2000));
                throw parseErr;
            }
        }
        throw err;
    }
}

// `npm audit --json` representa dependência indireta como uma cadeia: vulnerabilities['prisma'].via
// = ["@prisma/config"] (nome de outro pacote, não um advisory), e só o nó-folha da cadeia
// (vulnerabilities['deepmerge-ts'] aqui) tem `via` no formato objeto com a URL do advisory real.
// Por isso a extração precisa atravessar o grafo até a folha em vez de olhar só o `via` direto.
function extractAdvisoryIds(
    vuln: AuditVulnerability,
    allVulnerabilities: Record<string, AuditVulnerability>,
    visited = new Set<string>()
): string[] {
    const ids = new Set<string>();
    for (const entry of vuln.via) {
        if (typeof entry === 'string') {
            // nome de outro pacote na cadeia — segue a cadeia até a folha, evitando ciclo
            if (visited.has(entry)) continue;
            const nested = allVulnerabilities[entry];
            if (nested) {
                visited.add(entry);
                extractAdvisoryIds(nested, allVulnerabilities, visited).forEach((id) => ids.add(id));
            }
            continue;
        }
        const url = entry.url;
        if (typeof url === 'string') {
            const match = url.match(GHSA_PATTERN);
            if (match) match.forEach((id) => ids.add(id.toUpperCase()));
        }
    }
    return [...ids];
}

function readWaivedAdvisories(): { waived: Set<string>; sectionFound: boolean; raw: string } {
    let raw: string;
    try {
        // Normaliza CRLF -> LF: docs/security/AUDIT_WAIVERS.md está commitado com quebra de linha
        // do Windows, e o \n literal do regex abaixo nunca casa contra \r\n — mesma classe de bug
        // (achado real, Onda 43) já encontrada e corrigida em check-hotspots.ts/parseExceptions.
        // Sem isto, o gate declara "seção não encontrada" mesmo com o waiver corretamente
        // registrado, e bloqueia um achado que já foi formalmente aceito.
        raw = readFileSync(WAIVERS_PATH, 'utf-8').replace(/\r\n/g, '\n');
    } catch {
        return { waived: new Set(), sectionFound: false, raw: '' };
    }

    // Só a seção "## Waivers ativos" autoriza algo — corta o arquivo nela e para antes do próximo
    // "## " (ex.: "## Débito conhecido...", "## Histórico"), para nunca waivar um advisory citado
    // só como contexto histórico ou como débito não-crítico.
    const activeSectionMatch = raw.match(/## Waivers ativos\n([\s\S]*?)(?=\n## |$)/);
    if (!activeSectionMatch) {
        return { waived: new Set(), sectionFound: false, raw };
    }
    const activeSection = activeSectionMatch[1];
    const ids = activeSection.match(GHSA_PATTERN) ?? [];
    return { waived: new Set(ids.map((id) => id.toUpperCase())), sectionFound: true, raw: activeSection };
}

function warnIfReavaliacaoVencida(waiverSectionRaw: string): void {
    // "Reavaliar em: <data ISO> ou <condição>" — texto livre por design (ver AUDIT_WAIVERS.md,
    // regra 2). Só tentamos extrair uma data ISO explícita; qualquer outra formulação
    // ("próxima major do Prisma", "30 dias") fica para revisão humana, não é bloqueante aqui.
    const isoDateMatch = waiverSectionRaw.match(/Reavaliar em:\**\s*(\d{4}-\d{2}-\d{2})/i);
    if (!isoDateMatch) return;
    const reavaliarEm = new Date(isoDateMatch[1]);
    if (Number.isNaN(reavaliarEm.getTime())) return;
    if (reavaliarEm.getTime() < Date.now()) {
        console.warn(
            `⚠️  Waiver com data de reavaliação vencida (${isoDateMatch[1]}) — revisar ` +
            `docs/security/AUDIT_WAIVERS.md manualmente. Isso não bloqueia o gate sozinho.`
        );
    }
}

function main(): void {
    const report = runAudit();
    const vulnerabilities = report.vulnerabilities ?? {};

    const highOrCritical = Object.entries(vulnerabilities).filter(
        ([, v]) => v.severity === 'high' || v.severity === 'critical'
    );

    if (highOrCritical.length === 0) {
        console.log('✅ npm audit --audit-level=high: nenhum achado HIGH/CRITICAL. Gate OK.');
        return;
    }

    const { waived, sectionFound, raw } = readWaivedAdvisories();
    warnIfReavaliacaoVencida(raw);

    if (!sectionFound) {
        console.error(
            `❌ ${highOrCritical.length} achado(s) HIGH/CRITICAL, mas ` +
            `docs/security/AUDIT_WAIVERS.md não existe ou não tem uma seção "## Waivers ativos" ` +
            `legível. Nenhum waiver pode ser aplicado — gate bloqueado.`
        );
        process.exit(1);
    }

    const uncovered: Array<{ pkg: string; severity: string; advisories: string[] }> = [];

    for (const [pkg, vuln] of highOrCritical) {
        const advisoryIds = extractAdvisoryIds(vuln, vulnerabilities);
        const isCovered = advisoryIds.length > 0 && advisoryIds.every((id) => waived.has(id));
        if (!isCovered) {
            uncovered.push({ pkg, severity: vuln.severity, advisories: advisoryIds });
        }
    }

    if (uncovered.length > 0) {
        console.error(`❌ ${uncovered.length} achado(s) HIGH/CRITICAL sem waiver ativo cobrindo o advisory exato:`);
        for (const item of uncovered) {
            console.error(
                `   - ${item.pkg} (${item.severity}): ${item.advisories.join(', ') || 'advisory não identificado na saída do npm audit'}`
            );
        }
        console.error(
            'Registre um waiver em docs/security/AUDIT_WAIVERS.md (seção "## Waivers ativos", ' +
            'com dono/motivo/data de reavaliação) antes de reintroduzir exceção, ou corrija a dependência.'
        );
        process.exit(1);
    }

    console.log(
        `✅ ${highOrCritical.length} achado(s) HIGH/CRITICAL, todos cobertos por waiver ativo em ` +
        `docs/security/AUDIT_WAIVERS.md. Gate OK.`
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
