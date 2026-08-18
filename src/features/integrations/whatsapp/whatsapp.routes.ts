import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { getWhatsAppStatus } from './whatsapp.service.js';
import { listConversations } from './whatsappMessage.service.js';
import { prisma } from '../../../lib/prisma.js';
import { toE164BR } from '../../../lib/phone.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { enqueueWhatsAppCommand } from '../../../lib/queue/whatsappCommand.queue.js';

const router = Router();
const managementRoles = requireRole(['ADMIN', 'GESTOR']);

function idempotencyKey(req: Request): string | undefined {
    const value = req.header('x-idempotency-key');
    return value?.trim() || undefined;
}

router.get('/conversations', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const conversations = await listConversations(organizationId);
        res.json({ success: true, data: conversations });
    } catch (error) {
        next(error);
    }
});

router.get('/messages', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const leadId = typeof req.query.leadId === 'string' ? req.query.leadId : undefined;
        const phoneE164 = typeof req.query.phone === 'string' ? toE164BR(req.query.phone) : undefined;
        const messages = await prisma.whatsAppMessage.findMany({
            where: { organizationId, ...(leadId ? { leadId } : {}), ...(phoneE164 ? { phoneE164 } : {}) },
            orderBy: { receivedAt: 'desc' },
            take: 50,
        });
        res.json({ success: true, data: messages });
    } catch (error) {
        next(error);
    }
});

router.get('/signals', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const leadId = typeof req.query.leadId === 'string' ? req.query.leadId : undefined;
        if (!leadId) {
            res.status(400).json({ success: false, error: 'leadId é obrigatório.' });
            return;
        }
        const signals = await prisma.conversationSignal.findMany({
            where: { organizationId, leadId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        res.json({ success: true, data: signals });
    } catch (error) {
        next(error);
    }
});

router.post('/connect', managementRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const command = await enqueueWhatsAppCommand(
            { type: 'connect', organizationId },
            idempotencyKey(req),
        );
        res.status(202).json({ success: true, message: 'WhatsApp connect command queued.', data: command });
    } catch (error) {
        next(error);
    }
});

router.get('/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const status = await getWhatsAppStatus(organizationId);
        res.json({ success: true, data: status });
    } catch (error) {
        next(error);
    }
});

router.post('/disconnect', managementRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const command = await enqueueWhatsAppCommand(
            { type: 'disconnect', organizationId },
            idempotencyKey(req),
        );
        res.status(202).json({ success: true, message: 'WhatsApp disconnect command queued.', data: command });
    } catch (error) {
        next(error);
    }
});

router.post('/send', requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { number, text } = req.body;
        if (!number || !text) {
            res.status(400).json({ success: false, error: 'number e text são obrigatórios.' });
            return;
        }

        const command = await enqueueWhatsAppCommand(
            {
                type: 'send',
                organizationId,
                number,
                text,
                context: { skipOptOutCheck: true },
            },
            idempotencyKey(req),
        );
        res.status(202).json({ success: true, message: 'Mensagem enfileirada para envio.', data: command });
    } catch (error) {
        next(error);
    }
});

export const whatsappRoutes = router;
