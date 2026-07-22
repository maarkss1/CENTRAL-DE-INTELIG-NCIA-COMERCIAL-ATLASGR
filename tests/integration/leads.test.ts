import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { LeadUseCases } from '../../src/features/crm/application/LeadUseCases';
import { PrismaLeadRepository } from '../../src/features/crm/infra/PrismaLeadRepository';
import { CompanyFactory, LeadFactory } from '../helpers/factories';

const leadUseCases = new LeadUseCases(new PrismaLeadRepository());

describe('LeadUseCases Integration', () => {
  beforeEach(async () => {
    await prisma.timelineEvent.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.company.deleteMany();
  });

  describe('create', () => {
    it('should create a new lead successfully and generate a timeline event', async () => {
      const companyData = CompanyFactory.build({ organizationId: 'test-org-id' });
      delete companyData.id;
      const company = await prisma.company.create({ data: companyData as any });

      const data = LeadFactory.build({ companyId: company.id, organizationId: 'test-org-id', status: 'Novo Lead' });
      delete (data as any).organizationId;

      const result = await leadUseCases.createLead('test-org-id', data as never);

      expect(result).toBeDefined();
      expect(result.companyId).toBe(company.id);

      const timelineEvents = await prisma.timelineEvent.findMany({ where: { leadId: result.id } });
      expect(timelineEvents.length).toBeGreaterThan(0);
      expect(timelineEvents[timelineEvents.length - 1].type).toBe('creation');
    });
  });
});
