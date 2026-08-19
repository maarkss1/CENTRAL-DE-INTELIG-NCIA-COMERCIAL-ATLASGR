import { randomUUID } from 'node:crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../../shared/middlewares/authenticateToken.js';
import { AppError } from '../../shared/middlewares/errorHandler.js';
import { requireRole } from '../../shared/middlewares/requireRole.js';
import { validateRequest } from '../../shared/middlewares/validateRequest.js';
import { prisma } from '../../lib/prisma.js';
import { prismaOptOutRepository } from './infra/PrismaOptOutRepository.js';
import { prismaCadenceRunRepository } from './infra/PrismaCadenceRunRepository.js';
import { parseCadenceSequenceDefinition } from './jobs/cadenceRun.worker.js';
import { startCadenceRun, validateSequence, type CadenceRunStatus } from './domain/cadence.js';
import { scheduleVerifiedMeeting } from './application/scheduleMeeting.js';
import { prismaMeetingConfirmationNotePort } from './infra/PrismaMeetingConfirmationNotePort.js';
import { prismaCalendarSchedulerPort } from './infra/PrismaCalendarSchedulerPort.js';

/**
 * Router de cadência multicanal e opt-out unificado. Leitura (opt-outs/runs) desde a Onda 10;
 * escrita (criar sequência, iniciar run para um lead) adicionada nesta rodada — pré-requisito para
 * o runtime construído na onda 19 (`cadenceRun.worker.ts`) ter algum efeito prático: antes desta
 * rota, não existia NENHUMA forma de criar uma `CadenceSequence` ou uma `CadenceRun` fora de teste.
 * Ação de escrita para pausar/retomar/parar um run em andamento ainda não existe — ver CYC-009.
 *
 * Mesmo padrão de autenticação/tenant isolation de todo router deste projeto: `authenticateToken`
 * + `requireTenant` são aplicados na montagem (`server.ts`), nunca aqui — `req.user.organizationId`
 * já vem resolvido e o Prisma já aplica RLS por `requestContext` (ver `src/lib/prisma.ts`). Sem
 * `requireRole`: qualquer papel autenticado (inclusive VISUALIZADOR) pode ver opt-outs e runs de
 * cadência da própria organização — é leitura, não ação de disparo. Ações de escrita (criar
 * sequência, iniciar run) exigem papel de vendas/gestão, mesmo padrão de `agent.routes.ts`.
 */

const router = Router();
const writeRoles = requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);

const cadenceTouchSchema = z.object({
    order: z.number().int().min(1),
    channel: z.enum(['email', 'whatsapp', 'voice']),
    delayHoursFromPrevious: z.number().int().min(0).max(24 * 30),
    maxAttempts: z.number().int().min(1).max(5).optional(),
    // Sem sistema de template ainda (ver docs/CADENCE-CYCLE-AUDIT.md) — este campo é o conteúdo
    // final da mensagem em si, não uma referência a template resolvido em outro lugar.
    templateRef: z.string().trim().min(1).max(4_000).optional(),
});

const createSequenceSchema = z.object({
    name: z.string().trim().min(1, 'Nome da sequência é obrigatório.').max(160),
    touches: z.array(cadenceTouchSchema).min(1, 'A sequência precisa de pelo menos um toque.').max(10),
});

const startRunSchema = z.object({
    leadId: z.string().trim().min(1, 'leadId é obrigatório.'),
    sequenceId: z.string().trim().min(1, 'sequenceId é obrigatório.'),
});

const scheduleMeetingSchema = z.object({
    proposedStart: z.string().datetime({ message: 'proposedStart deve ser uma data/hora ISO 8601.' }),
    proposedEnd: z.string().datetime({ message: 'proposedEnd deve ser uma data/hora ISO 8601.' }),
});

/** Enum Postgres (PascalCase) aceito na query `?status=Active,Paused` — mesma casing de `CadenceRunStatus` no schema, para não obrigar quem chama a API a conhecer a convenção lowercase do domínio interno. */
const STATUS_QUERY_TO_DOMAIN: Record<string, CadenceRunStatus> = {
    Active: 'active',
    Paused: 'paused',
    Stopped: 'stopped',
    Completed: 'completed',
    Failed: 'failed',
};

function parseStatusFilter(raw: unknown): CadenceRunStatus[] | undefined {
    if (typeof raw !== 'string' || raw.trim().length === 0) return undefined;
    const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
    const parsed = values.map((v) => {
        const mapped = STATUS_QUERY_TO_DOMAIN[v];
        if (!mapped) {
            throw new AppError(`Status de cadência inválido: '${v}'. Use Active, Paused, Stopped, Completed e/ou Failed.`, 400);
        }
        return mapped;
    });
    return parsed.length > 0 ? parsed : undefined;
}

router.get('/opt-outs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const records = await prismaOptOutRepository.list(organizationId);
        res.json({ success: true, data: records });
    } catch (error) {
        next(error);
    }
});

router.get('/runs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const status = parseStatusFilter(req.query.status);
        const runs = await prismaCadenceRunRepository.listByOrganization(organizationId, status ? { status } : undefined);
        res.json({ success: true, data: runs });
    } catch (error) {
        next(error);
    }
});

router.get('/sequences', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const sequences = await prisma.cadenceSequence.findMany({
            where: { organizationId, active: true, deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
        res.json({ success: true, data: sequences });
    } catch (error) {
        next(error);
    }
});

router.post('/sequences', writeRoles, validateRequest(createSequenceSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId, id: userId } = (req as AuthRequest).user;
        const { name, touches } = req.body as z.infer<typeof createSequenceSchema>;

        // Mesma validação estrutural que o worker exige antes de rodar (`parseCadenceSequenceDefinition`)
        // — checada aqui, na criação, para nunca deixar uma sequência inválida entrar no banco.
        const errors = validateSequence({ id: 'draft', name, touches });
        if (errors.length > 0) {
            throw new AppError(`Sequência inválida: ${errors.join('; ')}`, 400);
        }

        const sequence = await prisma.cadenceSequence.create({
            data: { organizationId, name, touches, createdBy: userId },
        });
        res.status(201).json({ success: true, data: sequence });
    } catch (error) {
        next(error);
    }
});

router.post('/runs', writeRoles, validateRequest(startRunSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { leadId, sequenceId } = req.body as z.infer<typeof startRunSchema>;

        const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId }, select: { id: true } });
        if (!lead) throw new AppError('Lead não encontrado nesta organização.', 404);

        const sequenceRow = await prisma.cadenceSequence.findFirst({
            where: { id: sequenceId, organizationId, active: true, deletedAt: null },
            select: { id: true, name: true, touches: true },
        });
        if (!sequenceRow) throw new AppError('Sequência não encontrada ou inativa nesta organização.', 404);

        const sequence = parseCadenceSequenceDefinition(sequenceRow);
        if (!sequence) throw new AppError('Sequência com dados inválidos — não é possível iniciar um run a partir dela.', 422);

        const run = startCadenceRun({
            id: randomUUID(),
            organizationId,
            leadId,
            sequenceId,
            startedAt: new Date(),
        });

        try {
            await prismaCadenceRunRepository.save(run);
        } catch (err) {
            // `CadenceRun_leadId_active_unique` (índice único parcial, status=Active) — este lead já
            // tem uma cadência em andamento. Não é um erro de verdade, é uma regra de negócio real:
            // devolve 409 em vez de deixar o erro de banco cru subir.
            if ((err as { code?: string })?.code === 'P2002') {
                throw new AppError('Este lead já tem uma cadência ativa em andamento.', 409);
            }
            throw err;
        }

        res.status(201).json({ success: true, data: { ...run, sequenceName: sequence.name } });
    } catch (error) {
        next(error);
    }
});

// CYC-004 (onda 27) — agendamento de reunião com confirmação verificável (ver
// `domain/scheduling.ts` e `application/scheduleMeeting.ts`). Só aceita `evidenceType:
// 'manual-verified'` (vendedor confirmando após contato ao vivo) — os outros dois tipos de
// evidência do domínio (réplica de calendário por e-mail, clique em link de agendamento
// self-service) exigem um transporte que ainda não existe neste produto.
router.post('/leads/:leadId/schedule-meeting', writeRoles, validateRequest(scheduleMeetingSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId, id: actorUserId, email: actorEmail } = (req as AuthRequest).user;
        const { leadId } = req.params;
        const { proposedStart, proposedEnd } = req.body as z.infer<typeof scheduleMeetingSchema>;

        const lead = await prisma.lead.findFirst({
            where: { id: leadId, organizationId },
            select: { id: true, title: true, contact: { select: { email: true } } },
        });
        if (!lead) throw new AppError('Lead não encontrado nesta organização.', 404);

        const result = await scheduleVerifiedMeeting(
            { notes: prismaMeetingConfirmationNotePort, scheduler: prismaCalendarSchedulerPort },
            {
                organizationId,
                leadId,
                actorUserId,
                proposedStart: new Date(proposedStart),
                proposedEnd: new Date(proposedEnd),
                leadTitle: lead.title || 'Lead sem título',
                leadEmail: lead.contact?.email || '',
                ownerEmail: actorEmail,
            },
            new Date(),
        );

        if (!result.scheduled) {
            throw new AppError('Confirmação de horário não é verificável — informe um horário futuro válido (fim depois do início).', 422);
        }

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

export const cadenceRoutes = router;
