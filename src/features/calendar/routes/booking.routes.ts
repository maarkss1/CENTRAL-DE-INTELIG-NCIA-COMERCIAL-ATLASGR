import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../../lib/prisma.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { authenticateToken, type AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireTenant } from '../../../shared/middlewares/authorization.js';
import { z } from 'zod';

// Schema para criação/atualização de link de agendamento
const bookingLinkSchema = z.object({
    slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hifens'),
    title: z.string().min(3).max(100),
    description: z.string().max(500).optional(),
    durationMin: z.number().int().min(15).max(120).default(30),
    active: z.boolean().default(true),
});

// Schema para realização pública de agendamento
const publicBookSchema = z.object({
    name: z.string().min(2, 'Nome é obrigatório'),
    email: z.string().email('E-mail inválido'),
    phone: z.string().min(8, 'Telefone é obrigatório'),
    company: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'Horário deve estar no formato HH:mm'),
    notes: z.string().max(500).optional(),
});

// ── Rotas Autenticadas (Gerenciamento de Links pelo Vendedor) ──────────────────

export const privateBookingRouter = Router();
privateBookingRouter.use(authenticateToken, requireTenant);

// Lista links de agendamento do usuário logado
privateBookingRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId, id: userId } = (req as AuthRequest).user;
        const links = await prisma.publicBookingLink.findMany({
            where: { organizationId, userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: links });
    } catch (err) {
        next(err);
    }
});

// Cria um novo link de agendamento
privateBookingRouter.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId, id: userId } = (req as AuthRequest).user;
        const parsed = bookingLinkSchema.parse(req.body);

        // Verifica se o slug já existe
        const existing = await prisma.publicBookingLink.findUnique({
            where: { slug: parsed.slug },
        });
        if (existing) {
            throw new AppError(`O link personalizado "/book/${parsed.slug}" já está em uso. Escolha outro slug.`, 409);
        }

        const link = await prisma.publicBookingLink.create({
            data: {
                ...parsed,
                userId,
                organizationId,
            },
        });
        res.status(201).json({ success: true, data: link });
    } catch (err) {
        next(err);
    }
});

// Deleta um link de agendamento
privateBookingRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId, id: userId } = (req as AuthRequest).user;
        await prisma.publicBookingLink.deleteMany({
            where: { id: req.params.id, organizationId, userId },
        });
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

// ── Rotas Públicas (Acesso pelo Cliente / Agendamento) ─────────────────────────

export const publicBookingRouter = Router();

// Consulta dados do link público e horários disponíveis
publicBookingRouter.get('/:slug', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const link = await prisma.publicBookingLink.findUnique({
            where: { slug: req.params.slug },
            include: {
                user: { select: { name: true, email: true, image: true, role: true } },
                organization: { select: { name: true } },
            },
        });

        if (!link || !link.active) {
            res.status(404).json({ success: false, error: 'Link de agendamento não encontrado ou inativo.' });
            return;
        }

        // Horários de atendimento padrão (09:00 às 18:00 de segunda a sexta)
        const standardSlots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];

        res.json({
            success: true,
            data: {
                id: link.id,
                slug: link.slug,
                title: link.title,
                description: link.description,
                durationMin: link.durationMin,
                host: {
                    name: link.user.name,
                    role: link.user.role,
                    organization: link.organization.name,
                },
                availableSlots: standardSlots,
            },
        });
    } catch (err) {
        next(err);
    }
});

// Realiza o agendamento público pelo cliente
publicBookingRouter.post('/:slug', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const link = await prisma.publicBookingLink.findUnique({
            where: { slug: req.params.slug },
            include: { user: true, organization: true },
        });

        if (!link || !link.active) {
            res.status(404).json({ success: false, error: 'Link de agendamento não encontrado ou inativo.' });
            return;
        }

        const body = publicBookSchema.parse(req.body);

        // 1. Cria ou encontra o Lead
        let companyId: string | undefined;
        if (body.company) {
            const company = await prisma.company.upsert({
                where: { id: `auto-${link.organizationId}-${body.company.toLowerCase().replace(/\s+/g, '-')}` },
                update: {},
                create: {
                    id: `auto-${link.organizationId}-${body.company.toLowerCase().replace(/\s+/g, '-')}`,
                    legalName: body.company,
                    tradeName: body.company,
                    organizationId: link.organizationId,
                    status: 'Ativo',
                    phones: [body.phone],
                    emails: [body.email],
                    tags: ['Agendamento Público'],
                },
            });
            companyId = company.id;
        }

        // Cria o contato
        const contact = await prisma.contact.create({
            data: {
                name: body.name,
                email: body.email,
                phone: body.phone,
                organizationId: link.organizationId,
                status: 'Ativo',
                companyId: companyId || link.organizationId,
            },
        }).catch(() => null);

        // Cria o Lead no CRM
        const lead = await prisma.lead.create({
            data: {
                organizationId: link.organizationId,
                status: 'Reuniao_Agendada',
                owner: link.user.name,
                companyId,
                contactId: contact?.id,
                title: `Reunião: ${body.company || body.name}`,
                customFields: { tags: ['Agendamento Calendly'] },
            },
        });

        // 2. Cria a Atividade na Agenda do Vendedor
        const activityDate = new Date(`${body.date}T${body.time}:00`);
        const activity = await prisma.activity.create({
            data: {
                type: 'Reuniao',
                owner: link.user.name,
                date: activityDate,
                time: body.time,
                status: 'Pendente',
                observations: `Reunião agendada via link público (${link.title})\nCliente: ${body.name} (${body.email} / ${body.phone})\nNotas: ${body.notes || 'Sem observações'}`,
                leadId: lead.id,
                organizationId: link.organizationId,
            },
        });

        res.status(201).json({
            success: true,
            data: {
                bookingId: activity.id,
                leadId: lead.id,
                date: body.date,
                time: body.time,
                host: link.user.name,
                title: link.title,
                message: 'Reunião confirmada com sucesso! Você receberá os detalhes em seu e-mail.',
            },
        });
    } catch (err) {
        next(err);
    }
});
