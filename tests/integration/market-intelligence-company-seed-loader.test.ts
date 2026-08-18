import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { prisma } from '../../src/lib/prisma';
import { withRlsBypass } from '../helpers/rbac-e2e-helpers';

const seedDir = mkdtempSync(join(tmpdir(), 'mi-company-seed-'));
const seedHash = createHash('sha256').update(`seed-${Date.now()}-${Math.random()}`).digest('hex');
const datasetId = `mi_seed_${seedHash.slice(0, 24)}`;

function row(cnpj: string, legalName: string) {
  return {
    cnpj,
    cnpjBasico: cnpj.slice(0, 8),
    cnpjOrdem: cnpj.slice(8, 12),
    cnpjDv: cnpj.slice(12, 14),
    razaoSocial: legalName,
    razaoSocialSearch: legalName.toUpperCase(),
    nomeFantasia: '',
    nomeFantasiaSearch: '',
    matrizFilial: 'MATRIZ',
    situacaoCadastralCodigo: '02',
    situacaoCadastral: 'ATIVA',
    dataSituacaoCadastral: '2026-08-01',
    dataInicioAtividade: '2020-01-01',
    cnaePrincipal: '4930202',
    cnaePrincipalDescricao: 'Transporte rodoviario de carga',
    cnaesSecundarios: [],
    porteCodigo: '03',
    porte: 'EMPRESA_DE_PEQUENO_PORTE',
    capitalSocial: '100000.00',
    municipioCodigoReceita: '6969',
    municipioIbge: '3543402',
    municipioNome: 'Ribeirao Preto',
    uf: 'SP',
    icpTier: '',
    icpScore: '',
    icpReasons: null,
    hasRntrc: '',
    dataOrigin: 'OBSERVED',
    competencia: '2026-08',
  };
}

const rows = [
  row('A2345678901234', 'EMPRESA ALFANUMERICA TESTE'),
  row('12345678000199', 'EMPRESA NUMERICA TESTE'),
];
const part = gzipSync(rows.map((item) => JSON.stringify(item)).join('\n') + '\n');
const partPath = join(seedDir, 'part-0001.ndjson.gz');
writeFileSync(partPath, part);
const partHash = createHash('sha256').update(part).digest('hex');
writeFileSync(
  join(seedDir, 'manifest.json'),
  JSON.stringify({
    dataset: 'CNPJ_COMPANIES_SEED',
    scope: 'INTEGRATION_TEST',
    source: 'RECEITA_FEDERAL_CNPJ',
    sourceUrl: 'https://arquivos.receitafederal.gov.br',
    sourceVersion: '2026-08',
    competencia: '2026-08',
    pipelineVersion: 'market-intelligence-company-seed-v1',
    seedHash,
    filters: { uf: 'SP', municipioIbge: '3543402', municipioNome: 'Ribeirao Preto' },
    records: rows.length,
    activeRecords: rows.length,
    parts: [{ path: 'part-0001.ndjson.gz', sha256: partHash, records: rows.length }],
    dataOrigin: 'OBSERVED',
  }),
  'utf8',
);

describe('Market Intelligence company seed bootstrap', () => {
  afterAll(async () => {
    await withRlsBypass(async () => {
      await prisma.marketIntelligenceDataset.deleteMany({ where: { id: datasetId } });
    });
    rmSync(seedDir, { recursive: true, force: true });
  });

  it('publica o seed atomicamente, sem PII, e e idempotente', async () => {
    const script = resolve(process.cwd(), 'scripts/market-intelligence/load-company-seed.mjs');
    const env = {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_URL: '',
      MARKET_INTELLIGENCE_SEED_DIR: seedDir,
    };

    const first = spawnSync(process.execPath, [script], {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(first.status, first.stderr || first.stdout).toBe(0);
    expect(first.stdout).toContain('"status":"published"');

    const persisted = await withRlsBypass(async () => {
      const dataset = await prisma.marketIntelligenceDataset.findUnique({ where: { id: datasetId } });
      const companies = await prisma.marketIntelligenceCompany.findMany({
        where: { datasetId },
        orderBy: { cnpj: 'asc' },
      });
      return { dataset, companies };
    });

    expect(persisted.dataset?.status).toBe('READY');
    expect(persisted.dataset?.publicationSlot).toBe('CNPJ_ACTIVE');
    expect(persisted.dataset?.recordsImported).toBe(BigInt(2));
    expect(persisted.companies).toHaveLength(2);
    expect(persisted.companies.every((company) => company.municipioIbge === '3543402')).toBe(true);
    expect(persisted.companies.every((company) => (
      company.ddd1 === null && company.telefone1 === null && company.ddd2 === null &&
      company.telefone2 === null && company.dddFax === null && company.fax === null && company.email === null
    ))).toBe(true);

    const second = spawnSync(process.execPath, [script], {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(second.status, second.stderr || second.stdout).toBe(0);
    expect(second.stdout).toContain('"status":"idempotent"');

    const count = await withRlsBypass(() => prisma.marketIntelligenceCompany.count({ where: { datasetId } }));
    expect(count).toBe(2);
  }, 60_000);
});
