import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { initWhatsApp, getWhatsAppStatus, logoutWhatsApp, sendWhatsAppMessage } from './whatsapp.service.js';
import { listConversations } from './whatsappMessage.service.js';
import { prisma } from '../../../lib/prisma.js';
import { toE164BR } from '../../../lib/phone.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';

const router = Router();
const managementRoles = requireRole(['ADMIN', 'GESTOR']);

// Lista de conversas (uma por número, mensagem mais recente primeiro) — alimenta o painel
// "WhatsApp Web" embutido na tela de Integrações.
router.get('/conversations', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const conversations = await listConversations(organizationId);
        res.json({ success: true, data: conversations });
    } catch (error) {
        next(error);
    }
});

// Histórico de mensagens persistidas — de um lead específico, de um telefone específico (útil para
// candidatos de prospecção ainda não promovidos a Lead), ou as mais recentes de toda a organização
// quando nenhum filtro é informado.
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
router.post('/connect', managementRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        await initWhatsApp(organizationId);
        res.json({ success: true, message: 'WhatsApp connect request sent.' });
    } catch (error) {
        next(error);
    }
});

// Pega o status (conectado, desconectado, QR Code) do tenant autenticado
router.get('/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const status = await getWhatsAppStatus(organizationId);
        res.json({ success: true, data: status });
    } catch (error) {
        next(error);
    }
});

// Desconecta a sessão do tenant autenticado
router.post('/disconnect', managementRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        await logoutWhatsApp(organizationId);
        res.json({ success: true, message: 'WhatsApp disconnected.' });
    } catch (error) {
        next(error);
    }
});

// Envia uma mensagem pela sessão do tenant autenticado — mensagem manual digitada por um
// vendedor/gestor no painel de conversa (WhatsAppChatPanel/WhatsAppWebPanel), não um disparo
// automatizado. `skipOptOutCheck: true` de propósito: o contrato de opt-out unificado
// (`.agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md`) cobre cadência/prospecção/
// automação, não uma resposta humana dentro de uma conversa já em andamento.
router.post('/send', requireRole(['ADMIN', 'GESTOR', 'VENDEDOR']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { number, text } = req.body;
        if (!number || !text) {
            res.status(400).json({ success: false, error: 'number e text são obrigatórios.' });
            return;
        }

        await sendWhatsAppMessage(organizationId, number, text, undefined, { skipOptOutCheck: true });
        res.json({ success: true, message: 'Mensagem enviada com sucesso.' });
    } catch (error) {
        next(error);
    }
});

export const whatsappRoutes = router;
