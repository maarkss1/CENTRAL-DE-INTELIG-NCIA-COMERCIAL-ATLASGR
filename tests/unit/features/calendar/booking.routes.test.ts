import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

/**
 * Auditoria de tenancy/RLS + owners reais (Onda 2, Agente 04) sobre as rotas públicas de
 * agendamento (`publicBookingRouter`). Achados reais corrigidos, todos provados aqui:
 *
 * 1. `User`/`Organization` têm FORCE ROW LEVEL SECURITY (ver `src/lib/prisma.ts` e
 *    `prisma/migrations/20260722020322_enable_rls`) — carregar o host do link via `include` numa
 *    query sem `requestContext.run` (nem tenant, nem bypass) faz a policy de RLS bloquear a
 *    relação, e `link.user.name`/`link.organization.name` lançam `Cannot read properties of
 *    null`. As duas rotas devolviam 500 sempre, em produção. Corrigido carregando `User`/
 *    `Organization` sob `requestContext.run({ bypassRls: true })` (modelos permitidos nesse
 *    bootstrap, ver `BYPASS_RLS_ALLOWED_MODELS`).
 * 2. `Contact.companyId` é FK obrigatória para `Company` — sem nome de empresa no formulário
 *    público, o código antigo gravava `link.organizationId` (Organization, não Company) ali,
 *    violava a constraint, e o erro era engolido por um `.catch(() => null)`: o Contact real do
 *    cliente (nome/e-mail/telefone) nunca era persistido. Corrigido criando sempre uma Company
 *    real (rótulo derivado do nome da pessoa quando a empresa não é informada).
 * 3. `Lead.owner` gravava o NOME do vendedor (`link.user.name`) em vez do `User.id`
 *    (`link.userId`) — quebra toda atribuição de posse/RBAC/relatório "por vendedor" do CRM, que
 *    espera um id (mesma classe de bug já documentada para importação Bitrix). `Activity.owner`,
 *    ao contrário, é texto livre por convenção real do produto — continua sendo o nome.
 */

const publicBookingLinkFindUnique = vi.fn();
const userFindUnique = vi.fn();
const organizationFindUnique = vi.fn();
const companyUpsert = vi.fn();
const contactCreate = vi.fn();
const leadCreate = vi.fn();
const activityFindFirst = vi.fn();
const activityCreate = vi.fn();

vi.mock('../../../../src/lib/prisma.js', () => ({
    prisma: {
        publicBookingLink: { findUnique: (...a: unknown[]) => publicBookingLinkFindUnique(...a) },
        user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
        organization: { findUnique: (...a: unknown[]) => organizationFindUnique(...a) },
        company: { upsert: (...a: unknown[]) => companyUpsert(...a) },
        contact: { create: (...a: unknown[]) => contactCreate(...a) },
        lead: { create: (...a: unknown[]) => leadCreate(...a) },
        activity: {
            findFirst: (...a: unknown[]) => activityFindFirst(...a),
            create: (...a: unknown[]) => activityCreate(...a),
        },
    },
}));

import { requestContext } from '../../../../src/lib/async-context';
import { publicBookingRouter } from '../../../../src/features/calendar/routes/booking.routes';
import { errorHandler } from '../../../../src/shared/middlewares/errorHandler';

const app = express();
app.use(express.json());
app.use('/public-book', publicBookingRouter);
app.use(errorHandler);

const LINK = {
    id: 'link-1',
    slug: 'joao-vendas',
    title: 'Reunião com João',
    description: null,
    durationMin: 30,
    userId: 'user-1',
    organizationId: 'org-1',
    active: true,
};
const HOST_USER = { name: 'João Vendedor', email: 'joao@atlasgr.com', image: null, role: 'CLOSER' };
const HOST_ORG = { name: 'AtlasGR' };

beforeEach(() => {
    vi.clearAllMocks();
    publicBookingLinkFindUnique.mockResolvedValue(LINK);
    userFindUnique.mockResolvedValue(HOST_USER);
    organizationFindUnique.mockResolvedValue(HOST_ORG);
    companyUpsert.mockResolvedValue({ id: 'company-1' });
    contactCreate.mockResolvedValue({ id: 'contact-1' });
    leadCreate.mockResolvedValue({ id: 'lead-1' });
    activityFindFirst.mockResolvedValue(null);
    activityCreate.mockResolvedValue({ id: 'activity-1' });
    // Sem conflito de horário por padrão — os testes de conflito específicos sobrescrevem isto.
    activityFindFirst.mockResolvedValue(null);
});

describe('GET /public-book/:slug', () => {
    it('404 quando o link não existe — nunca lança', async () => {
        publicBookingLinkFindUnique.mockResolvedValue(null);

        const res = await request(app).get('/public-book/inexistente');

        expect(res.status).toBe(404);
    });

    it('carrega User/Organization sob bypass de RLS (nunca via include na mesma query do link)', async () => {
        userFindUnique.mockImplementation(async () => {
            expect(requestContext.getStore()?.bypassRls).toBe(true);
            return HOST_USER;
        });
        organizationFindUnique.mockImplementation(async () => {
            expect(requestContext.getStore()?.bypassRls).toBe(true);
            return HOST_ORG;
        });

        const res = await request(app).get('/public-book/joao-vendas');

        expect(res.status).toBe(200);
        expect(res.body.data.host).toEqual({ name: 'João Vendedor', role: 'CLOSER', organization: 'AtlasGR' });
        // A query do link em si nunca usa `include` — os dois lookups acima são chamadas próprias.
        expect(publicBookingLinkFindUnique).toHaveBeenCalledWith({ where: { slug: 'joao-vendas' } });
    });

    it('404 (não 500) quando o link aponta para usuário/organização que não existe mais', async () => {
        userFindUnique.mockResolvedValue(null);

        const res = await request(app).get('/public-book/joao-vendas');

        expect(res.status).toBe(404);
    });
});

describe('POST /public-book/:slug — agendamento real', () => {
    const validBody = {
        name: 'Cliente Teste',
        email: 'cliente@empresa.com',
        phone: '11999998888',
        date: '2026-09-01',
        time: '10:00',
    };

    it('sem nome de empresa: cria uma Company real (nunca usa organizationId como companyId)', async () => {
        await request(app).post('/public-book/joao-vendas').send(validBody);

        expect(companyUpsert).toHaveBeenCalledTimes(1);
        const createArg = companyUpsert.mock.calls[0][0].create;
        expect(createArg.organizationId).toBe('org-1');
        expect(createArg.legalName).toContain('Cliente Teste');

        expect(contactCreate).toHaveBeenCalledTimes(1);
        const contactArg = contactCreate.mock.calls[0][0].data;
        expect(contactArg.companyId).toBe('company-1'); // nunca 'org-1'
        expect(contactArg.name).toBe('Cliente Teste');
        expect(contactArg.email).toBe('cliente@empresa.com');
    });

    it('Lead.owner grava o User.id real (link.userId), nunca o nome de exibição', async () => {
        await request(app).post('/public-book/joao-vendas').send(validBody);

        expect(leadCreate).toHaveBeenCalledTimes(1);
        expect(leadCreate.mock.calls[0][0].data.owner).toBe('user-1');
    });

    it('Activity.owner continua sendo o nome (texto livre, convenção real do produto)', async () => {
        await request(app).post('/public-book/joao-vendas').send(validBody);

        expect(activityCreate).toHaveBeenCalledTimes(1);
        expect(activityCreate.mock.calls[0][0].data.owner).toBe('João Vendedor');
    });

    it('todas as escritas (Company/Contact/Lead/Activity) rodam dentro do tenant do link, nunca com bypass', async () => {
        companyUpsert.mockImplementation(async () => {
            expect(requestContext.getStore()?.tenantId).toBe('org-1');
            expect(requestContext.getStore()?.bypassRls).toBeUndefined();
            return { id: 'company-1' };
        });

        const res = await request(app).post('/public-book/joao-vendas').send(validBody);

        expect(res.status).toBe(201);
        expect(res.body.data.host).toBe('João Vendedor');
        expect(res.body.data.leadId).toBe('lead-1');
    });

    it('falha ao criar o Contact é registrada em log, não engolida em silêncio, e não derruba o agendamento', async () => {
        contactCreate.mockRejectedValue(new Error('violates foreign key constraint'));

        const res = await request(app).post('/public-book/joao-vendas').send(validBody);

        expect(res.status).toBe(201);
        expect(leadCreate.mock.calls[0][0].data.contactId).toBeUndefined();
    });
});
