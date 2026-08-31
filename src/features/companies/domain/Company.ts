import type { Repository } from '../../../shared/domain/Repository';
import type { CompanyStatus } from '@prisma/client';

export interface Company {
  id: string;
  legalName: string;
  tradeName: string;
  cnpj: string | null;
  stateRegistration: string | null;
  segment: string | null;
  cnae: string | null;
  size: string | null;
  employeeCount: number | null;
  estimatedRevenue: number | null;
  website: string | null;
  linkedin: string | null;
  instagram: string | null;
  phones: string[];
  emails: string[];
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  owner: string | null;
  status: CompanyStatus;
  tags: string[];
  observations: string | null;
  createdAt: Date;
  updatedAt: Date;
  situacaoCadastral: string | null;
  naturezaJuridica: string | null;
  capitalSocial: number | null;
  dataAbertura: Date | null;
  qsa: unknown | null;
  enrichmentStatus: string;
  enrichmentSource: string | null;
  enrichedAt: Date | null;
  googleRating: number | null;
  googleReviewsCount: number | null;
  businessHours: unknown | null;
  organizationId: string | null;
}

export interface CompanyRepository extends Repository<Company> {
  findAllWithFilters(
    organizationId: string,
    query?: string,
    page?: number,
    limit?: number,
  ): Promise<{ data: Company[]; meta: unknown }>;
  findById(organizationId: string, id: string): Promise<Company | null>;
  create(organizationId: string, data: Partial<Company>): Promise<Company>;
  update(organizationId: string, id: string, data: Partial<Company>): Promise<Company>;
  delete(organizationId: string, id: string): Promise<Company>;
}
