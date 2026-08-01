import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { initWhatsApp, getWhatsAppStatus, logoutWhatsApp, sendWhatsAppMessage } from './whatsapp.service.js';

const router = Router();

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
