import express, { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import { applySignatureStatusUpdate } from '../../cadence/application/documentSignature.js';
import { prismaSignatureRequestRepository } from '../../cadence/infra/PrismaSignatureRequestRepository.js';
import type { SignatureStatus } from '../../cadence/domain/signature.js';

/**
 * CYC-006 (onda 28) — transporte de ENTRADA de atualização de status de assinatura. O ENVIO da
 * solicitação (`GovBrSignatureProviderPort.ts`) é um stub — nenhuma credencial de integrador
 * gov.br está configurada neste projeto ainda —, mas este webhook de entrada já é real: aceita o
 * payload que o provedor real entregaria (mesma decisão de "construir com stub, plugar depois" de
 * CYC-003/CYC-004). Tudo a partir daqui — assinatura HMAC, idempotência/guardrail de transição via
 * `isValidSignatureTransition`, persistência do estado real — não é simulado.
 */

const VALID_STATUSES = new Set<SignatureStatus>(['created', 'sent', 'viewed', 'signed', 'declined', 'expired', 'cancelled']);

interface SignatureStatusPayload {
    provider?: unknown;
    providerRequestId?: unknown;
    status?: unknown;
    evidenceRef?: unknown;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** Comparação em tempo constante da assinatura HMAC — mesmo esquema de `emailReply.webhook.ts`. */
function isValidSignature(rawBody: Buffer, receivedSignature: string | undefined, secret: string): boolean {
    if (!receivedSignature) return false;
    const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'), 'utf8');
    const received = Buffer.from(receivedSignature, 'utf8');
    return received.length === expected.length && timingSafeEqual(received, expected);
}

async function handleSignatureStatus(req: Request, res: Response): Promise<void> {
    const secret = env.SIGNATURE_INBOUND_WEBHOOK_SECRET;
    if (!secret) {
        // Fail-closed: sem segredo configurado, aceitar o payload deixaria qualquer um que
        // descobrisse esta URL forjar uma assinatura "concluída" em nome de um documento.
        logger.error('Webhook de status de assinatura recebido, mas SIGNATURE_INBOUND_WEBHOOK_SECRET não está configurado.');
        res.status(503).json({ success: false, error: 'Webhook não configurado.' });
        return;
    }

    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
        logger.error('Webhook de status de assinatura sem corpo bruto — a rota precisa ser montada antes do express.json().');
        res.status(500).json({ success: false, error: 'Configuração de rota inválida.' });
        return;
    }

    if (!isValidSignature(rawBody, req.header('x-signature-webhook-signature'), secret)) {
        logger.warn('Webhook de status de assinatura com assinatura inválida — descartado.');
        res.status(401).json({ success: false, error: 'Assinatura inválida.' });
        return;
    }

    let payload: SignatureStatusPayload;
    try {
        payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
        res.status(400).json({ success: false, error: 'Corpo não é JSON válido.' });
        return;
    }

    const provider = asString(payload.provider);
    const providerRequestId = asString(payload.providerRequestId);
    const statusRaw = asString(payload.status);

    if (!provider || !providerRequestId || !statusRaw || !VALID_STATUSES.has(statusRaw as SignatureStatus)) {
        res.status(400).json({ success: false, error: 'provider, providerRequestId e status (válido) são obrigatórios.' });
        return;
    }

    try {
        const result = await applySignatureStatusUpdate(
            { repository: prismaSignatureRequestRepository },
            {
                provider,
                providerRequestId,
                nextStatus: statusRaw as SignatureStatus,
                evidenceRef: asString(payload.evidenceRef),
                rawWebhookPayload: payload,
            },
        );

        if (!result.applied) {
            // Nunca 5xx aqui: um `not-found`/`invalid-transition` não deve fazer o provedor reentregar
            // (reentregar não muda o resultado) — 200 com o motivo no corpo é o sinal correto.
            logger.warn({ provider, providerRequestId, status: statusRaw, reason: result.reason }, 'Atualização de status de assinatura ignorada.');
            res.status(200).json({ success: true, outcome: 'ignored', reason: result.reason });
            return;
        }

        res.status(200).json({ success: true, outcome: 'applied' });
    } catch (error) {
        // 5xx de propósito: um provedor real reentrega com backoff, e a checagem de transição
        // garante que a reentrega não corrompe um estado já aplicado.
        logger.error({ err: error, provider, providerRequestId }, 'Falha ao processar webhook de status de assinatura.');
        res.status(500).json({ success: false, error: 'Falha ao processar atualização de status de assinatura.' });
    }
}

const router = Router();

// express.raw porque a assinatura HMAC é calculada sobre os bytes exatos do corpo — mesmo esquema
// de emailReply.webhook.ts. Rota montada antes do express.json() global em server.ts.
router.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), handleSignatureStatus);

export const signatureStatusWebhookRoutes = router;
