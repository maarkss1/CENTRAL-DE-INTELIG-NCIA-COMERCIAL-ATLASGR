/**
 * ITEM-03 (remediação de dívida técnica) — cobre scripts/reset-passwords.core.ts: conta
 * existente, conta ausente, reset individual e a barreira de dois fatores em `--all`. O Prisma é
 * mockado (mesmo padrão de tests/unit/features/usage-service.test.ts) porque este é um teste
 * unitário do CONTRATO do script (validação de argumento, geração/uso de senha, nunca imprimir a
 * senha, trilha de auditoria) — não um teste de integração contra Postgres real, que já existe
 * para o fluxo de troca de senha autenticado em tests/integration/sec006-session-revocation.test.ts.
 */
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/lib/prisma.js', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from '../../../src/lib/prisma.js';
import {
  resetPasswords,
  ResetPasswordsUsageError,
  ALL_CONFIRMATION_FLAG,
} from '../../../scripts/reset-passwords.core.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const ENV_KEYS = ['RESET_PASSWORD_VALUE', 'RESET_PASSWORDS_ACTOR', 'RESET_PASSWORDS_ALLOW_ALL'] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  mockReset(prismaMock);
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.restoreAllMocks();
});

describe('resetPasswords', () => {
  it('recusa rodar sem nenhum argumento (não altera nada)', async () => {
    await expect(resetPasswords([])).rejects.toBeInstanceOf(ResetPasswordsUsageError);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it('conta ausente: não atualiza nada e reporta usersFound 0', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await resetPasswords(['naoexiste@atlasgr.com.br']);

    expect(result.usersFound).toBe(0);
    expect(result.usersUpdated).toBe(0);
    expect(prismaMock.account.update).not.toHaveBeenCalled();
    expect(prismaMock.account.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();

    // Auditoria registrada, mesmo em "não encontrado".
    expect(logSpy).toHaveBeenCalled();
    const audited = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(audited.event).toBe('reset_passwords');
    expect(audited.result).toBe('no_user_found');
  });

  it('conta existente: reseta a credencial, marca mustChangePassword e nunca imprime a senha', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'user-1', email: 'existente@atlasgr.com.br' } as never,
    ]);
    prismaMock.account.findFirst.mockResolvedValue({ id: 'account-1' } as never);
    prismaMock.account.update.mockResolvedValue({} as never);
    prismaMock.user.update.mockResolvedValue({} as never);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.RESET_PASSWORD_VALUE = 'UmaSenhaForteDeTeste123!';

    const result = await resetPasswords(['existente@atlasgr.com.br']);

    expect(result.scope).toBe('single');
    expect(result.usersUpdated).toBe(1);
    expect(result.passwordSource).toBe('env');
    expect(prismaMock.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'account-1' } }),
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: { mustChangePassword: true } }),
    );

    // Critério de aceite: a senha (nem em texto puro nem qualquer valor derivado óbvio) nunca
    // aparece em stdout/stderr.
    for (const call of logSpy.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain('UmaSenhaForteDeTeste123!');
    }
  });

  it('gera uma senha aleatória forte quando nenhuma é fornecida (nunca a senha fixa antiga "00000000")', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'user-2', email: 'sem-senha-explicita@atlasgr.com.br' } as never,
    ]);
    prismaMock.account.findFirst.mockResolvedValue(null);
    prismaMock.account.create.mockResolvedValue({} as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await resetPasswords(['sem-senha-explicita@atlasgr.com.br']);

    expect(result.passwordSource).toBe('generated');
    expect(prismaMock.account.create).toHaveBeenCalledTimes(1);
    const createdPasswordHash = prismaMock.account.create.mock.calls[0][0].data.password as string;
    // O hash não pode corresponder ao hash da antiga senha fixa previsível.
    expect(createdPasswordHash).not.toBe('00000000');
  });

  it('rejeita RESET_PASSWORD_VALUE curta demais', async () => {
    process.env.RESET_PASSWORD_VALUE = 'curta';
    await expect(resetPasswords(['alguem@atlasgr.com.br'])).rejects.toBeInstanceOf(
      ResetPasswordsUsageError,
    );
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  describe('--all (operação massiva)', () => {
    it('recusa --all sem a flag de confirmação', async () => {
      await expect(resetPasswords(['--all'])).rejects.toBeInstanceOf(ResetPasswordsUsageError);
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('recusa --all com a flag mas sem a variável de ambiente de confirmação', async () => {
      await expect(
        resetPasswords(['--all', ALL_CONFIRMATION_FLAG]),
      ).rejects.toBeInstanceOf(ResetPasswordsUsageError);
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('recusa --all com a variável de ambiente mas sem a flag', async () => {
      process.env.RESET_PASSWORDS_ALLOW_ALL = '1';
      await expect(resetPasswords(['--all'])).rejects.toBeInstanceOf(ResetPasswordsUsageError);
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('com os dois fatores de confirmação presentes, reseta todos os usuários e audita o escopo "all"', async () => {
      process.env.RESET_PASSWORDS_ALLOW_ALL = '1';
      process.env.RESET_PASSWORDS_ACTOR = 'sre-oncall';
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'user-a', email: 'a@atlasgr.com.br' } as never,
        { id: 'user-b', email: 'b@atlasgr.com.br' } as never,
      ]);
      prismaMock.account.findFirst.mockResolvedValue(null);
      prismaMock.account.create.mockResolvedValue({} as never);
      prismaMock.user.update.mockResolvedValue({} as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await resetPasswords(['--all', ALL_CONFIRMATION_FLAG]);

      expect(result.scope).toBe('all');
      expect(result.usersUpdated).toBe(2);
      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );

      const audited = JSON.parse(logSpy.mock.calls.at(-1)![0] as string);
      expect(audited.event).toBe('reset_passwords');
      expect(audited.scope).toBe('all');
      expect(audited.actor).toBe('sre-oncall');
      expect(audited.usersUpdated).toBe(2);
      // Nunca a senha/hash na auditoria.
      expect(Object.keys(audited)).not.toContain('password');
      expect(Object.keys(audited)).not.toContain('passwordHash');
    });
  });
});
