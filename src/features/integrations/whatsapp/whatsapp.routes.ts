import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { initWhatsApp, getWhatsAppStatus, logoutWhatsApp, sendWhatsAppMessage } from './whatsapp.service.js';
import { prisma } from '../../../lib/prisma.js';

const router = Router();

// Histórico de mensagens persistidas — de um lead específico, ou as mais recentes de toda a
// organização quando nenhum leadId é informado.
router.get('/messages', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const leadId = typeof req.query.leadId === 'string' ? req.query.leadId : undefined;
        const messages = await prisma.whatsAppMessage.findMany({
            where: { organizationId, ...(leadId ? { leadId } : {}) },
            orderBy: { receivedAt: 'desc' },
            take: 50,
        });
        res.json({ success: true, data: messages });
    } catch (error) {
        next(error);
    }
});

// Sinais de intenção extraídos por IA das conversas de WhatsApp de um lead (ver
// conversation-intelligence.service.ts) — mais recentes primeiro.
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

// Inicia a sessão e gera QR Code (por tenant)
router.post('/connect', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        await initWhatsApp(organizationId);
        res.json({ success: true, message: 'WhatsApp connect request sent.' });
    } catch (error) {
        next(error);
    }
});

// Pega o status (conectado, desconectado, QR Code) do tenant autenticado
router.get('/status', (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user;
    const status = getWhatsAppStatus(organizationId);
    res.json({ success: true, data: status });
});

// Desconecta a sessão do tenant autenticado
router.post('/disconnect', (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user;
    logoutWhatsApp(organizationId);
    res.json({ success: true, message: 'WhatsApp disconnected.' });
});

// Envia uma mensagem pela sessão do tenant autenticado
router.post('/send', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { number, text } = req.body;
        if (!number || !text) {
            res.status(400).json({ success: false, error: 'number e text são obrigatórios.' });
            return;
        }

        await sendWhatsAppMessage(organizationId, number, text);
        res.json({ success: true, message: 'Mensagem enviada com sucesso.' });
    } catch (error) {
        next(error);
    }
});

export const whatsappRoutes = router;
