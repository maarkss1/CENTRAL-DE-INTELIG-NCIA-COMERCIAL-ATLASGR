import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        lead: { findFirst: vi.fn() },
        user: { findUnique: vi.fn() },
    },
}));

import { prisma } from '@/lib/prisma';
import { requireLeadOwnership } from '@/shared/middlewares/requireLeadOwnership';

type Mocked<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };
const lead = prisma.lead as unknown as Mocked<typeof prisma.lead>;
const user = prisma.user as unknown as Mocked<typeof prisma.user>;

function buildReqRes(role: string, userId: string, leadId = 'lead-1') {
    const req: any = { params: { id: leadId }, user: { role, id: userId, organizationId: 'org-1' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    return { req, res, next };
}

describe('requireLeadOwnership', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('GESTOR/ADMIN passam direto, sem consultar o lead', async () => {
        const { req, res, next } = buildReqRes('GESTOR', 'user-1');
        await requireLeadOwnership()(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(lead.findFirst).not.toHaveBeenCalled();
    });

    it('CLOSER dono por id: passa (mesma checagem que SDR — regressão: `role !== \'VENDEDOR\'` deixava de aplicar a checagem para qualquer papel real após a migração de UserRole)', async () => {
        lead.findFirst.mockResolvedValue({ owner: 'user-1' });
        const { req, res, next } = buildReqRes('CLOSER', 'user-1');

        await requireLeadOwnership()(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it('CLOSER não dono: 403 — sem isto, CLOSER podia editar qualquer lead da organização', async () => {
        lead.findFirst.mockResolvedValue({ owner: 'user-2' });
        user.findUnique.mockResolvedValue({ name: 'Fulano da Silva' });
        const { req, res, next } = buildReqRes('CLOSER', 'user-1');

        await requireLeadOwnership()(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('SDR dono por id (fluxo normal, LeadUseCases.createLead): passa', async () => {
        lead.findFirst.mockResolvedValue({ owner: 'user-1' });
        const { req, res, next } = buildReqRes('SDR', 'user-1');

        await requireLeadOwnership()(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('SDR dono por nome (lead importado do Bitrix, owner = User.name): passa via fallback', async () => {
        lead.findFirst.mockResolvedValue({ owner: 'Fulano da Silva' });
        user.findUnique.mockResolvedValue({ name: 'Fulano da Silva' });
        const { req, res, next } = buildReqRes('SDR', 'user-1');

        await requireLeadOwnership()(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' }, select: { name: true } });
    });

    it('SDR não dono (nem por id, nem por nome): 403, sem mascarar como sucesso', async () => {
        lead.findFirst.mockResolvedValue({ owner: 'user-2' });
        user.findUnique.mockResolvedValue({ name: 'Fulano da Silva' });
        const { req, res, next } = buildReqRes('SDR', 'user-1');

        await requireLeadOwnership()(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('lead não encontrado: 404', async () => {
        lead.findFirst.mockResolvedValue(null);
        const { req, res, next } = buildReqRes('SDR', 'user-1');

        await requireLeadOwnership()(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(next).not.toHaveBeenCalled();
    });

    it('fallback por nome nunca compara contra o nome de outra pessoa (só o do próprio usuário autenticado)', async () => {
        lead.findFirst.mockResolvedValue({ owner: 'Outra Pessoa' });
        user.findUnique.mockResolvedValue({ name: 'Fulano da Silva' });
        const { req, res, next } = buildReqRes('SDR', 'user-1');

        await requireLeadOwnership()(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
    });
});
