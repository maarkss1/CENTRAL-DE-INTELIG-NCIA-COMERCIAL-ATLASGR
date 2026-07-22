import { CompanyRepository } from '../domain/Company';
import { z } from 'zod';
import { companySchema } from '../../../lib/zod';
import { enrichCompany } from '../../prospecting/services/enrichment.service';
import { enrichmentQueue } from '../../../lib/queue/enrichment.queue';

export class CompanyUseCases {
    constructor(private companyRepository: CompanyRepository) {}

    async findCompanies(organizationId: string, query?: string, page: number = 1, limit: number = 50) {
        return this.companyRepository.findAllWithFilters(organizationId, query, page, limit);
    }

    async findCompanyById(organizationId: string, id: string) {
        return this.companyRepository.findById!(organizationId, id);
    }

    async createCompany(organizationId: string, data: z.infer<typeof companySchema>) {
        const validated = companySchema.parse(data);
        const company = await this.companyRepository.create!(organizationId, validated as any);
        
        // Dispatch para a fila de enriquecimento
        await enrichmentQueue.add('enrich-company', {
            companyId: company.id,
            cnpj: company.cnpj || undefined,
            segmentKeywords: company.segment ? [company.segment] : undefined
        });

        return company;
    }

    async updateCompany(organizationId: string, id: string, data: Partial<z.infer<typeof companySchema>>) {
        return this.companyRepository.update!(organizationId, id, data as any);
    }

    async deleteCompany(organizationId: string, id: string) {
        return this.companyRepository.delete!(organizationId, id);
    }

    async enrichCompany(organizationId: string, id: string, data?: { cnpj?: string, segmentKeywords?: string[] }) {
        const company = await this.companyRepository.findById!(organizationId, id);
        if (!company) throw new Error('Company not found');

        const result = await enrichCompany(id, { cnpj: data?.cnpj, segmentKeywords: data?.segmentKeywords });
        return result;
    }
}
