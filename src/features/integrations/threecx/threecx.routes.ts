import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import {
    list3CXConnections,
    connect3CX,
    test3CXConnection,
    disconnect3CX,
    make3CXCall,
    process3CXWebhook,
} from './threecx.service.js';

const router = Router();

// Webhook desautenticado para receber notificações de chamadas do PABX 3CX Call Flow
export const threecxWebhookRouter = Router();
threecxWebhookRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await process3CXWebhook(req.body);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// Rotas protegidas (exigem autenticação e tenant)
router.get('/connections', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const data = await list3CXConnections(organizationId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/connect', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const data = await connect3CX(organizationId, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/connections/:connectionId/test', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const data = await test3CXConnection(organizationId, req.params.connectionId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/disconnect/:connectionId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        await disconnect3CX(organizationId, req.params.connectionId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

router.post('/call', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { connectionId, phoneNumber, leadId } = req.body;
        const data = await make3CXCall(organizationId, connectionId, phoneNumber, leadId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

export const threecxRoutes = router;
