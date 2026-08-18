import { MarketIntelligenceIcpTier, Prisma } from '@prisma/client';

import { prisma } from '../../../lib/prisma.js';

export const CNPJ_CATALOG_PATTERN = /^[A-Z0-9]{12}[0-9]{2}$/;
const ICP_TIERS = new Set(Object.values(MarketIntelligenceIcpTier));
const PAGE_SIZE_MAX = 100;

export type CompanyCatalogSort = 'name' | 'capital' | 'icp';

export interface CompanyCatalogQuery {
  q?: string;
  cnpj?: string;
  uf?: string;
  municipio?: string;
  municipioIbge?: string;
  cnae?: string;
  situacao: string | null;
  porte?: string;
  icpTier?: MarketIntelligenceIcpTier;
  matrizFilial?: 'MATRIZ' | 'FILIAL';
  page: number;
  pageSize: number;
  sort: CompanyCatalogSort;
}

export class CompanyCatalogValidationError extends Error {}

function first(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}

function positiveInt(value: unknown, fallback: number, max?: number): number {
  const parsed = Number.parseInt(first(value) ?? '', 10);
  const valid = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return max ? Math.min(valid, max) : valid;
}

export function normalizeCatalogSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function normalizeCatalogCnpj(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function parseCompanyCatalogQuery(input: Record<string, unknown>): CompanyCatalogQuery {
  const q = first(input.q)?.trim() || undefined;
  const rawCnpj = first(input.cnpj)?.trim();
  const cnpj = rawCnpj ? normalizeCatalogCnpj(rawCnpj) : undefined;
  if (cnpj && !CNPJ_CATALOG_PATTERN.test(cnpj)) {
    throw new CompanyCatalogValidationError('CNPJ deve conter 14 posições; as 12 primeiras aceitam letras/números e os 2 dígitos verificadores permanecem numéricos.');
  }

  const uf = first(input.uf)?.trim().toUpperCase() || undefined;
  if (uf && !/^[A-Z]{2}$/.test(uf)) {
    throw new CompanyCatalogValidationError('UF inválida.');
  }

  const municipioIbge = first(input.municipioIbge)?.replace(/\D/g, '') || undefined;
  if (municipioIbge && !/^\d{7}$/.test(municipioIbge)) {
    throw new CompanyCatalogValidationError('Código IBGE municipal deve conter 7 dígitos.');
  }

  const cnae = first(input.cnae)?.replace(/\D/g, '') || undefined;
  const statusInput = first(input.situacao)?.trim().toUpperCase();
  const situacao = statusInput === 'TODAS' ? null : (statusInput || 'ATIVA');
  const porte = first(input.porte)?.trim().toUpperCase() || undefined;
  const municipio = first(input.municipio)?.trim() || undefined;

  const tierInput = first(input.icpTier)?.trim().toUpperCase();
  let icpTier: MarketIntelligenceIcpTier | undefined;
  if (tierInput) {
    if (!ICP_TIERS.has(tierInput as MarketIntelligenceIcpTier)) {
      throw new CompanyCatalogValidationError('Faixa ICP inválida.');
    }
    icpTier = tierInput as MarketIntelligenceIcpTier;
  }

  const matrizInput = first(input.matrizFilial)?.trim().toUpperCase();
  let matrizFilial: 'MATRIZ' | 'FILIAL' | undefined;
  if (matrizInput) {
    if (matrizInput !== 'MATRIZ' && matrizInput !== 'FILIAL') {
      throw new CompanyCatalogValidationError('matrizFilial deve ser MATRIZ ou FILIAL.');
    }
    matrizFilial = matrizInput;
  }

  const sortInput = first(input.sort)?.trim().toLowerCase();
  const sort: CompanyCatalogSort = sortInput === 'capital' || sortInput === 'icp' ? sortInput : 'name';

  return {
    q,
    cnpj,
    uf,
    municipio,
    municipioIbge,
    cnae,
    situacao,
    porte,
    icpTier,
    matrizFilial,
    page: positiveInt(input.page, 1),
    pageSize: positiveInt(input.pageSize ?? input.limit, 25, PAGE_SIZE_MAX),
    sort,
  };
}

const LIST_SELECT = {
  id: true,
  cnpj: true,
  razaoSocial: true,
  nomeFantasia: true,
  matrizFilial: true,
  situacaoCadastral: true,
  cnaePrincipal: true,
  cnaePrincipalDescricao: true,
  porte: true,
  capitalSocial: true,
  municipioIbge: true,
  municipioNome: true,
  uf: true,
  opcaoSimples: true,
  opcaoMei: true,
  icpTier: true,
  icpScore: true,
  dataOrigin: true,
  competencia: true,
} satisfies Prisma.MarketIntelligenceCompanySelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  cnpjBasico: true,
  cnpjOrdem: true,
  cnpjDv: true,
  situacaoCadastralCodigo: true,
  dataSituacaoCadastral: true,
  motivoSituacaoCodigo: true,
  motivoSituacaoCadastral: true,
  dataInicioAtividade: true,
  cnaesSecundarios: true,
  naturezaJuridicaCodigo: true,
  naturezaJuridica: true,
  porteCodigo: true,
  qualificacaoResponsavelCodigo: true,
  qualificacaoResponsavel: true,
  enteFederativoResponsavel: true,
  dataOpcaoSimples: true,
  dataExclusaoSimples: true,
  dataOpcaoMei: true,
  dataExclusaoMei: true,
  tipoLogradouro: true,
  logradouro: true,
  numero: true,
  complemento: true,
  bairro: true,
  cep: true,
  municipioCodigoReceita: true,
  icpReasons: true,
  icpTaxonomyVersion: true,
  icpCalculatedAt: true,
  importedAt: true,
} satisfies Prisma.MarketIntelligenceCompanySelect;

async function activeDataset() {
  return prisma.marketIntelligenceDataset.findFirst({
    where: { dataset: 'CNPJ_COMPANIES', publicationSlot: 'CNPJ_ACTIVE', status: 'READY' },
    select: {
      id: true,
      competencia: true,
      source: true,
      sourceVersion: true,
      sourceUrl: true,
      recordsImported: true,
      recordsActive: true,
      hash: true,
      pipelineVersion: true,
      activatedAt: true,
    },
  });
}

function datasetPayload(dataset: NonNullable<Awaited<ReturnType<typeof activeDataset>>>) {
  return {
    competencia: dataset.competencia,
    source: dataset.source,
    sourceVersion: dataset.sourceVersion,
    sourceUrl: dataset.sourceUrl,
    recordsImported: Number(dataset.recordsImported),
    recordsActive: Number(dataset.recordsActive),
    hash: dataset.hash,
    pipelineVersion: dataset.pipelineVersion,
    activatedAt: dataset.activatedAt,
  };
}

function serializeCompany<T extends Record<string, unknown>>(row: T): T & { capitalSocial?: string | null } {
  const capital = row.capitalSocial;
  return {
    ...row,
    ...(capital !== undefined ? { capitalSocial: capital === null ? null : String(capital) } : {}),
  } as T & { capitalSocial?: string | null };
}

function buildWhere(datasetId: string, query: CompanyCatalogQuery): Prisma.MarketIntelligenceCompanyWhereInput {
  const where: Prisma.MarketIntelligenceCompanyWhereInput = { datasetId };
  if (query.cnpj) where.cnpj = query.cnpj;
  if (query.uf) where.uf = query.uf;
  if (query.municipioIbge) where.municipioIbge = query.municipioIbge;
  if (query.municipio) where.municipioNome = { contains: query.municipio, mode: 'insensitive' };
  if (query.cnae) where.cnaePrincipal = { startsWith: query.cnae };
  if (query.situacao) where.situacaoCadastral = query.situacao;
  if (query.porte) where.porte = query.porte;
  if (query.icpTier) where.icpTier = query.icpTier;
  if (query.matrizFilial) where.matrizFilial = query.matrizFilial;

  if (query.q) {
    const normalizedCnpj = normalizeCatalogCnpj(query.q);
    const normalizedText = normalizeCatalogSearch(query.q);
    const clauses: Prisma.MarketIntelligenceCompanyWhereInput[] = [];
    if (normalizedCnpj) clauses.push({ cnpj: { contains: normalizedCnpj } });
    if (normalizedText) {
      clauses.push(
        { razaoSocialSearch: { contains: normalizedText } },
        { nomeFantasiaSearch: { contains: normalizedText } },
      );
    }
    if (clauses.length) where.OR = clauses;
  }
  return where;
}

function orderBy(sort: CompanyCatalogSort): Prisma.MarketIntelligenceCompanyOrderByWithRelationInput[] {
  if (sort === 'capital') return [{ capitalSocial: 'desc' }, { razaoSocial: 'asc' }];
  if (sort === 'icp') return [{ icpScore: 'desc' }, { razaoSocial: 'asc' }];
  return [{ razaoSocial: 'asc' }, { cnpj: 'asc' }];
}

export async function listMarketIntelligenceCompanies(query: CompanyCatalogQuery) {
  const dataset = await activeDataset();
  if (!dataset) {
    return {
      data: [],
      meta: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
      dataset: null,
    };
  }

  const where = buildWhere(dataset.id, query);
  const [rows, total] = await Promise.all([
    prisma.marketIntelligenceCompany.findMany({
      where,
      select: LIST_SELECT,
      orderBy: orderBy(query.sort),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.marketIntelligenceCompany.count({ where }),
  ]);

  return {
    data: rows.map((row) => serializeCompany(row)),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    },
    dataset: datasetPayload(dataset),
  };
}

export async function getMarketIntelligenceCompany(cnpjInput: string) {
  const cnpj = normalizeCatalogCnpj(cnpjInput);
  if (!CNPJ_CATALOG_PATTERN.test(cnpj)) {
    throw new CompanyCatalogValidationError('CNPJ inválido para o catálogo empresarial.');
  }

  const dataset = await activeDataset();
  if (!dataset) return { company: null, dataset: null };

  const company = await prisma.marketIntelligenceCompany.findFirst({
    where: { datasetId: dataset.id, cnpj },
    select: DETAIL_SELECT,
  });
  if (!company) return { company: null, dataset: datasetPayload(dataset) };

  return {
    company: {
      ...serializeCompany(company),
      provenance: {
        source: dataset.source,
        sourceVersion: dataset.sourceVersion,
        sourceUrl: dataset.sourceUrl,
        competencia: dataset.competencia,
        datasetHash: dataset.hash,
        pipelineVersion: dataset.pipelineVersion,
        companyFields: 'OBSERVED',
        icp: company.icpTier ? 'DERIVED' : 'NOT_AVAILABLE',
        rntrcCompany: 'NOT_AVAILABLE',
        publicContact: 'REDACTED_GLOBAL_CATALOG',
      },
    },
    dataset: datasetPayload(dataset),
  };
}
