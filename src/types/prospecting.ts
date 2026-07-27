export type ConfidenceLevel = 'Alto' | 'Médio' | 'Baixo';

export interface ISourceData {
  sourceName: string;
  url?: string;
  extractedAt: string;
  confidence: ConfidenceLevel;
}

export interface IEnrichedDecisionMaker {
  name: string;
  role: string;
  department: string;
  timeAtCompany?: string;
  linkedin?: string;
  phone?: string;
  whatsapp?: string;
  corporateEmail?: string;
  instagram?: string;
  facebook?: string;
  city?: string;
  state?: string;
  decisionLevel?: 'High' | 'Medium' | 'Low';
  influence?: string;
  score?: number;
  responseProbability?: number;
  sources: ISourceData[];
}

export interface IEnrichedLead {
  id?: string;
  socialReason: string;
  fantasyName: string;
  cnpj: string;
  cadastralSituation?: string;
  foundationDate?: string;
  socialCapital?: number;
  size?: string;
  cnaeMain?: string;
  cnaesSecondary?: string[];
  employeesCount?: string;
  estimatedRevenue?: string;
  addressFull?: string;
  cep?: string;
  city?: string;
  state?: string;
  commercialPhone?: string;
  whatsapp?: string;
  generalEmail?: string;
  website?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  googleMapsUrl?: string;
  googleRating?: number;
  googleReviewsCount?: number;
  description?: string;
  products?: string[];
  services?: string[];
  technologies?: string[];
  erpIdentified?: string;
  crmIdentified?: string;
  branchesCount?: number;
  actionArea?: string;
  decisionMakers: IEnrichedDecisionMaker[];
  sources: ISourceData[];
  
  // Intelligence Fields
  leadScore?: number;
  intelligence?: {
    fitScore?: number;
    fitReason?: string;
    painPoints?: string[];
    valueProposition?: string;
  };
  swotAnalysis?: Record<string, any>;
  bantMatrix?: Record<string, any>;
  gpctMatrix?: Record<string, any>;
  qualifications?: Record<string, any>;
  objectionsMatrix?: Record<string, any>[];
  cadenceScripts?: Record<string, any>;
  
  status: 'NEW' | 'ENRICHING' | 'READY' | 'EXPORTED';
  bitrixId?: string;
}

export interface IProspectingFilter {
  state?: string[];
  city?: string[];
  segment?: string[];
  icp?: string[];
  persona?: string[];
  maxCompanies?: number;
  size?: string[];
  revenue?: string[];
  employees?: string[];
}
