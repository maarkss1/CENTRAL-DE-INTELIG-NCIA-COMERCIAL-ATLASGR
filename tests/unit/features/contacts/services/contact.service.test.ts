import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contactService } from '@/features/contacts/services/contact.service';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    contact: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
  }
}));

describe('ContactService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockContact = {
    id: '1',
    name: 'John Doe',
    companyId: 'comp-1',
    status: 'Ativo'
  };

  it('should create a contact', async () => {
    const input = { name: 'John Doe', companyId: 'comp-1' };
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: '1', ...input, status: 'Ativo' } as never);
    const result = await contactService.create('test-org-id', input as any);
    expect(prisma.contact.create).toHaveBeenCalled();
    expect(result.id).toBe('1');
  });

  it('should update a contact', async () => {
    vi.mocked(prisma.contact.update).mockResolvedValue({ ...mockContact, name: 'Jane' } as never);
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(mockContact as never);
    const result = await contactService.update('test-org-id', '1', { name: 'Jane' });
    expect(prisma.contact.update).toHaveBeenCalled();
    expect(result.name).toBe('Jane');
  });

  it('should delete a contact', async () => {
    vi.mocked(prisma.contact.delete).mockResolvedValue(mockContact as never);
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(mockContact as never);
    await contactService.delete('test-org-id', '1');
    expect(prisma.contact.delete).toHaveBeenCalledWith({ where: { id: '1', organizationId: 'test-org-id' } });
  });
});
