#!/usr/bin/env node
/**
 * Bootstrap idempotente de um seed empresarial pequeno no PostgreSQL de producao.
 *
 * O seed versionado nunca contem telefone/fax/e-mail. A publicacao respeita a mesma semantica
 * do loader nacional pesado: dataset versionado, validacao antes da troca e slot CNPJ_ACTIVE
 * alterado dentro de uma unica transacao. Se o seed ainda nao existir no checkout, sai com 0.
 *
 * O seed vive em data/market-intelligence/company-seed-ribeirao/ (fora de public/) porque este
 * script le o arquivo direto do disco no deploy (render.yaml startCommand) — nunca via HTTP/fetch
 * do navegador. Ficar em public/ so fazia o build empacotar/servir ~56MB de registros
 * empresariais sem necessidade e sem autenticacao (ITEM-05, remediacao de divida tecnica). Ver
 * data/market-intelligence/README.md.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_SEED_DIR = join(ROOT, 'data/market-intelligence/company-seed-ribeirao');
const CNPJ_RE = /^[A-Z0-9]{12}[0-9]{2}$/;
const CONTACT_FIELDS = ['ddd1', 'telefone1', 'ddd2', 'telefone2', 'dddFax', 'fax', 'email'];

// node-postgres sempre reemite erros de conexao inesperada (socket derrubado pelo pooler do
// Supabase por idle timeout, blip de rede entre Render e sa-east-1, etc.) como um evento
// 'error' no Client, INDEPENDENTE de haver uma query em andamento. Sem listener, o EventEmitter
// padrao do Node relanca isso como excecao nao tratada e derruba o processo inteiro — foi o que
// aconteceu no deploy de 31/08 15:15 (Error: Connection terminated unexpectedly, mesmo commit
// que tinha rodado com sucesso 7min antes: falha transitoria de conexao, nao bug de logica).
// keepAlive reduz a chance do pooler/rede derrubar a conexao por ociosidade durante o streaming
// do NDJSON; o listener garante que, se ainda assim cair, o erro vira uma rejeicao de promise
// normal (tratada pelo try/catch de publishSeed) em vez de crash abrupto do processo.
function createResilientClient(connectionString) {
  const client = new Client({ connectionString, keepAlive: true, keepAliveInitialDelayMillis: 10_000 });
  client.on('error', (error) => {
    console.error(
      `[market-intelligence-seed] conexao com o banco caiu inesperadamente: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  return client;
}

function isTransientConnectionError(error) {
  const message = String(error?.message || '');
  const code = error?.code;
  return (
    message.includes('Connection terminated unexpectedly') ||
    message.includes('terminating connection') ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === '57P01' // admin_shutdown (pooler reciclando a conexao)
  );
}

function sha256File(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

function loadManifest(seedDir) {
  const path = join(seedDir, 'manifest.json');
  if (!existsSync(path)) return null;
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.dataset !== 'CNPJ_COMPANIES_SEED') throw new Error('Seed nao e CNPJ_COMPANIES_SEED');
  if (!manifest.seedHash || !manifest.competencia || !Array.isArray(manifest.parts) || !manifest.parts.length) {
    throw new Error('Manifest do seed incompleto');
  }
  if (manifest.filters?.municipioIbge !== '3543402') throw new Error('Seed nao esta restrito a Ribeirao Preto/3543402');
  return manifest;
}

async function validateFiles(seedDir, manifest) {
  let expected = 0;
  for (const part of manifest.parts) {
    const path = resolve(seedDir, String(part.path || ''));
    const sep = process.platform === 'win32' ? '\\' : '/';
    if (!path.startsWith(resolve(seedDir) + sep)) throw new Error(`Parte fora do seed: ${part.path}`);
    if (!existsSync(path)) throw new Error(`Parte ausente: ${part.path}`);
    const actualHash = await sha256File(path);
    if (actualHash !== part.sha256) throw new Error(`SHA-256 divergente: ${part.path}`);
    expected += Number(part.records || 0);
  }
  if (expected !== Number(manifest.records)) {
    throw new Error(`Manifest inconsistente: partes=${expected} manifest=${manifest.records}`);
  }
}

async function* ndjsonRows(path) {
  const input = createReadStream(path).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    yield JSON.parse(line);
  }
}

function validateRow(row) {
  const cnpj = String(row.cnpj || '').toUpperCase();
  if (!CNPJ_RE.test(cnpj)) throw new Error(`CNPJ invalido no seed: ${cnpj}`);
  if (row.municipioIbge !== '3543402' || row.uf !== 'SP') throw new Error(`Territorio invalido no seed: ${cnpj}`);
  for (const field of CONTACT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, field)) throw new Error(`Campo de contato proibido no seed: ${field}`);
  }
}

async function insertStageBatch(client, rows) {
  if (!rows.length) return;
  await client.query(
    'INSERT INTO mi_seed_stage(payload) SELECT value FROM jsonb_array_elements($1::jsonb)',
    [JSON.stringify(rows)],
  );
}

async function stageSeed(client, seedDir, manifest) {
  await client.query('CREATE TEMP TABLE mi_seed_stage (payload jsonb NOT NULL) ON COMMIT DROP');
  const seen = new Set();
  let count = 0;
  const batch = [];
  for (const part of manifest.parts) {
    const path = resolve(seedDir, part.path);
    for await (const row of ndjsonRows(path)) {
      validateRow(row);
      if (seen.has(row.cnpj)) throw new Error(`CNPJ duplicado no seed: ${row.cnpj}`);
      seen.add(row.cnpj);
      batch.push(row);
      count += 1;
      if (batch.length >= 1000) {
        await insertStageBatch(client, batch);
        batch.length = 0;
      }
    }
  }
  await insertStageBatch(client, batch);
  if (count !== Number(manifest.records)) throw new Error(`Contagem real do seed diverge: ${count} != ${manifest.records}`);
  const validation = await client.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(DISTINCT payload->>'cnpj')::bigint AS distinct_cnpj,
      COUNT(*) FILTER (WHERE (payload->>'cnpj') !~ '^[A-Z0-9]{12}[0-9]{2}$')::bigint AS invalid_cnpj,
      COUNT(*) FILTER (WHERE payload->>'municipioIbge' <> '3543402' OR payload->>'uf' <> 'SP')::bigint AS wrong_geo
    FROM mi_seed_stage
  `);
  const row = validation.rows[0];
  if (Number(row.total) !== count || Number(row.distinct_cnpj) !== count || Number(row.invalid_cnpj) || Number(row.wrong_geo)) {
    throw new Error(`Validacao SQL do seed falhou: ${JSON.stringify(row)}`);
  }
  return count;
}

const COMPANY_INSERT_SQL = `
INSERT INTO "MarketIntelligenceCompany" (
  "id", "datasetId", "cnpj", "cnpjBasico", "cnpjOrdem", "cnpjDv",
  "razaoSocial", "razaoSocialSearch", "nomeFantasia", "nomeFantasiaSearch", "matrizFilial",
  "situacaoCadastralCodigo", "situacaoCadastral", "dataSituacaoCadastral",
  "motivoSituacaoCodigo", "motivoSituacaoCadastral", "dataInicioAtividade",
  "cnaePrincipal", "cnaePrincipalDescricao", "cnaesSecundarios",
  "naturezaJuridicaCodigo", "naturezaJuridica", "porteCodigo", "porte", "capitalSocial",
  "qualificacaoResponsavelCodigo", "qualificacaoResponsavel", "enteFederativoResponsavel",
  "opcaoSimples", "dataOpcaoSimples", "dataExclusaoSimples", "opcaoMei", "dataOpcaoMei", "dataExclusaoMei",
  "tipoLogradouro", "logradouro", "numero", "complemento", "bairro", "cep",
  "municipioCodigoReceita", "municipioIbge", "municipioNome", "uf",
  "icpTier", "icpScore", "icpReasons", "icpTaxonomyVersion", "icpCalculatedAt",
  "hasRntrc", "rntrcStatus", "rntrcType", "rntrcNumber", "rntrcSource", "rntrcUpdatedAt",
  "dataOrigin", "competencia", "importedAt"
)
SELECT
  $1 || ':' || (payload->>'cnpj'), $1,
  payload->>'cnpj', payload->>'cnpjBasico', payload->>'cnpjOrdem', payload->>'cnpjDv',
  payload->>'razaoSocial', payload->>'razaoSocialSearch', NULLIF(payload->>'nomeFantasia',''), NULLIF(payload->>'nomeFantasiaSearch',''), NULLIF(payload->>'matrizFilial',''),
  NULLIF(payload->>'situacaoCadastralCodigo',''), NULLIF(payload->>'situacaoCadastral',''), NULLIF(payload->>'dataSituacaoCadastral','')::date,
  NULLIF(payload->>'motivoSituacaoCodigo',''), NULLIF(payload->>'motivoSituacaoCadastral',''), NULLIF(payload->>'dataInicioAtividade','')::date,
  NULLIF(payload->>'cnaePrincipal',''), NULLIF(payload->>'cnaePrincipalDescricao',''), COALESCE(payload->'cnaesSecundarios','[]'::jsonb),
  NULLIF(payload->>'naturezaJuridicaCodigo',''), NULLIF(payload->>'naturezaJuridica',''), NULLIF(payload->>'porteCodigo',''), NULLIF(payload->>'porte',''), NULLIF(payload->>'capitalSocial','')::numeric,
  NULLIF(payload->>'qualificacaoResponsavelCodigo',''), NULLIF(payload->>'qualificacaoResponsavel',''), NULLIF(payload->>'enteFederativoResponsavel',''),
  NULLIF(payload->>'opcaoSimples',''), NULLIF(payload->>'dataOpcaoSimples','')::date, NULLIF(payload->>'dataExclusaoSimples','')::date,
  NULLIF(payload->>'opcaoMei',''), NULLIF(payload->>'dataOpcaoMei','')::date, NULLIF(payload->>'dataExclusaoMei','')::date,
  NULLIF(payload->>'tipoLogradouro',''), NULLIF(payload->>'logradouro',''), NULLIF(payload->>'numero',''), NULLIF(payload->>'complemento',''), NULLIF(payload->>'bairro',''), NULLIF(payload->>'cep',''),
  NULLIF(payload->>'municipioCodigoReceita',''), payload->>'municipioIbge', payload->>'municipioNome', payload->>'uf',
  CASE WHEN NULLIF(payload->>'icpTier','') IS NULL THEN NULL ELSE (payload->>'icpTier')::"MarketIntelligenceIcpTier" END,
  NULLIF(payload->>'icpScore','')::integer,
  CASE WHEN payload ? 'icpReasons' THEN payload->'icpReasons' ELSE NULL END,
  NULLIF(payload->>'icpTaxonomyVersion',''), NULLIF(payload->>'icpCalculatedAt','')::timestamp,
  CASE WHEN lower(NULLIF(payload->>'hasRntrc','')) = 'true' THEN true WHEN lower(NULLIF(payload->>'hasRntrc','')) = 'false' THEN false ELSE NULL END,
  NULLIF(payload->>'rntrcStatus',''), NULLIF(payload->>'rntrcType',''), NULLIF(payload->>'rntrcNumber',''), NULLIF(payload->>'rntrcSource',''), NULLIF(payload->>'rntrcUpdatedAt','')::timestamp,
  COALESCE(NULLIF(payload->>'dataOrigin',''), 'OBSERVED')::"MarketIntelligenceDataOrigin",
  payload->>'competencia', NOW()
FROM mi_seed_stage
`;

async function publishSeed(seedDir, manifest) {
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) throw new Error('DATABASE_URL/DIRECT_URL ausente para publicar o seed');
  const datasetId = `mi_seed_${manifest.seedHash.slice(0, 24)}`;
  const client = createResilientClient(connectionString);
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.bypass_rls', 'on', TRUE)");
    await client.query("SELECT set_config('app.current_tenant_id', '', TRUE)");
    await client.query("SET LOCAL statement_timeout = '0'");

    const existing = await client.query(
      'SELECT "id", "status", "publicationSlot" FROM "MarketIntelligenceDataset" WHERE "id" = $1 FOR UPDATE',
      [datasetId],
    );
    if (existing.rows[0]?.status === 'READY' && existing.rows[0]?.publicationSlot === 'CNPJ_ACTIVE') {
      await client.query('COMMIT');
      console.log(JSON.stringify({ status: 'idempotent', datasetId, records: manifest.records }));
      return;
    }
    if (existing.rows.length && existing.rows[0].status !== 'READY') {
      await client.query('DELETE FROM "MarketIntelligenceDataset" WHERE "id" = $1', [datasetId]);
    }

    const reusable = existing.rows.length > 0 && existing.rows[0].status === 'READY';
    if (!reusable) {
      await client.query(
        `INSERT INTO "MarketIntelligenceDataset" (
          "id", "dataset", "competencia", "source", "sourceVersion", "sourceUrl", "status",
          "startedAt", "recordsRead", "recordsImported", "recordsRejected", "recordsActive",
          "hash", "pipelineVersion", "outputManifest", "createdAt", "updatedAt"
        ) VALUES ($1, 'CNPJ_COMPANIES', $2, $3, $4, $5, 'PROCESSING', NOW(), $6, 0, 0, 0, $7, $8, $9::jsonb, NOW(), NOW())`,
        [
          datasetId,
          manifest.competencia,
          manifest.source || 'RECEITA_FEDERAL_CNPJ',
          manifest.sourceVersion || manifest.competencia,
          manifest.sourceUrl || null,
          Number(manifest.records),
          manifest.seedHash,
          manifest.pipelineVersion || 'market-intelligence-company-seed-v1',
          JSON.stringify(manifest),
        ],
      );

      const staged = await stageSeed(client, seedDir, manifest);
      await client.query(COMPANY_INSERT_SQL, [datasetId]);
      const counts = await client.query(
        `SELECT COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE "situacaoCadastral" = 'ATIVA')::bigint AS active
         FROM "MarketIntelligenceCompany" WHERE "datasetId" = $1`,
        [datasetId],
      );
      if (Number(counts.rows[0].total) !== staged) throw new Error('Contagem persistida diverge do staging');
      await client.query(
        `UPDATE "MarketIntelligenceDataset"
         SET "status"='READY', "finishedAt"=NOW(), "recordsImported"=$2,
             "recordsActive"=$3, "updatedAt"=NOW()
         WHERE "id"=$1`,
        [datasetId, staged, Number(counts.rows[0].active)],
      );
    }

    await client.query(
      `UPDATE "MarketIntelligenceDataset"
       SET "publicationSlot"=NULL,
           "status"=CASE WHEN "id"=$1 THEN "status" ELSE 'ARCHIVED'::"MarketIntelligenceDatasetStatus" END,
           "updatedAt"=NOW()
       WHERE "publicationSlot"='CNPJ_ACTIVE' AND "id"<>$1`,
      [datasetId],
    );
    await client.query(
      `UPDATE "MarketIntelligenceDataset"
       SET "publicationSlot"='CNPJ_ACTIVE', "status"='READY', "activatedAt"=NOW(), "updatedAt"=NOW()
       WHERE "id"=$1`,
      [datasetId],
    );
    await client.query('COMMIT');
    console.log(JSON.stringify({ status: reusable ? 'republished' : 'published', datasetId, records: manifest.records, competencia: manifest.competencia }));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally {
    await client.end();
  }
}

// A conexao com o pooler do Supabase pode cair por motivo transitorio (idle reaping, blip de
// rede) sem que haja nada de errado com os dados ou com o schema — foi exatamente o que houve no
// deploy de 31/08 15:15 (mesmo commit tinha publicado com sucesso 7min antes). Retry unico antes
// de falhar o deploy: barato porque publishSeed e idempotente (a checagem READY+CNPJ_ACTIVE no
// topo faz a segunda tentativa sair rapido se a primeira, apesar do erro de conexao, já tiver
// concluido o commit no banco) e nao mascara falhas reais (erro de validacao do seed, schema
// desatualizado etc. nao sao transitorios e continuam derrubando o deploy na 1a tentativa).
async function publishSeedWithRetry(seedDir, manifest, attempts = 2) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await publishSeed(seedDir, manifest);
      return;
    } catch (error) {
      if (attempt === attempts || !isTransientConnectionError(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[market-intelligence-seed] falha transitoria de conexao (tentativa ${attempt}/${attempts}): ${message}. Tentando novamente...`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

export async function main() {
  if (process.env.MARKET_INTELLIGENCE_SEED_ENABLED === 'false') {
    console.log(JSON.stringify({ status: 'disabled' }));
    return;
  }
  const seedDir = resolve(process.env.MARKET_INTELLIGENCE_SEED_DIR || process.argv[2] || DEFAULT_SEED_DIR);
  const manifest = loadManifest(seedDir);
  if (!manifest) {
    console.log(JSON.stringify({ status: 'no-seed', seedDir }));
    return;
  }
  await validateFiles(seedDir, manifest);
  await publishSeedWithRetry(seedDir, manifest);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[market-intelligence-seed] ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exitCode = 1;
  });
}
