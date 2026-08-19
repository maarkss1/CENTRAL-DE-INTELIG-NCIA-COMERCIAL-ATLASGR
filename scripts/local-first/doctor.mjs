import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const localHosts = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);
const remoteMarkers = [
  'supabase.co',
  'neon.tech',
  'railway.app',
  'onrender.com',
  'render.com',
  'vercel.app',
];

const inspectedKeys = [
  'DATABASE_URL',
  'DIRECT_URL',
  'REDIS_URL',
  'MEILI_HOST',
  'STORAGE_ENDPOINT',
  'BETTER_AUTH_URL',
  'PUBLIC_BASE_URL',
  'OLLAMA_BASE_URL',
  'LITELLM_URL',
  'LANGFUSE_BASEURL',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'LOKI_HOST',
];

let failed = false;

function parseHost(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function assertNoKnownCloud(key, value) {
  if (!value) return;
  const normalized = value.toLowerCase();
  const marker = remoteMarkers.find((candidate) => normalized.includes(candidate));
  if (marker) {
    console.error(`[FAIL] ${key} ainda aponta para cloud (${marker}).`);
    failed = true;
  }
}

console.log('ATLASGR local-first doctor');
console.log('--------------------------');

for (const key of inspectedKeys) {
  const value = process.env[key]?.trim();
  assertNoKnownCloud(key, value);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error('[FAIL] DATABASE_URL não está definida.');
  failed = true;
} else {
  const host = parseHost(databaseUrl);
  if (!host || !localHosts.has(host)) {
    console.error(`[FAIL] DATABASE_URL precisa apontar para o PostgreSQL local. Host atual: ${host ?? 'inválido'}.`);
    failed = true;
  } else {
    console.log(`[OK] PostgreSQL configurado em ${host}.`);
  }
}

const directUrl = process.env.DIRECT_URL?.trim();
if (directUrl) {
  const host = parseHost(directUrl);
  if (!host || !localHosts.has(host)) {
    console.error(`[FAIL] DIRECT_URL precisa ser local ou ficar vazia. Host atual: ${host ?? 'inválido'}.`);
    failed = true;
  } else {
    console.log(`[OK] DIRECT_URL local em ${host}.`);
  }
}

for (const key of ['BETTER_AUTH_URL', 'PUBLIC_BASE_URL']) {
  const value = process.env[key]?.trim();
  if (!value) continue;
  const host = parseHost(value);
  if (!host || !localHosts.has(host)) {
    console.error(`[FAIL] ${key} precisa apontar para localhost durante a fase local-first.`);
    failed = true;
  } else {
    console.log(`[OK] ${key} local.`);
  }
}

const storageEndpoint = process.env.STORAGE_ENDPOINT?.trim();
if (!storageEndpoint) {
  console.warn('[WARN] STORAGE_ENDPOINT não definido. Uploads ficam inertes até configurar o MinIO local.');
} else {
  const host = parseHost(storageEndpoint);
  if (!host || !localHosts.has(host)) {
    console.error(`[FAIL] STORAGE_ENDPOINT precisa apontar para o MinIO local. Host atual: ${host ?? 'inválido'}.`);
    failed = true;
  } else {
    console.log(`[OK] Storage local em ${host}.`);
  }
}

if (!failed && databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const result = await pool.query('select current_database() as database_name');
    console.log(`[OK] Conexão PostgreSQL: ${result.rows[0]?.database_name ?? 'conectado'}.`);
  } catch (error) {
    console.error(`[FAIL] PostgreSQL local não respondeu: ${error instanceof Error ? error.message : String(error)}`);
    failed = true;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

if (failed) {
  console.error('\nLocal-first doctor encontrou bloqueios. Nenhum ambiente cloud deve ser usado como runtime da Central nesta fase.');
  process.exit(1);
}

console.log('\n[OK] Configuração principal está local-first.');
