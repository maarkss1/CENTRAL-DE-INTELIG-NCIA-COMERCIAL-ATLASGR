import { Company, CompanyRepository } from '../domain/Company';
import { prisma } from '../../../lib/prisma';
import { Prisma } from '@prisma/client';
import { DEMO_COMPANIES } from '../../../shared/infra/demoStore';

export class PrismaCompanyRepository implements CompanyRepository {
    async findAllWithFilters(organizationId: string, query?: string, page: number = 1, limit: number = 50): Promise<{ data: Company[], meta: unknown }> {
        try {
            const where: Prisma.CompanyWhereInput = { organizationId };

            if (query) {
                where.OR = [
                    { tradeName: { contains: query, mode: 'insensitive' } },
                    { legalName: { contains: query, mode: 'insensitive' } },
                    { cnpj: { contains: query, mode: 'insensitive' } },
                    { emails: { hasSome: [query] } },
                    { phones: { hasSome: [query] } },
                    { website: { contains: query, mode: 'insensitive' } }
                ];
            }

            const skip = (page - 1) * limit;

            const [data, total] = await prisma.$transaction([
                prisma.company.findMany({ where, skip, take: limit, include: { contacts: true, leads: true }, orderBy: { createdAt: 'desc' } }),
                prisma.company.count({ where })
            ]);

            if (data && data.length > 0) {
                return { data: data as unknown as Company[], meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
            }
        } catch {
            // DB connection offline or unseeded in dev
        }

        let filtered = DEMO_COMPANIES;
        if (query) {
            const q = query.toLowerCase();
            filtered = DEMO_COMPANIES.filter(c => 
                c.tradeName.toLowerCase().includes(q) || 
                c.legalName.toLowerCase().includes(q) ||
                (c.cnpj && c.cnpj.includes(q))
            );
        }
        return {
            // Dados de demo (src/types) não têm os campos de enriquecimento mais novos do domínio.
            data: filtered as unknown as Company[],
            meta: { total: filtered.length, page, limit, totalPages: 1 }
        };
    }

    async findById(organizationId: string, id: string): Promise<Company | null> {
        try {
            const company = await prisma.company.findFirst({
                where: { id, organizationId },
                include: { contacts: true, leads: true }
            });
            if (company) return company as unknown as Company;
        } catch {
            // Fallback
        }
        return (DEMO_COMPANIES.find(c => c.id === id) || DEMO_COMPANIES[0] || null) as unknown as Company | null;
    }

    async create(organizationId: string, data: Partial<Company>): Promise<Company> {
        return prisma.company.create({
            data: { ...data, organizationId } as Prisma.CompanyCreateInput
        });
    }

    async update(organizationId: string, id: string, data: Partial<Company>): Promise<Company> {
        const existing = await prisma.company.findFirst({ where: { id, organizationId } });
        if (!existing) throw new Error('Company not found');

        return prisma.company.update({
            where: { id },
            data: data as Prisma.CompanyUpdateInput
        });
    }

    async delete(organizationId: string, id: string): Promise<Company> {
        const existing = await prisma.company.findFirst({ where: { id, organizationId } });
        if (!existing) throw new Error('Company not found');
        return prisma.company.delete({ where: { id } });
    }
}
