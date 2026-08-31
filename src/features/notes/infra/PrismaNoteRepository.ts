import type { Note, NoteRepository } from '../domain/Note';
import { prisma } from '../../../lib/prisma';

export class PrismaNoteRepository implements NoteRepository {
  async verifyLead(organizationId: string, leadId: string): Promise<boolean> {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
    return !!lead;
  }

  async findByLead(organizationId: string, leadId: string): Promise<Note[]> {
    const isValid = await this.verifyLead(organizationId, leadId);
    if (!isValid) throw new Error('Lead not found');

    return prisma.note.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWithTimeline(
    organizationId: string,
    leadId: string,
    content: string,
    author: string,
  ): Promise<Note> {
    const isValid = await this.verifyLead(organizationId, leadId);
    if (!isValid) throw new Error('Lead not found');

    const [note] = await prisma.$transaction([
      prisma.note.create({
        data: {
          content,
          author,
          leadId,
        },
      }),
      prisma.timelineEvent.create({
        data: {
          type: 'comment',
          description: `Nova nota adicionada por ${author}`,
          leadId,
        },
      }),
    ]);

    return note;
  }

  async delete(organizationId: string, noteId: string): Promise<Note> {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: { lead: { select: { organizationId: true } } },
    });

    if (!note || note.lead.organizationId !== organizationId) {
      throw new Error('Note not found');
    }

    return prisma.note.delete({ where: { id: noteId } });
  }
}
