import { Company, CompanyRepository } from '../domain/Company';
import { prisma } from '../../../lib/prisma';
import { Prisma } from '@prisma/client';
import { env } from '../../../config/env';
import { searchCompanyIds } from '../../../lib/search/index';

export class PrismaCompanyRepository implements CompanyRepository {
    async findAllWithFilters(organizationId: string, query?: string, page: number = 1, limit: number = 50): Promise<{ data: Company[], meta: unknown }> {
        const where: Prisma.CompanyWhereInput = { organizationId };

        if (query) {
            // Com ENABLE_SEARCH=true, prioriza o Meilisearch (tolerante a erros de digitação e
            // ranqueado por relevância) sobre o ILIKE simples do Postgres. `null` significa que o
            // Meilisearch está indisponível/falhou — cai de volta para o filtro OR abaixo. Um array
            // vazio é uma resposta legítima do Meilisearch (busca funcionou, sem resultados) e deve
            // ser respeitado, não sobrescrito pelo fallback.
            const meiliIds = env.ENABLE_SEARCH ? await searchCompanyIds(organizationId, query, limit) : null;
            if (meiliIds !== null) {
                where.id = { in: meiliIds };
            } else {
                where.OR = [
                    { tradeName: { contains: query, mode: 'insensitive' } },
                    { legalName: { contains: query, mode: 'insensitive' } },
                    { cnpj: { contains: query, mode: 'insensitive' } },
                    { emails: { hasSome: [query] } },
                    { phones: { hasSome: [query] } },
                    { website: { contains: query, mode: 'insensitive' } }
                ];
            }
        }

        const skip = (page - 1) * limit;

        const [data, total] = await prisma.$transaction([
            prisma.company.findMany({ where, skip, take: limit, include: { contacts: true, leads: true }, orderBy: { createdAt: 'desc' } }),
            prisma.company.count({ where })
        ]);

        return { data: data as unknown as Company[], meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async findById(organizationId: string, id: string): Promise<Company | null> {
        const company = await prisma.company.findFirst({
            where: { id, organizationId },
            include: { contacts: true, leads: true }
        });
        return company as unknown as Company | null;
    }

    async create(organizationId: string, data: Partial<Company>): Promise<Company> {
        return prisma.company.create({
            data: { ...data, organizationId } as Prisma.CompanyCreateInput
        });
    }

    async update(organizationId: string, id: string, data: Partial<Company>): Promise<Company> {
        const existing = await prisma.company.findFirst({ where: { id, organizationId } });
        if (!existing) throw new Error('Company not found');

        // organizationId também no `where` do update em si (mesmo padrão de PrismaLeadRepository)
        // — não corrige uma falha explorável hoje (o pré-check acima + RLS real já bloqueiam um
        // tenant errado), mas deixa a query de escrita autocontida em vez de depender só do
        // pré-check + RLS como únicas camadas.
        return prisma.company.update({
            where: { id, organizationId },
            data: data as Prisma.CompanyUpdateInput
        });
    }

    async delete(organizationId: string, id: string): Promise<Company> {
        const existing = await prisma.company.findFirst({ where: { id, organizationId } });
        if (!existing) throw new Error('Company not found');
        return prisma.company.delete({ where: { id, organizationId } });
    }
}
