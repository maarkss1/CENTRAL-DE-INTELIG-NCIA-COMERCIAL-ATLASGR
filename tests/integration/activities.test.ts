import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { activityService } from '../../src/features/activities/services/activity.service';
import { LeadFactory, ActivityFactory, CompanyFactory } from '../helpers/factories';

describe('ActivityService Integration', () => {
  beforeEach(async () => {
    await prisma.timelineEvent.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.company.deleteMany();
  });

  describe('create', () => {
    it('should create a new activity and generate a timeline event', async () => {
      const companyData = CompanyFactory.build({ organizationId: 'test-org-id' });
      delete companyData.id;
      const company = await prisma.company.create({ data: companyData as any });

      const leadData = LeadFactory.build({ companyId: company.id, organizationId: 'test-org-id', status: 'Lead Recebido' });
      const lead = await prisma.lead.create({ data: leadData as never });
      
      const data = ActivityFactory.build({ leadId: lead.id, date: new Date().toISOString() as never });
      delete (data as any).lead;
      delete (data as any).organizationId;
      data.status = 'Pendente';
      data.type = 'Ligação';

      const result = await activityService.create('test-org-id', data as any);
      expect(result.leadId).toBe(lead.id);

      // Verify that activity is properly written
      const activities = await prisma.activity.findMany({ where: { leadId: lead.id } });
      expect(activities.length).toBeGreaterThan(0);

      const timelineEvents = await prisma.timelineEvent.findMany({ where: { leadId: lead.id, type: 'activity' } });
      expect(timelineEvents.length).toBeGreaterThan(0);
    });
  });
});
