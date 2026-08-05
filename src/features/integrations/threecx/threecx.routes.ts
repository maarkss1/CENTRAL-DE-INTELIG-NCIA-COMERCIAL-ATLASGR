import express, { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import { isValidSignature } from '../birth-voice/birthVoice.helpers.js';
import {
    list3CXConnections,
    connect3CX,
    test3CXConnection,
    disconnect3CX,
    make3CXCall,
    process3CXWebhook,
} from './threecx.service.js';

const router = Router();

// Webhook do PABX 3CX Call Flow: quem chama é o servidor 3CX do cliente, não um usuário logado,
// então não passa por authenticateToken — a autenticidade é provada por uma assinatura HMAC sobre
// os bytes crus do corpo (mesmo esquema do webhook do Birth Voices Hub em birthVoice.webhook.ts).
// Precisa de express.raw() (não express.json()) porque a assinatura é calculada sobre o corpo cru;
// esta rota é montada em server.ts ANTES do express.json() global, então funciona sem parsing prévio.
export const threecxWebhookRouter = Router();
threecxWebhookRouter.post('/', express.raw({ type: '*/*', limit: '256kb' }), async (req: Request, res: Response) => {
    const secret = env.THREECX_WEBHOOK_SECRET;
    if (!secret) {
        // Fail-closed: sem segredo não há como distinguir o PABX do cliente de qualquer um que
        // descubra esta URL — aceitar o payload deixaria qualquer pessoa injetar eventos de chamada
        // falsos.
        logger.error('Webhook do 3CX recebido, mas THREECX_WEBHOOK_SECRET não está configurado.');
        res.status(503).json({ success: false, error: 'Webhook não configurado.' });
        return;
    }

    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
        logger.error('Webhook do 3CX sem corpo bruto — a rota precisa ser montada antes do express.json().');
        res.status(500).json({ success: false, error: 'Configuração de rota inválida.' });
        return;
    }

    if (!isValidSignature(rawBody, req.header('x-3cx-signature'), secret)) {
        logger.warn('Webhook do 3CX com assinatura inválida — descartado.');
        res.status(401).json({ success: false, error: 'Assinatura inválida.' });
        return;
    }

    let payload: Record<string, unknown>;
    try {
        payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
        res.status(400).json({ success: false, error: 'Corpo não é JSON válido.' });
        return;
    }

    try {
        const result = await process3CXWebhook(payload);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error({ err: error }, 'Falha ao processar webhook do 3CX.');
        res.status(500).json({ success: false, error: 'Falha ao processar webhook.' });
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
