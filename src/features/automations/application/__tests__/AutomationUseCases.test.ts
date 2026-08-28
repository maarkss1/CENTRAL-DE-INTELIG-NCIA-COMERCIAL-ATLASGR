import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Automation, AutomationRepository } from '../../domain/Automation';

/**
 * `AutomationUseCases` nunca tinha teste unitário próprio (as rotas de automação são cobertas
 * indiretamente por `tests/unit/features/automations-ui.test.tsx` e pelos testes de
 * `automation.engine.ts`/`automation-dry-run.service.ts`, mas não este arquivo). Cobre aqui o
 * contrato de tenant (`null`/`false` quando o id não pertence à organização) e a integração com
 * `automationVersioningService`/`dryRunAutomation`, ambos mockados — sem repositório real.
 */

const recordPriorStateMock = vi.fn();
const buildTimelineMock = vi.fn();
vi.mock('../../automation-versioning.service.js', () => ({
  automationVersioningService: {
    recordPriorState: (...args: unknown[]) => recordPriorStateMock(...args),
    buildTimeline: (...args: unknown[]) => buildTimelineMock(...args),
  },
}));

const dryRunAutomationMock = vi.fn();
vi.mock('../../automation-dry-run.service.js', () => ({
  dryRunAutomation: (...args: unknown[]) => dryRunAutomationMock(...args),
}));

import { AutomationUseCases } from '../AutomationUseCases.js';

function buildAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'auto-1',
    name: 'Notificar time de vendas',
    enabled: true,
    trigger: 'Lead criado',
    conditions: null,
    action: 'Notificar equipe',
    actionConfig: {},
    lastRunAt: null,
    runCount: 0,
    organizationId: 'org-1',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AutomationUseCases', () => {
  let repository: {
    findById: ReturnType<typeof vi.fn>;
    findAllWithFilters: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let useCases: AutomationUseCases;

  beforeEach(() => {
    recordPriorStateMock.mockReset();
    buildTimelineMock.mockReset();
    dryRunAutomationMock.mockReset();
    repository = {
      findById: vi.fn(),
      findAllWithFilters: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    useCases = new AutomationUseCases(repository as unknown as AutomationRepository);
  });

  it('listAutomations delega para findAllWithFilters e devolve só data', async () => {
    repository.findAllWithFilters.mockResolvedValue({
      data: [buildAutomation()],
      meta: { total: 1 },
    });

    const result = await useCases.listAutomations('org-1');

    expect(result).toEqual([buildAutomation()]);
    expect(repository.findAllWithFilters).toHaveBeenCalledWith('org-1', undefined, 1, 50);
  });

  it('createAutomation valida o input com o schema antes de criar', async () => {
    repository.create.mockResolvedValue(buildAutomation());

    await useCases.createAutomation('org-1', {
      name: 'Nova regra',
      trigger: 'Lead criado',
      action: 'Notificar equipe',
      actionConfig: {},
    });

    expect(repository.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ name: 'Nova regra' }),
    );
  });

  it('createAutomation rejeita nome vazio', async () => {
    await expect(
      useCases.createAutomation('org-1', {
        name: '',
        trigger: 'Lead criado',
        action: 'Notificar equipe',
        actionConfig: {},
      }),
    ).rejects.toThrow();
    expect(repository.create).not.toHaveBeenCalled();
  });

  describe('updateAutomation', () => {
    it('devolve null quando o id não pertence à organização', async () => {
      repository.findById.mockResolvedValue(null);

      const result = await useCases.updateAutomation('org-1', 'auto-x', { enabled: false });

      expect(result).toBeNull();
      expect(recordPriorStateMock).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('registra o estado anterior como versão histórica antes de atualizar', async () => {
      const existing = buildAutomation();
      repository.findById.mockResolvedValue(existing);
      repository.update.mockResolvedValue({ ...existing, enabled: false });

      await useCases.updateAutomation(
        'org-1',
        'auto-1',
        { enabled: false },
        { userId: 'user-1', email: 'user@atlasgr.com.br' },
      );

      expect(recordPriorStateMock).toHaveBeenCalledWith(
        'org-1',
        'auto-1',
        existing,
        { userId: 'user-1', email: 'user@atlasgr.com.br' },
        'update',
      );
      expect(repository.update).toHaveBeenCalledWith('org-1', 'auto-1', { enabled: false });
    });

    it('usa um actor anônimo quando nenhum ator é informado', async () => {
      const existing = buildAutomation();
      repository.findById.mockResolvedValue(existing);
      repository.update.mockResolvedValue(existing);

      await useCases.updateAutomation('org-1', 'auto-1', { enabled: false });

      expect(recordPriorStateMock).toHaveBeenCalledWith(
        'org-1',
        'auto-1',
        existing,
        { userId: null, email: null },
        'update',
      );
    });
  });

  describe('removeAutomation', () => {
    it('devolve false quando o id não pertence à organização', async () => {
      repository.findById.mockResolvedValue(null);

      const result = await useCases.removeAutomation('org-1', 'auto-x');

      expect(result).toBe(false);
      expect(recordPriorStateMock).not.toHaveBeenCalled();
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('registra o estado final como versão histórica (delete) antes de remover', async () => {
      const existing = buildAutomation();
      repository.findById.mockResolvedValue(existing);

      const result = await useCases.removeAutomation('org-1', 'auto-1');

      expect(result).toBe(true);
      expect(recordPriorStateMock).toHaveBeenCalledWith(
        'org-1',
        'auto-1',
        existing,
        { userId: null, email: null },
        'delete',
      );
      expect(repository.delete).toHaveBeenCalledWith('org-1', 'auto-1');
    });
  });

  describe('listVersions', () => {
    it('devolve null quando o id não pertence à organização', async () => {
      repository.findById.mockResolvedValue(null);

      const result = await useCases.listVersions('org-1', 'auto-x');

      expect(result).toBeNull();
      expect(buildTimelineMock).not.toHaveBeenCalled();
    });

    it('delega para automationVersioningService.buildTimeline', async () => {
      const existing = buildAutomation();
      repository.findById.mockResolvedValue(existing);
      const timeline = {
        automationId: 'auto-1',
        current: existing,
        currentUpdatedAt: existing.updatedAt.toISOString(),
        history: [],
      };
      buildTimelineMock.mockResolvedValue(timeline);

      const result = await useCases.listVersions('org-1', 'auto-1');

      expect(result).toBe(timeline);
      expect(buildTimelineMock).toHaveBeenCalledWith('org-1', existing);
    });
  });

  describe('dryRun', () => {
    it('devolve null quando o id não pertence à organização', async () => {
      repository.findById.mockResolvedValue(null);

      const result = await useCases.dryRun('org-1', 'auto-x');

      expect(result).toBeNull();
      expect(dryRunAutomationMock).not.toHaveBeenCalled();
    });

    it('delega para dryRunAutomation com as options recebidas', async () => {
      const existing = buildAutomation();
      repository.findById.mockResolvedValue(existing);
      dryRunAutomationMock.mockResolvedValue({ automationId: 'auto-1', sampleSize: 0 });

      const result = await useCases.dryRun('org-1', 'auto-1', { limit: 10 });

      expect(result).toEqual({ automationId: 'auto-1', sampleSize: 0 });
      expect(dryRunAutomationMock).toHaveBeenCalledWith('org-1', existing, { limit: 10 });
    });
  });
});
