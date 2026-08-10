import { Contact, ContactRepository } from '../domain/Contact';
import { z } from 'zod';
import { contactSchema } from '../../../lib/zod';
import { enrichCompany } from '../../prospecting/services/enrichment.service';
import { BaseUseCases } from '../../../shared/application/BaseUseCases';

export class ContactUseCases extends BaseUseCases<Contact, ContactRepository> {
    constructor(contactRepository: ContactRepository) {
        super(contactRepository);
    }

    async findContacts(organizationId: string, query?: string, page: number = 1, limit: number = 50) {
        return this.findAll(organizationId, query, page, limit);
    }

    async findContactById(organizationId: string, id: string) {
        return this.findById(organizationId, id);
    }

    async createContact(organizationId: string, data: z.infer<typeof contactSchema>) {
        const validated = contactSchema.parse(data);
        return this.create(organizationId, validated);
    }

    async updateContact(organizationId: string, id: string, data: Partial<z.infer<typeof contactSchema>>) {
        return this.update(organizationId, id, data);
    }

    async deleteContact(organizationId: string, id: string) {
        return this.delete(organizationId, id);
    }

    async enrichContact(organizationId: string, id: string) {
        const contact = await this.repository.findById!(organizationId, id);
        if (!contact) throw new Error('Contact not found');
        if (!contact.companyId) throw new Error('Contato sem empresa vinculada — não é possível enriquecer');

        const result = await enrichCompany(organizationId, contact.companyId, {});
        const updated = await this.repository.findById!(organizationId, id);

        return { contact: updated, fit: result.fit, enrichment: result };
    }
}
