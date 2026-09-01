import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

/**
 * PATCH /api/calendar/booking-links/:id — achado do Piloto 020: `PublicBookingLink.active` já
 * existia no schema Prisma, mas não havia rota nenhuma para alterá-lo depois da criação (só
 * existência total via DELETE). Cobre o mesmo padrão de "dono OU gestão" já usado em
 * `requireLeadOwnership.ts`: ADMIN/GESTOR alternam qualquer link da organização, CLOSER/SDR/
 * VISUALIZADOR só o próprio.
 *
 * `authenticateToken`/`requireTenant` (aplicados dentro do próprio `privateBookingRouter.use(...)`)
 * são substituídos por doubles simples — o mesmo padrão de `intelligence.routes.tenant-forgery.test.ts`
 * — para exercitar a rota real sem depender de sessão/DB reais.
 */

const publicBookingLinkFindFirst = vi.fn();
const publicBookingLinkUpdate = vi.fn();

vi.mock('../../../../src/lib/prisma.js', () => ({
  prisma: {
    publicBookingLink: {
      findFirst: (...a: unknown[]) => publicBookingLinkFindFirst(...a),
      update: (...a: unknown[]) => publicBookingLinkUpdate(...a),
    },
  },
}));

let currentUser: { id: string; organizationId: string; role: string } | null = null;

vi.mock('../../../../src/shared/middlewares/authenticateToken.js', () => ({
  authenticateToken: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = currentUser;
    next();
  },
}));

vi.mock('../../../../src/shared/middlewares/authorization.js', () => ({
  requireTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { privateBookingRouter } from '../../../../src/features/calendar/routes/booking.routes';
import { errorHandler } from '../../../../src/shared/middlewares/errorHandler';

const app = express();
app.use(express.json());
app.use('/booking-links', privateBookingRouter);
app.use(errorHandler);

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { id: 'user-1', organizationId: 'org-1', role: 'CLOSER' };
});

describe('PATCH /booking-links/:id — ativa/desativa link de agendamento', () => {
  it('dono (CLOSER) consegue desativar o próprio link', async () => {
    publicBookingLinkFindFirst.mockResolvedValue({
      id: 'link-1',
      userId: 'user-1',
      organizationId: 'org-1',
      active: true,
    });
    publicBookingLinkUpdate.mockResolvedValue({ id: 'link-1', active: false });

    const res = await request(app).patch('/booking-links/link-1').send({ active: false });

    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(false);
    // Não-gestor: a busca de posse restringe por userId, nunca alcança link de outro dono.
    expect(publicBookingLinkFindFirst).toHaveBeenCalledWith({
      where: { id: 'link-1', organizationId: 'org-1', userId: 'user-1' },
    });
    expect(publicBookingLinkUpdate).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: { active: false },
    });
  });

  it('404 (não 403) quando o link pertence a outro usuário e quem chama não é ADMIN/GESTOR — nunca chama update', async () => {
    publicBookingLinkFindFirst.mockResolvedValue(null);

    const res = await request(app).patch('/booking-links/link-de-outro-vendedor').send({ active: false });

    expect(res.status).toBe(404);
    expect(publicBookingLinkUpdate).not.toHaveBeenCalled();
  });

  it('ADMIN pode alternar o link de outro vendedor da mesma organização', async () => {
    currentUser = { id: 'admin-1', organizationId: 'org-1', role: 'ADMIN' };
    publicBookingLinkFindFirst.mockResolvedValue({
      id: 'link-3',
      userId: 'user-2',
      organizationId: 'org-1',
      active: true,
    });
    publicBookingLinkUpdate.mockResolvedValue({ id: 'link-3', active: false });

    const res = await request(app).patch('/booking-links/link-3').send({ active: false });

    expect(res.status).toBe(200);
    // Gestão: a busca de posse não filtra por userId, só por organização (qualquer link do tenant).
    expect(publicBookingLinkFindFirst).toHaveBeenCalledWith({
      where: { id: 'link-3', organizationId: 'org-1' },
    });
  });

  it('GESTOR pode alternar o link de outro vendedor da mesma organização', async () => {
    currentUser = { id: 'gestor-1', organizationId: 'org-1', role: 'GESTOR' };
    publicBookingLinkFindFirst.mockResolvedValue({
      id: 'link-4',
      userId: 'user-2',
      organizationId: 'org-1',
      active: false,
    });
    publicBookingLinkUpdate.mockResolvedValue({ id: 'link-4', active: true });

    const res = await request(app).patch('/booking-links/link-4').send({ active: true });

    expect(res.status).toBe(200);
    expect(publicBookingLinkUpdate).toHaveBeenCalledWith({
      where: { id: 'link-4' },
      data: { active: true },
    });
  });

  it('nunca alcança um link de outra organização, mesmo para ADMIN (organizationId sempre vem de req.user)', async () => {
    currentUser = { id: 'admin-1', organizationId: 'org-1', role: 'ADMIN' };
    publicBookingLinkFindFirst.mockResolvedValue(null);

    const res = await request(app).patch('/booking-links/link-de-outro-tenant').send({ active: false });

    expect(res.status).toBe(404);
    expect(publicBookingLinkFindFirst).toHaveBeenCalledWith({
      where: { id: 'link-de-outro-tenant', organizationId: 'org-1' },
    });
    expect(publicBookingLinkUpdate).not.toHaveBeenCalled();
  });

  it('rejeita body sem `active` booleano com 400 (erro de validação) e nunca chama o banco', async () => {
    const res = await request(app).patch('/booking-links/link-1').send({ active: 'sim' });

    expect(res.status).toBe(400);
    expect(publicBookingLinkFindFirst).not.toHaveBeenCalled();
    expect(publicBookingLinkUpdate).not.toHaveBeenCalled();
  });
});
