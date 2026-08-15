import { describe, it, expect, vi, beforeEach } from 'vitest';
import { activityService } from '@/features/activities/services/activity.service';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    activity: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    timelineEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)), automation: { findMany: vi.fn().mockResolvedValue([]) },
  }
}));

describe('ActivityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockActivity = {
    id: '1',
    type: 'Ligação' as const,
    owner: 'John',
    date: new Date('2024-01-01T10:00:00Z'),
    status: 'Pendente' as const,
    leadId: 'lead-1'
  };

  it('should find all activities without date, paginated', async () => {
    vi.mocked(prisma.activity.findMany).mockResolvedValue([mockActivity as never]);
    vi.mocked(prisma.activity.count).mockResolvedValue(1);
    const result = await activityService.findAll('test-org-id');
    expect(prisma.activity.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'test-org-id' },
      include: { lead: { include: { company: true, contact: true } } },
      orderBy: { date: 'asc' },
      skip: 0,
      take: 50
    });
    expect(result).toEqual({ data: [mockActivity], meta: { total: 1, page: 1, limit: 50, totalPages: 1 } });
  });

  it('should find all activities with date filter', async () => {
    vi.mocked(prisma.activity.findMany).mockResolvedValue([mockActivity as never]);
    vi.mocked(prisma.activity.count).mockResolvedValue(1);
    const dateStr = '2024-01-01T10:00:00Z';
    const result = await activityService.findAll('test-org-id', dateStr);
    expect(prisma.activity.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { date: expect.any(Object), organizationId: 'test-org-id' }
    }));
    expect(result.data).toEqual([mockActivity]);
  });

  it('should paginate activities with a custom page and limit', async () => {
    vi.mocked(prisma.activity.findMany).mockResolvedValue([mockActivity as never]);
    vi.mocked(prisma.activity.count).mockResolvedValue(120);
    const result = await activityService.findAll('test-org-id', undefined, 2, 20);
    expect(prisma.activity.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
    expect(result.meta).toEqual({ total: 120, page: 2, limit: 20, totalPages: 6 });
  });

  it('should filter activities by leadId, status and type', async () => {
    vi.mocked(prisma.activity.findMany).mockResolvedValue([mockActivity as never]);
    vi.mocked(prisma.activity.count).mockResolvedValue(1);
    await activityService.findAll('test-org-id', undefined, 1, 50, {
      leadId: 'lead-1',
      status: 'Pendente',
      type: 'Ligação',
    });
    expect(prisma.activity.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'test-org-id', leadId: 'lead-1' })
    }));
  });

  it('should create an activity and a timeline event', async () => {
    const input = { type: 'Ligação' as const, owner: 'John', date: '2024-01-01T10:00:00Z', leadId: 'lead-1', status: 'Pendente' as const };
    vi.mocked(prisma.activity.create).mockResolvedValue(mockActivity as never);
    const result = await activityService.create('test-org-id', input);
    expect(prisma.activity.create).toHaveBeenCalled();
    expect(prisma.timelineEvent.create).toHaveBeenCalled();
    expect(result).toEqual(mockActivity);
  });

  // Achado da auditoria de forecast/BI (Onda 7): ferramenta de IA em
  // src/features/intelligence/tools/opsTools.ts cria uma Activity para um vendedor humano
  // executar, mas atribuía 'Enxame de IA Atlas' como owner quando nenhum era informado — nome
  // fabricado mascarando ausência de responsável real. Este teste garante que a persistência
  // rejeita esse valor na origem, para esse chamador e qualquer outro futuro.
  it('should reject a fabricated placeholder owner instead of persisting it', async () => {
    const input = { type: 'Ligação' as const, owner: 'Enxame de IA Atlas', date: '2024-01-01T10:00:00Z', leadId: 'lead-1', status: 'Pendente' as const };
    await expect(activityService.create('test-org-id', input)).rejects.toThrow(/não é um responsável real/);
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });

  it('should reject a fabricated placeholder owner on update too', async () => {
    vi.mocked(prisma.activity.findFirst).mockResolvedValue(mockActivity as never);
    await expect(activityService.update('test-org-id', '1', { owner: 'Vendedor 1' })).rejects.toThrow(/não é um responsável real/);
    expect(prisma.activity.update).not.toHaveBeenCalled();
  });

  it('should update an activity', async () => {
    vi.mocked(prisma.activity.findFirst).mockResolvedValue(mockActivity as never);
    vi.mocked(prisma.activity.update).mockResolvedValue({ ...mockActivity, status: 'Concluída' } as never);
    
    const result = await activityService.update('test-org-id', '1', { status: 'Concluída' as const });
    expect(prisma.activity.update).toHaveBeenCalled();
    expect(prisma.timelineEvent.create).toHaveBeenCalled();
    expect(result.status).toBe('Concluída');
  });

  it('should throw error when updating non-existent activity', async () => {
    vi.mocked(prisma.activity.findFirst).mockResolvedValue(null);
    await expect(activityService.update('test-org-id', '1', { status: 'Concluída' as const })).rejects.toThrow('Activity not found');
  });

  it('should delete an activity', async () => {
    vi.mocked(prisma.activity.findFirst).mockResolvedValue(mockActivity as never);
    await activityService.delete('test-org-id', '1');
    expect(prisma.activity.delete).toHaveBeenCalledWith({ where: { id: '1', organizationId: 'test-org-id' } });
  });
});
