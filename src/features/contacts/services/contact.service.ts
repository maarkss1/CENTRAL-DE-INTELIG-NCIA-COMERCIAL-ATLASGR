import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { contactSchema } from '../../../lib/zod';
import { z } from 'zod';
import { enrichCompany } from '../../prospecting/services/enrichment.service';

export class ContactService {
    async findAll(organizationId: string, query?: string, page: number = 1, limit: number = 50) {
        const where: Prisma.ContactWhereInput = { organizationId };
        if (query) {
            where.OR = [
                { name: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query, mode: 'insensitive' } },
                { whatsapp: { contains: query, mode: 'insensitive' } },
                { role: { contains: query, mode: 'insensitive' } },
                { department: { contains: query, mode: 'insensitive' } },
                { company: { tradeName: { contains: query, mode: 'insensitive' } } },
                { company: { legalName: { contains: query, mode: 'insensitive' } } },
            ];
        }
        
        const skip = (page - 1) * limit;
        
        const [data, total] = await prisma.$transaction([
            prisma.contact.findMany({ where, skip, take: limit, include: { company: true }, orderBy: { createdAt: 'desc' } }),
            prisma.contact.count({ where })
        ]);
        
        return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async findById(organizationId: string, id: string) {
        return prisma.contact.findFirst({
            where: { id, organizationId },
            include: { company: true, leads: true }
        });
    }

    async create(organizationId: string, data: z.infer<typeof contactSchema>) {
        const validated = contactSchema.parse(data);
        return prisma.contact.create({
            data: {
                ...validated,
                organizationId,
                birthDate: validated.birthDate ? new Date(validated.birthDate) : null
            }
        });
    }

    async update(organizationId: string, id: string, data: Partial<z.infer<typeof contactSchema>>) {
        const updateData: Prisma.ContactUpdateInput = { ...data };
        if (data.birthDate) updateData.birthDate = new Date(data.birthDate);
        // Ensure contact belongs to org
        const existing = await prisma.contact.findFirst({ where: { id, organizationId } });
        if (!existing) throw new Error('Contact not found');

        // organizationId também no `where` do update em si (mesmo padrão de PrismaLeadRepository)
        // — hardening, não corrige falha explorável (pré-check acima + RLS já bloqueiam).
        return prisma.contact.update({
            where: { id, organizationId },
            data: updateData
        });
    }

    async delete(organizationId: string, id: string) {
        const existing = await prisma.contact.findFirst({ where: { id, organizationId } });
        if (!existing) throw new Error('Contact not found');
        return prisma.contact.delete({ where: { id, organizationId } });
    }

    /** Enriquece a empresa vinculada ao contato (Receita Federal + Google Negócios + Apollo) e retorna o contato atualizado. */
    async enrich(organizationId: string, id: string) {
        const contact = await prisma.contact.findFirst({ where: { id, organizationId } });
        if (!contact) throw new Error('Contact not found');
        if (!contact.companyId) throw new Error('Contato sem empresa vinculada — não é possível enriquecer');

        const result = await enrichCompany(organizationId, contact.companyId, {});
        const updated = await this.findById(organizationId, id);

        return { contact: updated, fit: result.fit, enrichment: result };
    }
}
export const contactService = new ContactService();
