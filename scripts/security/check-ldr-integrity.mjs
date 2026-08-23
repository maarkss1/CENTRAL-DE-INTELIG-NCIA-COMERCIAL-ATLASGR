import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SYNTHETIC_MARKERS = /\b(mock|fake|fabricad[oa]?|fict[ií]ci[oa]?|dummy|placeholder|randomNews)\b|Math\.random/i;
const FACT_PATTERN = /evidenceType\s*:\s*['"]FACT['"]/i;
const HARDCODED_RESPONSIBLE_PATTERN = /RESPONSIBLE_ID\s*:\s*['"]?\d+['"]?/i;
const DIRECT_EXECUTED_PATTERN = /status\s*:\s*['"]executed['"]/i;
const ACCOUNT_SCORE_WRITE_PATTERN = /accountScore\.(create|upsert|update)\s*\(/gi;
const HARDCODED_SCORE_DIMENSION_PATTERN = /\b(total|fit|timing|intent|relationship)\s*:\s*\d{1,3}\b/i;

function parseRoot(argv) {
  const index = argv.indexOf('--root');
  if (index === -1) return process.cwd();
  const value = argv[index + 1];
  if (!value) throw new Error('--root exige um caminho');
  return path.resolve(value);
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath);
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) return [];
    return [fullPath];
  });
}

function isLdrRelevant(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return normalized.startsWith('src/features/market-intelligence/')
    || /account[-_.]?intelligence|\bldr\b|newsMonitor/i.test(normalized);
}

function addViolation(violations, code, relativePath, detail) {
  violations.push({ code, relativePath, detail });
}

function inspectFacts(violations, relativePath, content) {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!FACT_PATTERN.test(lines[index])) continue;
    const start = Math.max(0, index - 20);
    const end = Math.min(lines.length, index + 21);
    const context = lines.slice(start, end).join('\n');
    if (SYNTHETIC_MARKERS.test(context)) {
      addViolation(
        violations,
        'LDR_FACT_FROM_SYNTHETIC_SOURCE',
        relativePath,
        `evidenceType=FACT próximo de marcador sintético na linha ${index + 1}`,
      );
    }
  }
}

function inspectResponsibleId(violations, relativePath, content) {
  const match = content.match(HARDCODED_RESPONSIBLE_PATTERN);
  if (match) {
    addViolation(
      violations,
      'LDR_HARDCODED_BITRIX_RESPONSIBLE',
      relativePath,
      `RESPONSIBLE_ID não pode usar literal numérico (${match[0]})`,
    );
  }
}

// actionExecutor.service.ts É o executor validado citado na mensagem de violação abaixo — grava
// externalRef (evidência real do Bitrix) junto com o status, então é o único lugar do caminho LDR
// onde a transição direta pra Executed é o comportamento correto, não um bypass.
const VALIDATED_EXECUTOR_FILE = 'actionExecutor.service.ts';

function inspectExecutedStatus(violations, relativePath, content) {
  if (relativePath.endsWith(VALIDATED_EXECUTOR_FILE)) return;
  const match = content.match(DIRECT_EXECUTED_PATTERN);
  if (match) {
    addViolation(
      violations,
      'LDR_DIRECT_EXECUTED_STATUS',
      relativePath,
      'LDR não pode persistir status Executed diretamente. Use um executor validado que grave evidência/externalRef antes da transição.',
    );
  }
}

function inspectHardcodedScores(violations, relativePath, content) {
  ACCOUNT_SCORE_WRITE_PATTERN.lastIndex = 0;
  let match;
  while ((match = ACCOUNT_SCORE_WRITE_PATTERN.exec(content)) !== null) {
    const block = content.slice(match.index, match.index + 2500);
    const scoreMatch = block.match(HARDCODED_SCORE_DIMENSION_PATTERN);
    if (scoreMatch) {
      addViolation(
        violations,
        'LDR_HARDCODED_ACCOUNT_SCORE',
        relativePath,
        `dimensão de AccountScore não pode ser literal numérico em persistência (${scoreMatch[0]})`,
      );
      return;
    }
  }
}

export function scanLdrIntegrity(root) {
  const violations = [];

  const obsoleteAppender = path.join(root, 'append.cjs');
  if (fs.existsSync(obsoleteAppender)) {
    addViolation(
      violations,
      'LDR_OBSOLETE_SCHEMA_APPENDER',
      'append.cjs',
      'append.cjs é um resíduo obsoleto que pode duplicar modelos Prisma do LDR',
    );
  }

  const scanRoots = [
    path.join(root, 'src', 'features', 'market-intelligence'),
    path.join(root, 'src', 'lib', 'queue'),
  ];

  const files = scanRoots.flatMap(walkFiles);
  for (const file of files) {
    const relativePath = path.relative(root, file);
    if (!isLdrRelevant(relativePath)) continue;
    const content = fs.readFileSync(file, 'utf8');

    inspectFacts(violations, relativePath, content);
    inspectResponsibleId(violations, relativePath, content);
    inspectExecutedStatus(violations, relativePath, content);
    inspectHardcodedScores(violations, relativePath, content);
  }

  return violations;
}

function main() {
  const root = parseRoot(process.argv.slice(2));
  const violations = scanLdrIntegrity(root);

  if (violations.length === 0) {
    console.log('LDR integrity guard: OK');
    return;
  }

  console.error(`LDR integrity guard: BLOQUEADO (${violations.length} violação(ões))`);
  for (const violation of violations) {
    console.error(`- [${violation.code}] ${violation.relativePath}: ${violation.detail}`);
  }
  process.exitCode = 1;
}

const invokedAsScript = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (invokedAsScript) {
  main();
}
