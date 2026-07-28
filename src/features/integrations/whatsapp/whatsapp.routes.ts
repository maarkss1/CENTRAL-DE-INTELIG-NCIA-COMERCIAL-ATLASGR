import { Router, Request, Response, NextFunction } from 'express';
import { initWhatsApp, getWhatsAppStatus, logoutWhatsApp, sendWhatsAppMessage } from './whatsapp.service.js';

const router = Router();

// Inicia a sessão e gera QR Code
router.post('/connect', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await initWhatsApp();
        res.json({ success: true, message: 'WhatsApp connect request sent.' });
    } catch (error) {
        next(error);
    }
});

// Pega o status (conectado, desconectado, QR Code)
router.get('/status', (req: Request, res: Response) => {
    const status = getWhatsAppStatus();
    res.json({ success: true, data: status });
});

// Desconecta a sessão
router.post('/disconnect', (req: Request, res: Response) => {
    logoutWhatsApp();
    res.json({ success: true, message: 'WhatsApp disconnected.' });
});

// Envia uma mensagem
router.post('/send', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { number, text } = req.body;
        if (!number || !text) {
            res.status(400).json({ success: false, error: 'number e text são obrigatórios.' });
            return;
        }

        await sendWhatsAppMessage(number, text);
        res.json({ success: true, message: 'Mensagem enviada com sucesso.' });
    } catch (error) {
        next(error);
    }
});

export const whatsappRoutes = router;
