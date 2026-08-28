import { describe, it, expect, vi } from 'vitest';
import { AuditService } from '../audit.service';
import { prisma } from '../../prisma';

vi.mock('../../prisma', () => ({
  prisma: {
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'test-log-id' }),
    },
  },
}));

describe('AuditService', () => {
  it('should call prisma.auditLog.create with correct data', async () => {
    const spy = vi.spyOn(prisma.auditLog, 'create');

    await AuditService.log({
      action: 'LOGIN',
      entity: 'User',
      actorId: 'user-1',
      ipAddress: '127.0.0.1',
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'LOGIN',
          entity: 'User',
          actorId: 'user-1',
          ipAddress: '127.0.0.1',
        }),
      }),
    );
  });
});
