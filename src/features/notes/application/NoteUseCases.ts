import type { NoteRepository } from '../domain/Note';
import type { z } from 'zod';
import { noteSchema } from '../../../lib/zod';

export class NoteUseCases {
  constructor(private noteRepository: NoteRepository) {}

  async createNote(organizationId: string, leadId: string, data: z.infer<typeof noteSchema>) {
    const validated = noteSchema.parse(data);
    return this.noteRepository.createWithTimeline(
      organizationId,
      leadId,
      validated.content,
      validated.author,
    );
  }

  async findNotesByLead(organizationId: string, leadId: string) {
    return this.noteRepository.findByLead(organizationId, leadId);
  }

  async deleteNote(organizationId: string, noteId: string) {
    return this.noteRepository.delete!(organizationId, noteId);
  }
}
