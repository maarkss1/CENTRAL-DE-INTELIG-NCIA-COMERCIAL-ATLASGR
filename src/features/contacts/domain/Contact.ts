import type { Repository } from '../../../shared/domain/Repository';
import type { ContactStatus } from '@prisma/client';

export interface Contact {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  linkedin: string | null;
  birthDate: Date | null;
  observations: string | null;
  status: ContactStatus;
  source: string | null;
  companyId: string;
  organizationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  company?: unknown;
  leads?: unknown[];
}

export interface ContactRepository extends Repository<Contact> {
  findAllWithFilters(
    organizationId: string,
    query?: string,
    page?: number,
    limit?: number,
  ): Promise<{ data: Contact[]; meta: unknown }>;
}
