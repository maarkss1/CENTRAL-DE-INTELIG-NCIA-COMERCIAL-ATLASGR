import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import { createHash } from 'crypto';

interface GovBrAuthToken {
    accessToken: string;
    expiresIn: number;
}

export class GovBrSignatureAdapter {
    async authenticate(): Promise<GovBrAuthToken> {
        // Na vida real: mTLS com certificado de máquina ou OAuth2 Client Credentials
        // Como dependemos de credenciamento do Gov.br, deixamos os stubs estruturais aqui.
        logger.info('Authenticating with Gov.br API...');
        return {
            accessToken: 'mocked-token-for-govbr',
            expiresIn: 3600
        };
    }

    /**
     * Envia o hash SHA-256 de uma proposta para assinatura
     */
    async requestSignature(documentHash: string, webhookUrl: string): Promise<string> {
        await this.authenticate(); // Token is authenticated
        
        logger.info({ documentHash, webhookUrl }, 'Solicitando assinatura via Gov.br');
        
        // Simulação do request real para o Gov.br
        /*
        const response = await fetch(`${this.baseUrl}/v1/signatures`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                hash: documentHash,
                webhookUrl: webhookUrl
            })
        });
        const data = await response.json();
        return data.signatureId;
        */

        // Simula um ID de assinatura externa
        return `govbr-sig-${Date.now()}`;
    }

    /**
     * Valida um webhook recebido do Gov.br
     */
    validateWebhook(payload: any, signatureHeader: string): boolean {
        // Validação de assinatura HMAC do Gov.br
        if (!env.ATLASGR_WEBHOOK_SECRET) return true; // Se não configurado, aceitamos no mock

        const hmac = createHash('sha256').update(JSON.stringify(payload) + env.ATLASGR_WEBHOOK_SECRET).digest('hex');
        return hmac === signatureHeader;
    }
}

export const govBrSignatureAdapter = new GovBrSignatureAdapter();
