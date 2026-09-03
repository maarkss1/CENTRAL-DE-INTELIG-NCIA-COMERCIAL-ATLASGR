#!/usr/bin/env node
/**
 * Budget de tamanho para public/ (ITEM-05, remediacao de divida tecnica).
 *
 * Tudo em public/ e copiado verbatim para dist/ pelo `vite build` e servido sem autenticacao por
 * `express.static(dist)` em producao (server.ts). Ate 2026-08-25, um seed empresarial sanitizado
 * (~56MB em 16 partes .ndjson.gz, nenhuma isoladamente grande) vivia em
 * public/tools/atlas-market-intelligence/data/company-seed-ribeirao/ mesmo sem nunca ser buscado
 * pelo navegador — so o backend le esse dataset direto do disco no deploy. Foi movido para
 * data/market-intelligence/ (ver data/market-intelligence/README.md). Este script existe para
 * pegar cedo uma futura reincidencia: tanto um total anormal (o caso real, varios arquivos medios)
 * quanto um arquivo individual grande demais.
 *
 * Uso: node scripts/ci/check-public-budget.mjs
 * Sobrescrever os limites (bytes) via env quando uma expansao legitima de dataset for aprovada:
 *   PUBLIC_BUDGET_MAX_TOTAL_BYTES, PUBLIC_BUDGET_MAX_FILE_BYTES
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PUBLIC_DIR = path.join(ROOT, 'public');

// Baseline em 2026-08-25 (pos-remocao do seed empresarial): public/ ~21.6MB, maior arquivo
// (municipios_scored.json) ~11.6MB. Os limites abaixo dao margem para crescimento organico dos
// datasets municipais legitimos do Market Intelligence sem permitir a reintroducao silenciosa de
// um dataset bruto/pesado.
//
// Elevado de 40MB para 60MB em 2026-09-03: public/ cresceu organicamente para ~48.68MB com mais
// datasets legitimos do Market Intelligence (referenciados diretamente por
// public/tools/atlas-market-intelligence/index.html e dashboard_oportunidade_gr.html — consumo real
// pelo navegador, nao um dataset backend-only como o seed empresarial removido em ITEM-05). Headroom
// dado acima do uso atual para crescimento organico continuar sem reabrir este gate a cada dataset
// novo; nao e uma licenca para reintroduzir um dataset bruto/pesado sem essa mesma justificativa.
const MAX_TOTAL_BYTES = Number(process.env.PUBLIC_BUDGET_MAX_TOTAL_BYTES ?? 60 * 1024 * 1024);
const MAX_FILE_BYTES = Number(process.env.PUBLIC_BUDGET_MAX_FILE_BYTES ?? 16 * 1024 * 1024);

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function main() {
  let files;
  try {
    files = walk(PUBLIC_DIR);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(JSON.stringify({ status: 'skipped', reason: 'public/ nao existe' }));
      return;
    }
    throw error;
  }

  const sized = files.map((file) => ({ file, size: statSync(file).size }));
  const totalBytes = sized.reduce((sum, entry) => sum + entry.size, 0);
  const oversizedFiles = sized
    .filter((entry) => entry.size > MAX_FILE_BYTES)
    .sort((a, b) => b.size - a.size);

  const violations = [];
  if (totalBytes > MAX_TOTAL_BYTES) {
    violations.push(
      `public/ total = ${formatBytes(totalBytes)}, acima do budget de ${formatBytes(MAX_TOTAL_BYTES)}. ` +
      'Se o crescimento e legitimo (novo dataset municipal necessario ao frontend), suba ' +
      'PUBLIC_BUDGET_MAX_TOTAL_BYTES nesta checagem com justificativa no PR. Se nao, o arquivo ' +
      'provavelmente pertence a data/ (consumo so pelo backend) ou a object storage, nao a public/.',
    );
  }
  for (const entry of oversizedFiles) {
    violations.push(
      `${path.relative(ROOT, entry.file)} = ${formatBytes(entry.size)}, acima do limite por arquivo ` +
      `de ${formatBytes(MAX_FILE_BYTES)}.`,
    );
  }

  const summary = {
    status: violations.length ? 'fail' : 'ok',
    totalBytes,
    totalFormatted: formatBytes(totalBytes),
    fileCount: sized.length,
    maxTotalBytes: MAX_TOTAL_BYTES,
    maxFileBytes: MAX_FILE_BYTES,
    largestFiles: sized
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map((entry) => ({ path: path.relative(ROOT, entry.file), size: entry.size, formatted: formatBytes(entry.size) })),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (violations.length) {
    console.error('\n[check-public-budget] Budget de public/ excedido:');
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exitCode = 1;
  }
}

main();
