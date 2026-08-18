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

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const WAIVERS_PATH = path.resolve(process.cwd(), 'docs/security/AUDIT_WAIVERS.md');
const GHSA_PATTERN = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/gi;

type AuditVulnerability = {
    severity: string;
    via: Array<string | { url?: string; source?: unknown }>;
};

type AuditReport = {
    vulnerabilities?: Record<string, AuditVulnerability>;
};

function runAudit(): AuditReport {
    try {
        const stdout = execFileSync('npm', ['audit', '--audit-level=high', '--json'], {
            encoding: 'utf-8',
            // `npm audit` sai com código != 0 quando encontra achado — isso é esperado e não é
            // falha de execução do comando em si, então não deixamos o child_process lançar.
            maxBuffer: 20 * 1024 * 1024,
        });
        return JSON.parse(stdout) as AuditReport;
    } catch (err) {
        // execFileSync lança quando o processo sai com código != 0 (o caso comum aqui: achou
        // vulnerabilidade). O JSON completo ainda vem em err.stdout.
        const stdout = (err as { stdout?: string }).stdout;
        if (typeof stdout === 'string' && stdout.trim().length > 0) {
            try {
                return JSON.parse(stdout) as AuditReport;
            } catch (parseErr) {
                console.error('❌ Não foi possível parsear a saída JSON de `npm audit`.');
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
        raw = readFileSync(WAIVERS_PATH, 'utf-8');
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

main();
