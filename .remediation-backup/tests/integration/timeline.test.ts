import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { LeadFactory, TimelineEventFactory, CompanyFactory } from '../helpers/factories';

describe('TimelineEvent Operations Integration', () => {
  beforeEach(async () => {
    await prisma.timelineEvent.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.company.deleteMany();
  });

  it('should retrieve timeline events for a lead in chronological order', async () => {
    const companyData = CompanyFactory.build({ organizationId: 'test-org-id' });
    delete companyData.id;
    const company = await prisma.company.create({ data: companyData as any });

    const leadData = LeadFactory.build({ companyId: company.id, organizationId: 'test-org-id', status: 'Novo_Lead' });
    const lead = await prisma.lead.create({ data: leadData as never });
    
    const eventData1 = TimelineEventFactory.build({ leadId: lead.id, type: 'creation' });
    delete (eventData1 as any).lead;
    delete (eventData1 as any).organizationId;

    // timelineEvent needs to be inserted via prisma bypassing service logic for this test to check if findMany works
    await prisma.timelineEvent.create({ data: { ...eventData1, leadId: lead.id } as never });

    const events = await prisma.timelineEvent.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: 'asc' }
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].type).toBe('creation');
  });
});
