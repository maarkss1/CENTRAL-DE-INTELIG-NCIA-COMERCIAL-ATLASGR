import { Company, CompanyRepository } from '../domain/Company';
import { z } from 'zod';
import { companySchema } from '../../../lib/zod';
import { enrichCompany } from '../../prospecting/services/enrichment.service';
import { enrichmentQueue } from '../../../lib/queue/enrichment.queue';
import { BaseUseCases } from '../../../shared/application/BaseUseCases';

export class CompanyUseCases extends BaseUseCases<Company, CompanyRepository> {
    constructor(companyRepository: CompanyRepository) {
        super(companyRepository);
    }

    async findCompanies(organizationId: string, query?: string, page: number = 1, limit: number = 50) {
        return this.findAll(organizationId, query, page, limit);
    }

    async findCompanyById(organizationId: string, id: string) {
        return this.findById(organizationId, id);
    }

    async createCompany(organizationId: string, data: z.infer<typeof companySchema>) {
        const validated = companySchema.parse(data);
        const company = await this.create(organizationId, validated);

        // Dispatch para a fila de enriquecimento — organizationId é obrigatório para o
        // worker injetar o tenantId no requestContext e o Prisma/RLS encontrar a empresa.
        await enrichmentQueue?.add('enrich-company', {
            companyId: company.id,
            organizationId,
            cnpj: company.cnpj || undefined,
            segmentKeywords: company.segment ? [company.segment] : undefined
        });

        return company;
    }

    async updateCompany(organizationId: string, id: string, data: Partial<z.infer<typeof companySchema>>) {
        return this.update(organizationId, id, data);
    }

    async deleteCompany(organizationId: string, id: string) {
        return this.delete(organizationId, id);
    }

    async enrichCompany(organizationId: string, id: string, data?: { cnpj?: string, segmentKeywords?: string[] }) {
        const company = await this.repository.findById!(organizationId, id);
        if (!company) throw new Error('Company not found');

        const result = await enrichCompany(organizationId, id, { cnpj: data?.cnpj, segmentKeywords: data?.segmentKeywords });
        return result;
    }
}
