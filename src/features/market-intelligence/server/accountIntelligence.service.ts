import { getMarketIntelligenceCompany } from './marketIntelligenceCompany.service.js';

type CompanyLookupResult = Awaited<ReturnType<typeof getMarketIntelligenceCompany>>;
type CompanyDetail = NonNullable<CompanyLookupResult['company']>;
type DatasetDetail = CompanyLookupResult['dataset'];

export type LdrAvailability = 'AVAILABLE' | 'PARTIAL' | 'NOT_AVAILABLE';
export type LdrActionStatus = 'READY' | 'BLOCKED';

export interface LdrCapability<T> {
  status: LdrAvailability;
  items: T[];
  message: string;
}

function clampScore(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizeIcpReasons(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  if (value && typeof value === 'object') {
    const candidate = (value as { reasons?: unknown }).reasons;
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    }
  }

  return [];
}

function missingAccountScoreComponents(company: CompanyDetail): string[] {
  const missing = ['intent', 'timing', 'relationship'];
  if (typeof company.icpScore !== 'number') missing.unshift('fit');
  return missing;
}

export function buildAccountIntelligence(company: CompanyDetail, dataset: DatasetDetail) {
  const fitScore = clampScore(company.icpScore);
  const icpReasons = normalizeIcpReasons(company.icpReasons);
  const missingComponents = missingAccountScoreComponents(company);
  const scoreStatus: LdrAvailability = fitScore === null ? 'NOT_AVAILABLE' : 'PARTIAL';

  return {
    version: 'ldr-account-intelligence.v1',
    generatedAt: new Date().toISOString(),
    identity: {
      marketIntelligenceCompanyId: company.id,
      cnpj: company.cnpj,
      legalName: company.razaoSocial,
      tradeName: company.nomeFantasia,
      branchType: company.matrizFilial,
      registrationStatus: company.situacaoCadastral,
      primaryCnae: company.cnaePrincipal,
      primaryCnaeDescription: company.cnaePrincipalDescricao,
      size: company.porte,
      capitalSocial: company.capitalSocial,
      municipalityIbge: company.municipioIbge,
      municipality: company.municipioNome,
      uf: company.uf,
    },
    qualification: {
      status: company.icpTier ? 'AVAILABLE' as const : 'NOT_AVAILABLE' as const,
      icpTier: company.icpTier,
      fitScore,
      reasons: icpReasons,
      taxonomyVersion: company.icpTaxonomyVersion,
      calculatedAt: company.icpCalculatedAt,
    },
    accountScore: {
      status: scoreStatus,
      total: fitScore,
      components: {
        fit: fitScore,
        intent: null,
        timing: null,
        relationship: null,
      },
      missingComponents,
      explanation: fitScore === null
        ? 'Account Score ainda não pode ser calculado: nem mesmo o componente de fit está disponível.'
        : 'Score parcial: o fit ICP é real/derivado do catálogo, mas intent, timing e relacionamento ainda não possuem evidência persistida para esta conta.',
    },
    signals: {
      status: 'NOT_AVAILABLE' as const,
      items: [],
      message: 'Sinais materiais da conta ainda não foram persistidos no LDR. Ausência de sinal não é tratada como sinal negativo.',
    } satisfies LdrCapability<never>,
    decisionMakers: {
      status: 'NOT_AVAILABLE' as const,
      items: [],
      message: 'Decisores exigem enriquecimento no contexto do tenant/CRM. O catálogo global não expõe PII.',
    } satisfies LdrCapability<never>,
    economicGroup: {
      status: 'NOT_AVAILABLE' as const,
      items: [],
      message: 'Relações de grupo econômico ainda não possuem fonte persistida e rastreável para esta conta.',
    } satisfies LdrCapability<never>,
    crm: {
      status: 'NOT_AVAILABLE' as const,
      companyId: null,
      message: 'A leitura do catálogo não promove empresas automaticamente ao CRM. O vínculo explícito será o próximo passo do corte vertical.',
    },
    nextBestAction: {
      status: 'BLOCKED' as LdrActionStatus,
      action: null,
      reasons: [
        'Não há sinais materiais persistidos para comprovar timing/intent.',
        'Não há vínculo explícito com uma Company do CRM neste contrato.',
        'Não há decisor validado no contexto do tenant.',
      ],
      message: 'O LDR não fabrica uma recomendação comercial quando faltam evidências mínimas.',
    },
    provenance: {
      ...company.provenance,
      dataset,
      evidencePolicy: 'FACTS_AND_DERIVATIONS_ONLY',
    },
  };
}

export async function getAccountIntelligence(cnpjInput: string) {
  const result = await getMarketIntelligenceCompany(cnpjInput);
  if (!result.company) {
    return {
      account: null,
      dataset: result.dataset,
    };
  }

  return {
    account: buildAccountIntelligence(result.company, result.dataset),
    dataset: result.dataset,
  };
}
