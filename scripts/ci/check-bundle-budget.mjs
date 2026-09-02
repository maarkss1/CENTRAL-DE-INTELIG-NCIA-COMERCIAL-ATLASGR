#!/usr/bin/env node
/**
 * Budget de tamanho para o bundle de frontend gerado por `vite build` (ITEM-15, remediacao de
 * divida tecnica — "Budgets de performance, bundle e tamanho").
 *
 * Complementar ao ITEM-05 (`scripts/ci/check-public-budget.mjs`): aquele script cobre o que fica
 * em `public/` e vai para `dist/` sem passar pelo bundler (datasets, assets estaticos). Este cobre
 * o oposto — o JS/CSS que o Vite realmente processa, faz code-split e o navegador baixa para
 * carregar a aplicacao React. Sao dois eixos diferentes do mesmo `dist/`, sem sobreposicao de
 * escopo.
 *
 * O que este script mede em `dist/assets/*.{js,css}`:
 *   1. Tamanho total (gzip) do bundle — pega crescimento agregado silencioso (muitas dependencias
 *      pequenas somando peso ao longo do tempo).
 *   2. Tamanho (gzip) de cada chunk individual contra um teto generico — pega um chunk novo
 *      grande demais (ex.: uma lib pesada importada sem code-splitting).
 *   3. Excecoes documentadas: alguns chunks legitimamente pesados ja existem hoje, isolados via
 *      `React.lazy` + carregamento condicional (ver App.tsx) para nunca entrarem no caminho
 *      critico de carregamento inicial. Eles tem teto proprio, mais alto, em vez de estourar o
 *      teto generico a cada build.
 *
 * Uso:
 *   npm run build && node scripts/ci/check-bundle-budget.mjs
 *
 * Sobrescrever limites (bytes gzip) via env quando um crescimento legitimo for aprovado:
 *   BUNDLE_BUDGET_MAX_TOTAL_GZIP_BYTES, BUNDLE_BUDGET_MAX_FILE_GZIP_BYTES
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DIST_ASSETS_DIR = path.join(ROOT, 'dist', 'assets');
export const DIST_INDEX_HTML = path.join(ROOT, 'dist', 'index.html');

// Baseline medido em 2026-08-25 (build limpo, `origin/main`): 74 arquivos em dist/assets/, total
// ~4.53MB brutos / ~1.21MB gzip. O maior chunk generico "de rota" (nao listado como excecao
// abaixo) e o CartesianChart (recharts), ~100KB gzip — os demais chunks de feature ficam bem
// abaixo disso. Os numeros abaixo dao margem para crescimento organico sem permitir que um chunk
// novo e pesado passe despercebido.
export const MAX_TOTAL_GZIP_BYTES = Number(
  process.env.BUNDLE_BUDGET_MAX_TOTAL_GZIP_BYTES ?? 1.7 * 1024 * 1024,
);
export const MAX_FILE_GZIP_BYTES = Number(
  process.env.BUNDLE_BUDGET_MAX_FILE_GZIP_BYTES ?? 160 * 1024,
);

/**
 * Chunks que hoje excedem MAX_FILE_GZIP_BYTES por motivo legitimo e ja documentado — cada um tem
 * teto proprio em vez de estourar o teto generico a cada build. Um chunk so entra aqui com
 * justificativa por escrito; nao e uma valvula de escape silenciosa.
 */
export const DOCUMENTED_LARGE_CHUNKS = [
  {
    // exceljs so e usado por fluxos de exportacao de planilha (Billing/relatorios) — nunca
    // carregado no caminho critico inicial. Biblioteca de terceiros, sem alternativa mais leve
    // ja adotada no projeto para gerar .xlsx real.
    pattern: /^exceljs\.min-/,
    maxGzipBytes: 290 * 1024,
    reason: 'exceljs (geracao de planilha) — lazy, so no fluxo de exportacao, nao no load inicial.',
  },
  {
    // OnboardingTour importa AtlasOrb (@react-three/fiber/three) para o widget 3D decorativo do
    // tour de boas-vindas. App.tsx ja isola isso com React.lazy() E um gate condicional
    // (showOnboardingTour) para que o import so rode quando o tour realmente aparece — ver
    // comentario em src/App.tsx. O peso e real (three.js), mas o carregamento ja e comprovadamente
    // condicional, entao o risco de regressao de performance percebida e baixo.
    pattern: /^OnboardingTour-/,
    maxGzipBytes: 260 * 1024,
    reason: 'OnboardingTour (three.js via AtlasOrb) — lazy + gate condicional, fora do load inicial.',
  },
  {
    // LoginScreen tambem usa o AtlasOrb (esfera 3D decorativa na cor da marca ativa). Agora que
    // dois pontos de entrada (OnboardingTour e LoginScreen) importam o mesmo componente via
    // React.lazy(), o Rollup deduplica o three.js compartilhado num chunk proprio
    // ("AtlasOrb-*.js", ~236KB gzip) em vez de duplica-lo em cada um — bom para cache, mas cai
    // fora do padrao "^OnboardingTour-" acima. LoginScreen.tsx adia o import ate o navegador
    // ficar ocioso (requestIdleCallback/setTimeout) para nao competir com o formulario no load
    // critico da pagina de login; o proprio elemento e pointer-events-none e escondido em telas
    // pequenas.
    pattern: /^AtlasOrb-/,
    maxGzipBytes: 260 * 1024,
    reason: 'AtlasOrb (three.js) compartilhado entre OnboardingTour e LoginScreen — ambos lazy e adiados.',
  },
  {
    // Float (@react-three/drei, usado por SignalScene em RevenueSignalOrb.tsx no dashboard) e
    // AtlasOrb.tsx (Login/OnboardingTour) agora compartilham o mesmo import do drei/three — o
    // Rollup deduplica o chunk e o nomeia "Float-*" em vez de "AtlasOrb-*" quando ha mais de dois
    // pontos de entrada para o mesmo modulo compartilhado. RevenueSignalOrb so carrega via
    // DeferredRevenueSignalOrb.tsx (React.lazy + IntersectionObserver, so quando entra na
    // viewport do dashboard) — mesmo padrao lazy+condicional documentado para AtlasOrb acima, so
    // que com um terceiro ponto de entrada mudando o nome do chunk compartilhado.
    pattern: /^Float-/,
    maxGzipBytes: 260 * 1024,
    reason:
      'Float (three.js via drei, compartilhado entre AtlasOrb e RevenueSignalOrb) — ambos lazy e condicionais/adiados.',
  },
  {
    // recharts (CartesianChart) e usado por varias telas de analytics/relatorios, sempre via
    // import dinamico de cada feature — nunca no chunk de entrada.
    pattern: /^CartesianChart-/,
    maxGzipBytes: 110 * 1024,
    reason: 'recharts (graficos) — chunk compartilhado, carregado sob demanda pelas telas de analytics.',
  },
  {
    // echarts (src/components/charts) e importado direto por Analytics.tsx, mas Analytics.tsx em
    // si so entra via React.lazy() na rota /analytics (App.tsx) — nao esta no chunk de entrada nem
    // em nenhuma outra tela carregada por padrao.
    pattern: /^vendor-echarts-/,
    maxGzipBytes: 230 * 1024,
    reason: 'echarts (graficos) — chunk de vendor, so carregado ao entrar na rota /analytics (lazy).',
  },
];

function gzipSize(buf) {
  return zlib.gzipSync(buf, { level: 9 }).length;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function matchDocumentedException(fileName) {
  return DOCUMENTED_LARGE_CHUNKS.find((entry) => entry.pattern.test(fileName));
}

export function collectAssetSizes(dir = DIST_ASSETS_DIR) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.css')))
    .map((entry) => {
      const fullPath = path.join(dir, entry.name);
      const buf = readFileSync(fullPath);
      return {
        name: entry.name,
        rawBytes: buf.length,
        gzipBytes: gzipSize(buf),
      };
    });
}

/**
 * Logica pura de avaliacao do budget — separada de I/O para ser testavel (tests/unit).
 */
export function evaluateBudget(
  assets,
  { maxTotalGzipBytes = MAX_TOTAL_GZIP_BYTES, maxFileGzipBytes = MAX_FILE_GZIP_BYTES, documentedLargeChunks = DOCUMENTED_LARGE_CHUNKS } = {},
) {
  const totalRawBytes = assets.reduce((sum, a) => sum + a.rawBytes, 0);
  const totalGzipBytes = assets.reduce((sum, a) => sum + a.gzipBytes, 0);

  const violations = [];

  if (totalGzipBytes > maxTotalGzipBytes) {
    violations.push({
      type: 'total-budget',
      message:
        `bundle total (gzip) = ${formatBytes(totalGzipBytes)}, acima do budget de ` +
        `${formatBytes(maxTotalGzipBytes)}. Se o crescimento e legitimo, suba ` +
        'BUNDLE_BUDGET_MAX_TOTAL_GZIP_BYTES com justificativa explicita no PR.',
    });
  }

  for (const asset of assets) {
    const exception = documentedLargeChunks.find((entry) => entry.pattern.test(asset.name));
    const limit = exception ? exception.maxGzipBytes : maxFileGzipBytes;
    if (asset.gzipBytes > limit) {
      violations.push({
        type: exception ? 'documented-chunk-budget' : 'file-budget',
        file: asset.name,
        message: exception
          ? `${asset.name} = ${formatBytes(asset.gzipBytes)} (gzip), acima do teto documentado de ` +
            `${formatBytes(limit)} para esta excecao (${exception.reason}).`
          : `${asset.name} = ${formatBytes(asset.gzipBytes)} (gzip), acima do teto generico de ` +
            `${formatBytes(limit)} por arquivo. Se este chunk e legitimamente pesado e ja esta ` +
            'isolado via React.lazy/carregamento condicional, documente a excecao em ' +
            'DOCUMENTED_LARGE_CHUNKS (scripts/ci/check-bundle-budget.mjs) com justificativa; caso ' +
            'contrario, revise o code-splitting antes de aumentar o budget.',
      });
    }
  }

  return {
    status: violations.length ? 'fail' : 'ok',
    totalRawBytes,
    totalGzipBytes,
    fileCount: assets.length,
    maxTotalGzipBytes,
    maxFileGzipBytes,
    violations,
  };
}

function buildTrendRecord(result, assets) {
  return {
    measuredAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? null,
    ref: process.env.GITHUB_REF_NAME ?? null,
    status: result.status,
    totalRawBytes: result.totalRawBytes,
    totalGzipBytes: result.totalGzipBytes,
    fileCount: result.fileCount,
    largestFiles: [...assets]
      .sort((a, b) => b.gzipBytes - a.gzipBytes)
      .slice(0, 10)
      .map((a) => ({ file: a.name, rawBytes: a.rawBytes, gzipBytes: a.gzipBytes })),
  };
}

function main() {
  const assets = collectAssetSizes();
  if (assets === null) {
    console.log(
      JSON.stringify({ status: 'skipped', reason: 'dist/assets nao existe — rode `npm run build` antes.' }),
    );
    process.exitCode = 1;
    return;
  }

  const result = evaluateBudget(assets);
  const trend = buildTrendRecord(result, assets);

  console.log(JSON.stringify({ ...result, trend }, null, 2));

  if (result.violations.length) {
    console.error('\n[check-bundle-budget] Budget de bundle excedido:');
    for (const violation of result.violations) console.error(`  - ${violation.message}`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
