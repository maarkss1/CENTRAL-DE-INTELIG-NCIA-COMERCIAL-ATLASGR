import { Router, Request, Response, NextFunction } from 'express';
import { getGoogleAuthUrl, processGoogleCallback, getGoogleStatus } from './google.service.js';

const router = Router();

// Endpoint para pegar a URL de autenticação do Google (OAuth)
router.get('/auth-url', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const url = await getGoogleAuthUrl();
        res.json({ success: true, url });
    } catch (error) {
        next(error);
    }
});

// Endpoint para processar o callback do Google
router.get('/callback', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { code } = req.query;
        if (!code || typeof code !== 'string') {
            res.status(400).json({ success: false, error: 'Authorization code is missing.' });
            return;
        }

        const result = await processGoogleCallback(code);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// Endpoint para obter o status da integração
router.get('/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const status = await getGoogleStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        next(error);
    }
});

export const googleRoutes = router;
