import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cobertura da implementação real (Prisma/Postgres) de `AutomationVersionStore` — sem banco real,
 * `prisma.automationVersion` é mockado (mesmo padrão de
 * `src/features/prospecting/services/__tests__/providerBudget.test.ts`). `automation-versioning.service.test.ts`
 * já cobre o CONTRATO de domínio via `InMemoryAutomationVersionStore`; este arquivo cobre
 * especificamente a tradução label↔chave-de-enum-Prisma (`toPrismaAutomationTrigger`/
 * `fromPrismaAutomationTrigger`/`toPrismaAutomationAction`/`fromPrismaAutomationAction`, via
 * `src/lib/enumMap.ts`) e o mapeamento de linha crua do Postgres para `AutomationVersionRecord`
 * (`toRecord`, incluindo a normalização de `changeReason` para só `'update'`/`'delete'`).
 */

const createMock = vi.fn();
const findManyMock = vi.fn();
vi.mock('../../../../lib/prisma.js', () => ({
  prisma: {
    automationVersion: {
      create: (...args: unknown[]) => createMock(...args),
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

import { PrismaAutomationVersionStore } from '../PrismaAutomationVersionStore.js';

describe('PrismaAutomationVersionStore', () => {
  beforeEach(() => {
    createMock.mockReset();
    findManyMock.mockReset();
  });

  describe('record', () => {
    it('converte os labels de trigger/action para a chave do enum Prisma antes de gravar', async () => {
      createMock.mockResolvedValue(undefined);
      const store = new PrismaAutomationVersionStore();

      await store.record({
        automationId: 'auto-1',
        organizationId: 'org-1',
        name: 'Notificar time de vendas',
        enabled: true,
        trigger: 'Lead criado',
        conditions: { status: 'novo' },
        action: 'Ligar via SDR de Voz',
        actionConfig: { dueInDays: 1 },
        editedByUserId: 'user-1',
        editedByEmail: 'user@atlasgr.com.br',
        changeReason: 'update',
      });

      expect(createMock).toHaveBeenCalledTimes(1);
      const { data } = createMock.mock.calls[0][0];
      expect(data.automationId).toBe('auto-1');
      expect(data.organizationId).toBe('org-1');
      expect(data.trigger).not.toBe('Lead criado');
      expect(data.action).not.toBe('Ligar via SDR de Voz');
      expect(data.conditions).toEqual({ status: 'novo' });
      expect(data.changeReason).toBe('update');
    });

    it('grava conditions como undefined quando o snapshot não tem condições', async () => {
      createMock.mockResolvedValue(undefined);
      const store = new PrismaAutomationVersionStore();

      await store.record({
        automationId: 'auto-2',
        organizationId: 'org-1',
        name: 'Regra sem condição',
        enabled: false,
        trigger: 'Atividade concluída',
        conditions: null,
        action: 'Notificar equipe',
        actionConfig: {},
        editedByUserId: null,
        editedByEmail: null,
        changeReason: 'delete',
      });

      const { data } = createMock.mock.calls[0][0];
      expect(data.conditions).toBeUndefined();
      expect(data.editedByUserId).toBeNull();
      expect(data.changeReason).toBe('delete');
    });
  });

  describe('listByAutomation', () => {
    const baseRow = {
      id: 'ver-1',
      automationId: 'auto-1',
      organizationId: 'org-1',
      name: 'Notificar time de vendas',
      enabled: true,
      conditions: { status: 'novo' },
      actionConfig: { dueInDays: 1 },
      editedByUserId: 'user-1',
      editedByEmail: 'user@atlasgr.com.br',
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
    };

    it('converte cada linha de volta para o label legível e normaliza changeReason inválido para "update"', async () => {
      findManyMock.mockResolvedValue([
        { ...baseRow, trigger: 'Lead_Criado', action: 'Ligar_SDR_Voz', changeReason: 'delete' },
        {
          ...baseRow,
          id: 'ver-2',
          trigger: 'Lead_Criado',
          action: 'Notificar_Equipe',
          changeReason: 'algo-inesperado',
        },
      ]);
      const store = new PrismaAutomationVersionStore();

      const result = await store.listByAutomation('org-1', 'auto-1');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', automationId: 'auto-1' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      expect(result).toHaveLength(2);
      expect(result[0].trigger).toBe('Lead criado');
      expect(result[0].action).toBe('Ligar via SDR de Voz');
      expect(result[0].changeReason).toBe('delete');
      // changeReason cru fora de 'update'/'delete' nunca deve vazar para o domínio.
      expect(result[1].changeReason).toBe('update');
    });

    it('respeita um limit explícito', async () => {
      findManyMock.mockResolvedValue([]);
      const store = new PrismaAutomationVersionStore();

      await store.listByAutomation('org-1', 'auto-1', 5);

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });
  });
});
