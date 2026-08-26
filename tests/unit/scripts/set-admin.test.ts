/**
 * ITEM-03 (remediação de dívida técnica) — cobre scripts/set-admin.core.ts. A versão anterior
 * promovia TODOS os usuários a ADMIN sem argumento, confirmação ou auditoria
 * (`prisma.user.updateMany({ data: { role: 'ADMIN' } })` sem `where`); estes testes travam o
 * comportamento corrigido: alvo explícito obrigatório, um único usuário por execução, auditoria
 * sem segredo.
 */
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/lib/prisma.js', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from '../../../src/lib/prisma.js';
import { setAdmin, SetAdminUsageError } from '../../../scripts/set-admin.core.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
  delete process.env.SET_ADMIN_ACTOR;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('setAdmin', () => {
  it('recusa rodar sem argumento — não promove ninguém (antes promovia TODOS)', async () => {
    await expect(setAdmin([])).rejects.toBeInstanceOf(SetAdminUsageError);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('usuário ausente: não atualiza nada e audita "no_user_found"', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await setAdmin(['naoexiste@atlasgr.com.br']);

    expect(result.usersUpdated).toBe(0);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    const audited = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(audited.event).toBe('set_admin');
    expect(audited.result).toBe('no_user_found');
  });

  it('usuário existente: promove só esse usuário a ADMIN e audita quem/quando/resultado', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'SDR' } as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    process.env.SET_ADMIN_ACTOR = 'gestor-comercial';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await setAdmin(['closer@atlasgr.com.br']);

    expect(result.usersUpdated).toBe(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { role: 'ADMIN' },
    });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();

    const audited = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(audited.event).toBe('set_admin');
    expect(audited.actor).toBe('gestor-comercial');
    expect(audited.result).toBe('promoted');
    expect(audited.previousRole).toBe('SDR');
  });
});
