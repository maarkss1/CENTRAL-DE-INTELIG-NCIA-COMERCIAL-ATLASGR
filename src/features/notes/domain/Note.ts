import type { Repository } from '../../../shared/domain/Repository';

export interface Note {
  id: string;
  content: string;
  author: string;
  leadId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteRepository extends Repository<Note> {
  findByLead(organizationId: string, leadId: string): Promise<Note[]>;
  createWithTimeline(
    organizationId: string,
    leadId: string,
    content: string,
    author: string,
  ): Promise<Note>;
  verifyLead(organizationId: string, leadId: string): Promise<boolean>;
}
