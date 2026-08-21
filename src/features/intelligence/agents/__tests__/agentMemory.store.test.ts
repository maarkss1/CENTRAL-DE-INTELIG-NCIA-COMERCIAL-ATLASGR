import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/prisma.js', () => ({
    prisma: {
        agentMemory: {
            upsert: vi.fn(),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
            create: vi.fn(),
        },
    },
}));

import { prisma } from '../../../../lib/prisma.js';
import { saveAgentMemory, recordAgentFailure, loadAgentMemory } from '../agentMemory.store.js';

const agentMemory = prisma.agentMemory as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('agentMemory.store', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('saveAgentMemory', () => {
        it('usa upsert atômico sobre a chave composta quando organizationId está presente', async () => {
            await saveAgentMemory({
                sessionId: 's1',
                agentType: 'SDR',
                organizationId: 'org-1',
                messages: [{ role: 'user', content: 'oi' }],
            });

            expect(agentMemory.upsert).toHaveBeenCalledWith(expect.objectContaining({
                where: { sessionId_agentType_organizationId: { sessionId: 's1', agentType: 'SDR', organizationId: 'org-1' } },
                create: expect.objectContaining({ sessionId: 's1', agentType: 'SDR', organizationId: 'org-1', status: 'Completed', errorMessage: null }),
                update: expect.objectContaining({ status: 'Completed', errorMessage: null }),
            }));
            expect(agentMemory.findFirst).not.toHaveBeenCalled();
        });

        it('status padrão é Completed quando não especificado', async () => {
            await saveAgentMemory({ sessionId: 's1', agentType: 'SDR', organizationId: 'org-1', messages: [] });
            const call = agentMemory.upsert.mock.calls[0][0];
            expect(call.create.status).toBe('Completed');
        });

        it('propaga status Failed e errorMessage quando informados', async () => {
            await saveAgentMemory({
                sessionId: 's1',
                agentType: 'SDR',
                organizationId: 'org-1',
                messages: [],
                status: 'Failed',
                errorMessage: 'algo deu errado',
            });
            const call = agentMemory.upsert.mock.calls[0][0];
            expect(call.create.status).toBe('Failed');
            expect(call.create.errorMessage).toBe('algo deu errado');
        });

        it('trunca errorMessage acima de 500 caracteres', async () => {
            const longMessage = 'a'.repeat(600);
            await saveAgentMemory({
                sessionId: 's1',
                agentType: 'SDR',
                organizationId: 'org-1',
                messages: [],
                status: 'Failed',
                errorMessage: longMessage,
            });
            const call = agentMemory.upsert.mock.calls[0][0];
            expect(call.create.errorMessage.length).toBe(501); // 500 chars + reticências
            expect(call.create.errorMessage.endsWith('…')).toBe(true);
        });

        it('sem organizationId (null/undefined), cai para findFirst+create/update em vez do upsert', async () => {
            agentMemory.findFirst.mockResolvedValueOnce(null);

            await saveAgentMemory({ sessionId: 's1', agentType: 'SDR', organizationId: undefined, messages: [] });

            expect(agentMemory.upsert).not.toHaveBeenCalled();
            expect(agentMemory.findFirst).toHaveBeenCalledWith({
                where: { sessionId: 's1', agentType: 'SDR', organizationId: null },
            });
            expect(agentMemory.create).toHaveBeenCalledOnce();
            expect(agentMemory.update).not.toHaveBeenCalled();
        });

        it('sem organizationId, atualiza a linha existente em vez de criar outra', async () => {
            agentMemory.findFirst.mockResolvedValueOnce({ id: 'existing-id' });

            await saveAgentMemory({ sessionId: 's1', agentType: 'SDR', organizationId: null, messages: [] });

            expect(agentMemory.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'existing-id' } }));
            expect(agentMemory.create).not.toHaveBeenCalled();
        });

        it('propaga o erro do Prisma em vez de engolir (comportamento honesto)', async () => {
            agentMemory.upsert.mockRejectedValueOnce(new Error('conexão perdida'));

            await expect(
                saveAgentMemory({ sessionId: 's1', agentType: 'SDR', organizationId: 'org-1', messages: [] }),
            ).rejects.toThrow('conexão perdida');
        });
    });

    describe('recordAgentFailure', () => {
        it('grava status Failed via saveAgentMemory', async () => {
            await recordAgentFailure({ sessionId: 's1', agentType: 'SDR', organizationId: 'org-1', errorMessage: 'bloqueado por LGPD' });

            const call = agentMemory.upsert.mock.calls[0][0];
            expect(call.create.status).toBe('Failed');
            expect(call.create.errorMessage).toBe('bloqueado por LGPD');
        });

        it('nunca lança, mesmo se a escrita subjacente falhar', async () => {
            agentMemory.upsert.mockRejectedValueOnce(new Error('Postgres indisponível'));

            await expect(
                recordAgentFailure({ sessionId: 's1', agentType: 'SDR', organizationId: 'org-1', errorMessage: 'erro original' }),
            ).resolves.toBeUndefined();
        });
    });

    describe('loadAgentMemory', () => {
        it('usa findUnique pela chave composta quando organizationId está presente', async () => {
            await loadAgentMemory({ sessionId: 's1', agentType: 'SDR', organizationId: 'org-1' });

            expect(agentMemory.findUnique).toHaveBeenCalledWith({
                where: { sessionId_agentType_organizationId: { sessionId: 's1', agentType: 'SDR', organizationId: 'org-1' } },
            });
        });

        it('sem organizationId, usa findFirst ordenado pela mais recente', async () => {
            await loadAgentMemory({ sessionId: 's1', agentType: 'SDR', organizationId: undefined });

            expect(agentMemory.findFirst).toHaveBeenCalledWith({
                where: { sessionId: 's1', agentType: 'SDR', organizationId: null },
                orderBy: { createdAt: 'desc' },
            });
        });
    });
});
