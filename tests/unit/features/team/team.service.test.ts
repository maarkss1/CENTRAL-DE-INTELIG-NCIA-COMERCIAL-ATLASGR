import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `team.service.ts` não tinha nenhum teste unitário antes do Piloto 024, apesar de concentrar a
 * lógica de negócio mais sensível do módulo (senha temporária, invalidação de sessão, bloqueio de
 * auto-exclusão). Cobre aqui especificamente os dois achados reais deste piloto: a trava contra
 * excluir o último ADMIN da organização (nova) e o desbloqueio de conta (`unlockTeamMember`, novo).
 */

const userFindFirst = vi.fn();
const userCount = vi.fn();
const userDelete = vi.fn();
const userUpdate = vi.fn();

vi.mock('../../../../src/lib/prisma.js', () => ({
    prisma: {
        user: {
            findFirst: (...a: unknown[]) => userFindFirst(...a),
            count: (...a: unknown[]) => userCount(...a),
            delete: (...a: unknown[]) => userDelete(...a),
            update: (...a: unknown[]) => userUpdate(...a),
        },
    },
}));

import { deleteTeamMember, unlockTeamMember, TeamServiceError } from '../../../../src/features/team/services/team.service';

const ORG = 'org-1';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('deleteTeamMember', () => {
    it('bloqueia excluir o único ADMIN da organização (achado real do Piloto 024)', async () => {
        userFindFirst.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
        userCount.mockResolvedValue(1);

        await expect(deleteTeamMember(ORG, 'admin-1', 'requester-1')).rejects.toThrow(
            /único ADMIN/,
        );
        expect(userDelete).not.toHaveBeenCalled();
    });

    it('permite excluir um ADMIN quando existe outro ADMIN na organização', async () => {
        userFindFirst.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
        userCount.mockResolvedValue(2);
        userDelete.mockResolvedValue({});

        await deleteTeamMember(ORG, 'admin-1', 'requester-1');
        expect(userDelete).toHaveBeenCalledWith({ where: { id: 'admin-1' } });
    });

    it('não conta ADMINs ao excluir um não-ADMIN (evita query desnecessária)', async () => {
        userFindFirst.mockResolvedValue({ id: 'sdr-1', role: 'SDR' });
        userDelete.mockResolvedValue({});

        await deleteTeamMember(ORG, 'sdr-1', 'requester-1');
        expect(userCount).not.toHaveBeenCalled();
        expect(userDelete).toHaveBeenCalledWith({ where: { id: 'sdr-1' } });
    });

    it('continua bloqueando auto-exclusão antes mesmo de checar o papel', async () => {
        await expect(deleteTeamMember(ORG, 'self-1', 'self-1')).rejects.toThrow(
            /própria conta/,
        );
        expect(userFindFirst).not.toHaveBeenCalled();
    });

    it('devolve 404 quando o usuário não pertence à organização', async () => {
        userFindFirst.mockResolvedValue(null);
        const err = await deleteTeamMember(ORG, 'outro-1', 'requester-1').catch((e) => e);
        expect(err).toBeInstanceOf(TeamServiceError);
        expect((err as TeamServiceError).statusCode).toBe(404);
    });
});

describe('unlockTeamMember', () => {
    it('zera lockedUntil e failedLoginAttempts', async () => {
        userFindFirst.mockResolvedValue({ id: 'user-1' });
        userUpdate.mockResolvedValue({ id: 'user-1', lockedUntil: null, failedLoginAttempts: 0 });

        await unlockTeamMember(ORG, 'user-1');

        expect(userUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'user-1' },
                data: { lockedUntil: null, failedLoginAttempts: 0 },
            }),
        );
    });

    it('404 quando o usuário não pertence à organização', async () => {
        userFindFirst.mockResolvedValue(null);
        await expect(unlockTeamMember(ORG, 'outro-1')).rejects.toThrow(/não encontrado/);
        expect(userUpdate).not.toHaveBeenCalled();
    });
});
