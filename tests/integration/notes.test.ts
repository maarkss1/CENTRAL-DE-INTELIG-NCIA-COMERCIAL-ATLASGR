import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { LeadFactory, NoteFactory, CompanyFactory } from '../helpers/factories';

describe('Note Operations Integration', () => {
  beforeEach(async () => {
    await prisma.timelineEvent.deleteMany();
    await prisma.note.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.company.deleteMany();
  });

  it('should create a note and associate it with a lead', async () => {
    const company = await prisma.company.create({ data: CompanyFactory.build({ organizationId: 'test-org-id' }) });
    const leadData = LeadFactory.build({ companyId: company.id, organizationId: 'test-org-id', status: 'Lead_Recebido' });
    const lead = await prisma.lead.create({ data: leadData as never });
    
    const noteData = NoteFactory.build({ leadId: lead.id });
    delete (noteData as any).lead;
    delete (noteData as any).organizationId;

    const note = await prisma.note.create({
      data: noteData as never
    });

    expect(note.leadId).toBe(lead.id);
  });
});
