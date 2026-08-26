// scripts/security/dependency-inventory.ts
//
// ITEM-11 (SBOM e governança de dependências, Onda 3). Inventaria toda dependência resolvida em
// package-lock.json (diretas e transitivas) e sinaliza duas categorias de risco que o SBOM sozinho
// não deixa óbvias:
//
//   1. Versões pré-release (RC/beta/alpha/next/canary) — detectadas offline, direto do
//      package-lock.json, comparando o campo "version" de cada pacote resolvido contra
//      PRERELEASE_PATTERN. Cobre diretas e transitivas sem chamada de rede: o lockfile já tem a
//      versão exata resolvida de toda a árvore.
//   2. Pacotes deprecated — não há como obter isso do lockfile sozinho (é metadado do registry,
//      não do resolvedor). Em vez de fazer uma chamada `npm view` por pacote (centenas de pacotes,
//      lento e sujeito a rate limit em CI), este script reaproveita o aviso que o próprio
//      `npm ci`/`npm install` já imprime em stderr para todo pacote deprecated que toca durante a
//      resolução — direto ou transitivo (confirmado empiricamente: `fstream`, `glob`, `inflight`
//      são transitivos de devDependencies de teste, não diretos, e ainda assim aparecem). Passe o
//      log dessa instalação via --npm-log (ou $NPM_INSTALL_LOG); sem ele, a seção de deprecated
//      fica vazia e o relatório avisa isso explicitamente em vez de fingir que não há nenhum.
//
// Uso:
//   tsx scripts/security/dependency-inventory.ts [--npm-log <arquivo>] [--out <arquivo.md>]
//
// Saída padrão: docs/security/DEPENDENCY_INVENTORY.md (Markdown legível por humano — este item
// não exige automação de gate bloqueante para RC/beta/deprecated, só visibilidade; o gate
// bloqueante de vulnerabilidade real já existe em scripts/security/check-audit-waivers.ts).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PRERELEASE_PATTERN = /-((?:rc|beta|alpha|next|canary|dev|pre)(?:[.-]?\d+)?)(?:$|\+)/i;

// `npm warn deprecated <pacote>@<versão>: <mensagem>` — formato estável do npm >= 7.
const DEPRECATED_LOG_PATTERN = /npm warn deprecated ([^@\s][^@]*)@(\S+):\s*(.+)/;

export type LockPackageEntry = {
  version?: string;
  dev?: boolean;
  optional?: boolean;
  peer?: boolean;
};

export type PackageLock = {
  packages?: Record<string, LockPackageEntry>;
};

export type InventoryRow = {
  name: string;
  version: string;
  direct: boolean;
  prerelease: string | null;
};

export type DeprecatedRow = {
  name: string;
  version: string;
  message: string;
};

/** node_modules/@scope/pkg ou node_modules/pkg -> @scope/pkg | pkg. Ignora sub-dependências
 * aninhadas dentro de outro node_modules (ex.: node_modules/a/node_modules/b vira "b" também,
 * deduplicando pela versão mais externa já vista — lockfile v3 já usa nomes "achatados" na
 * maioria dos casos, mas aninhamento ainda ocorre em conflito de versão). */
function packageNameFromLockKey(key: string): string | null {
  const idx = key.lastIndexOf('node_modules/');
  if (idx === -1) return null;
  return key.slice(idx + 'node_modules/'.length);
}

export function buildInventory(lock: PackageLock, directDepNames: Set<string>): InventoryRow[] {
  const rows = new Map<string, InventoryRow>();
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (key === '') continue; // raiz do próprio projeto
    const name = packageNameFromLockKey(key);
    if (!name || !entry.version) continue;
    const match = entry.version.match(PRERELEASE_PATTERN);
    const existing = rows.get(name);
    // O mesmo nome de pacote pode aparecer resolvido em mais de uma versão/local quando a árvore
    // tem conflito (ex.: aninhado dentro de outro node_modules por causa de um range diferente).
    // Prioriza sempre reportar uma versão pré-release quando qualquer uma das instâncias for
    // pré-release — o objetivo aqui é não esconder risco atrás de uma instância estável do mesmo
    // pacote, não ser o resolvedor de árvore de verdade (isso já é papel do npm).
    if (existing && (existing.prerelease !== null || match === null)) continue;
    rows.set(name, {
      name,
      version: entry.version,
      direct: directDepNames.has(name),
      prerelease: match ? match[1] : null,
    });
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function parseDeprecatedFromLog(log: string): DeprecatedRow[] {
  const rows = new Map<string, DeprecatedRow>();
  for (const line of log.split('\n')) {
    const match = line.match(DEPRECATED_LOG_PATTERN);
    if (!match) continue;
    const [, name, version, message] = match;
    rows.set(`${name}@${version}`, { name, version, message: message.trim() });
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function readDirectDependencyNames(pkg: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): Set<string> {
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
}

/**
 * Escapa uma célula de tabela Markdown com segurança: a barra invertida precisa ser escapada
 * *antes* do pipe, senão uma mensagem que já contém `\` na entrada (ex.: caminho Windows num aviso
 * do npm) produziria uma sequência de escape ambígua/incorreta no Markdown renderizado.
 */
export function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function renderMarkdown(
  prereleaseRows: InventoryRow[],
  deprecatedRows: DeprecatedRow[],
  hadLog: boolean,
  totalResolved: number
): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push('# Inventário de dependências — RC/beta e deprecated');
  lines.push('');
  lines.push(
    `Gerado automaticamente por \`npm run security:dependency-inventory\` ` +
      `(\`scripts/security/dependency-inventory.ts\`). **Não edite manualmente** — rode o script ` +
      `de novo para atualizar. Última geração: ${today}.`
  );
  lines.push('');
  lines.push(
    'Este arquivo cobre visibilidade (o que existe e por quê). Para vulnerabilidade conhecida ' +
      '(CVE/GHSA) e o waiver formal correspondente, a fonte de verdade continua sendo ' +
      '`docs/security/AUDIT_WAIVERS.md` — não duplique um waiver de vulnerabilidade aqui.'
  );
  lines.push('');
  lines.push(`Total de pacotes resolvidos em \`package-lock.json\`: **${totalResolved}**.`);
  lines.push('');
  lines.push('## Dependências em versão pré-release (RC/beta/alpha/next/canary)');
  lines.push('');
  if (prereleaseRows.length === 0) {
    lines.push('Nenhuma encontrada nesta execução.');
  } else {
    lines.push('| Pacote | Versão resolvida | Direta/Transitiva | Tag |');
    lines.push('|---|---|---|---|');
    for (const row of prereleaseRows) {
      lines.push(
        `| \`${row.name}\` | \`${row.version}\` | ${row.direct ? 'Direta' : 'Transitiva'} | ${row.prerelease} |`
      );
    }
  }
  lines.push('');
  lines.push('## Pacotes deprecated encontrados no último `npm ci`/`npm install` analisado');
  lines.push('');
  if (!hadLog) {
    lines.push(
      '_Nenhum log de instalação foi informado a este script (`--npm-log`/`$NPM_INSTALL_LOG`) — ' +
        'esta seção não foi avaliada nesta execução, não é evidência de "zero pacotes deprecated".' +
        ' Rode com o log de um `npm ci` recente para preencher._'
    );
  } else if (deprecatedRows.length === 0) {
    lines.push('Nenhum aviso `npm warn deprecated` encontrado no log informado.');
  } else {
    lines.push('| Pacote | Versão | Aviso do npm |');
    lines.push('|---|---|---|');
    for (const row of deprecatedRows) {
      lines.push(`| \`${row.name}\` | \`${row.version}\` | ${escapeMarkdownTableCell(row.message)} |`);
    }
  }
  lines.push('');
  lines.push(
    'Ver `docs/security/DEPENDENCY_POLICY.md` para a política de atualização/estabilização e a ' +
      'justificativa de cada dependência RC/beta **direta** aceita.'
  );
  lines.push('');
  return lines.join('\n');
}

function parseArgs(argv: string[]): { npmLogPath: string | null; outPath: string } {
  let npmLogPath: string | null = process.env.NPM_INSTALL_LOG ?? null;
  let outPath = 'docs/security/DEPENDENCY_INVENTORY.md';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--npm-log' && argv[i + 1]) {
      npmLogPath = argv[i + 1];
      i++;
    } else if (argv[i] === '--out' && argv[i + 1]) {
      outPath = argv[i + 1];
      i++;
    }
  }
  return { npmLogPath, outPath };
}

function main(): void {
  const { npmLogPath, outPath } = parseArgs(process.argv.slice(2));

  const lock = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package-lock.json'), 'utf-8')) as PackageLock;
  const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const directNames = readDirectDependencyNames(pkg);

  const inventory = buildInventory(lock, directNames);
  const prereleaseRows = inventory.filter((r) => r.prerelease !== null);

  let deprecatedRows: DeprecatedRow[] = [];
  let hadLog = false;
  if (npmLogPath && existsSync(npmLogPath)) {
    const log = readFileSync(npmLogPath, 'utf-8');
    deprecatedRows = parseDeprecatedFromLog(log);
    hadLog = true;
  } else if (npmLogPath) {
    console.warn(`⚠️  --npm-log apontou para "${npmLogPath}", mas o arquivo não existe. Ignorando.`);
  }

  const markdown = renderMarkdown(prereleaseRows, deprecatedRows, hadLog, inventory.length);
  writeFileSync(path.resolve(process.cwd(), outPath), markdown, 'utf-8');

  console.log(
    `✅ Inventário gerado em ${outPath}: ${prereleaseRows.length} pacote(s) pré-release, ` +
      `${deprecatedRows.length} pacote(s) deprecated (log ${hadLog ? 'informado' : 'ausente'}).`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
