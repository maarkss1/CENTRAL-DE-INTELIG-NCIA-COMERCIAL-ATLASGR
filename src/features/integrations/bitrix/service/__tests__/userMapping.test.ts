import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
    user: { findFirst: vi.fn() },
};
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('resolveOwnBitrixUserId', () => {
    it('casa por e-mail, case-insensitive', async () => {
        const { resolveOwnBitrixUserId } = await import('../userMapping.js');
        const users = [
            { id: '1', name: 'Ana', email: 'ana@atlasgr.com.br' },
            { id: '2', name: 'Bruno', email: 'bruno@atlasgr.com.br' },
        ];
        expect(resolveOwnBitrixUserId(users, 'ANA@atlasgr.com.br')).toBe('1');
    });

    it('sem correspondência, devolve null — nunca fabrica um vínculo', async () => {
        const { resolveOwnBitrixUserId } = await import('../userMapping.js');
        const users = [{ id: '1', name: 'Ana', email: 'ana@atlasgr.com.br' }];
        expect(resolveOwnBitrixUserId(users, 'carla@atlasgr.com.br')).toBeNull();
    });

    it('usuário do Bitrix sem e-mail (escopo "user" ausente) nunca bate com nada', async () => {
        const { resolveOwnBitrixUserId } = await import('../userMapping.js');
        const users = [{ id: '1', name: 'Ana', email: null }];
        expect(resolveOwnBitrixUserId(users, 'ana@atlasgr.com.br')).toBeNull();
    });
});

describe('resolveAtlasUserNameByEmail', () => {
    it('e-mail nulo devolve null sem consultar o banco', async () => {
        const { resolveAtlasUserNameByEmail } = await import('../userMapping.js');
        const result = await resolveAtlasUserNameByEmail('org-1', null);
        expect(result).toBeNull();
        expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    });

    it('usuário Atlas encontrado pelo e-mail devolve o nome', async () => {
        prismaMock.user.findFirst.mockResolvedValue({ name: 'Ana Souza' });
        const { resolveAtlasUserNameByEmail } = await import('../userMapping.js');
        const result = await resolveAtlasUserNameByEmail('org-1', 'ana@atlasgr.com.br');
        expect(result).toBe('Ana Souza');
    });

    it('sem usuário Atlas com esse e-mail, devolve null (não fabrica nome)', async () => {
        prismaMock.user.findFirst.mockResolvedValue(null);
        const { resolveAtlasUserNameByEmail } = await import('../userMapping.js');
        const result = await resolveAtlasUserNameByEmail('org-1', 'desconhecido@bitrix.com');
        expect(result).toBeNull();
    });
});
