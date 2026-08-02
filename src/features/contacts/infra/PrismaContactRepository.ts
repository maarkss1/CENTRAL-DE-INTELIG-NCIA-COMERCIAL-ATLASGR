import { Contact, ContactRepository } from '../domain/Contact';
import { prisma } from '../../../lib/prisma';
import { Prisma } from '@prisma/client';

export class PrismaContactRepository implements ContactRepository {
    async findAllWithFilters(organizationId: string, query?: string, page: number = 1, limit: number = 50): Promise<{ data: Contact[], meta: unknown }> {
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

        return { data: data as unknown as Contact[], meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async findById(organizationId: string, id: string): Promise<Contact | null> {
        const contact = await prisma.contact.findFirst({
            where: { id, organizationId },
            include: { company: true, leads: true }
        });
        return contact as unknown as Contact | null;
    }

    async create(organizationId: string, data: Partial<Contact> & { birthDate?: string | Date }): Promise<Contact> {
        return prisma.contact.create({
            data: {
                ...data,
                organizationId,
                birthDate: data.birthDate ? new Date(data.birthDate) : null
            } as Prisma.ContactCreateInput
        });
    }

    async update(organizationId: string, id: string, data: Partial<Contact> & { birthDate?: string | Date }): Promise<Contact> {
        const updateData: Prisma.ContactUpdateInput = { ...data } as Prisma.ContactUpdateInput;
        if (data.birthDate) updateData.birthDate = new Date(data.birthDate);

        const existing = await prisma.contact.findFirst({ where: { id, organizationId } });
        if (!existing) throw new Error('Contact not found');

        return prisma.contact.update({
            where: { id },
            data: updateData as Prisma.ContactUpdateInput
        });
    }

    async delete(organizationId: string, id: string): Promise<Contact> {
        const existing = await prisma.contact.findFirst({ where: { id, organizationId } });
        if (!existing) throw new Error('Contact not found');
        return prisma.contact.delete({ where: { id } });
    }
}
