import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import {
    getGoogleAuthUrl,
    processGoogleCallback,
    getGoogleStatus,
    disconnectGoogle,
    getUpcomingCalendarEvents,
    verifyState,
    GoogleNotConfiguredError,
    GoogleNotConnectedError,
} from './google.service.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';

const router = Router();

// URL real de consentimento OAuth do Google (Gmail + Calendar) para a organização autenticada.
router.get('/auth-url', (req: Request, res: Response, next: NextFunction): void => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const url = getGoogleAuthUrl(organizationId);
        res.json({ success: true, data: { url } });
    } catch (error) {
        if (error instanceof GoogleNotConfiguredError) {
            res.status(503).json({ success: false, error: error.message });
            return;
        }
        next(error);
    }
});

// Callback do Google — chegada via navegação do próprio navegador do usuário (mesma sessão
// autenticada que iniciou o /auth-url), então redireciona de volta para a tela de Integrações
// em vez de devolver JSON cru.
router.get('/callback', async (req: Request, res: Response): Promise<void> => {
    const { organizationId } = (req as AuthRequest).user;
    const redirectBack = (status: 'connected' | 'error', message?: string): void => {
        const params = new URLSearchParams({ google: status, ...(message ? { message } : {}) });
        res.redirect(`/app?${params.toString()}`);
    };

    try {
        const { code, state } = req.query;
        if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
            redirectBack('error', 'Parâmetros ausentes no retorno do Google.');
            return;
        }
        if (!verifyState(state, organizationId)) {
            redirectBack('error', 'Não foi possível validar o retorno do Google (state inválido).');
            return;
        }

        await processGoogleCallback(organizationId, code);
        redirectBack('connected');
    } catch (error) {
        redirectBack('error', error instanceof Error ? error.message : 'Falha ao conectar com o Google.');
    }
});

router.get('/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const status = await getGoogleStatus(organizationId);
        res.json({ success: true, data: status });
    } catch (error) {
        next(error);
    }
});

router.post('/disconnect', requireRole(['ADMIN', 'GESTOR']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        await disconnectGoogle(organizationId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// Próximos eventos reais do Google Calendar da conta conectada.
router.get('/calendar/upcoming', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const events = await getUpcomingCalendarEvents(organizationId);
        res.json({ success: true, data: events });
    } catch (error) {
        if (error instanceof GoogleNotConnectedError) {
            res.status(409).json({ success: false, error: error.message });
            return;
        }
        next(error);
    }
});

export const googleRoutes = router;
