export interface IEnrichmentSource {
  sourceName: string;
  extractedAt: string;
}

export interface IEnrichmentConfidence {
  company: number;
  address: number;
  contacts: number;
  social: number;
}

export interface IEnrichmentMetadata {
  sources: IEnrichmentSource[];
  confidence: IEnrichmentConfidence;
  timestamp: string;
  executionTime: number;
  cacheHit?: boolean;
}

export interface IEnrichedCompanyData {
  legalName?: string;
  tradeName?: string;
  cnpj?: string;
  situacaoCadastral?: string;
  naturezaJuridica?: string;
  capitalSocial?: number;
  dataAbertura?: string;
  cnae?: string;
  cnaeDescription?: string;
  size?: string;
  employeeCountEstimate?: number;
  qsa?: Array<{ nome: string; qualificacao: string }>;
  googleRating?: number;
  googleReviewsCount?: number;
  businessHours?: unknown;
  technologies?: string[];
  keywords?: string[];
  logoUrl?: string;
  apolloOrgId?: string;
}

export interface IEnrichedAddressData {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  fullAddress?: string;
}

export interface IEnrichedContactItem {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin?: string | null;
}

export interface IEnrichedContactsData {
  phones: string[];
  emails: string[];
  decisionMakers: IEnrichedContactItem[];
}

export interface IEnrichedSocialData {
  website?: string;
  linkedin?: string;
  facebook?: string;
  twitter?: string;
  instagram?: string;
}

export interface IEnrichmentResult {
  company: IEnrichedCompanyData;
  address: IEnrichedAddressData;
  contacts: IEnrichedContactsData;
  social: IEnrichedSocialData;
  enrichment: IEnrichmentMetadata;
}
