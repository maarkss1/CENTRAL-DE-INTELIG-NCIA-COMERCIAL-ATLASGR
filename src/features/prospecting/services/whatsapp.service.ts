import { logger } from '../../../lib/logger.js';
import { sendWhatsAppMessage, getWhatsAppStatus } from '../../integrations/whatsapp/whatsapp.service.js';

export class ProspectingWhatsAppService {
    /**
     * Envia uma mensagem WhatsApp consumindo o serviço Baileys de integração.
     * @param organizationId O ID da organização/tenant
     * @param to O número para o qual a mensagem deve ser enviada
     * @param message O texto da mensagem
     */
    async sendMessage(organizationId: string, to: string, message: string): Promise<boolean> {
        try {
            return await sendWhatsAppMessage(organizationId, to, message);
        } catch (error) {
            logger.error({ error, organizationId, to }, 'Falha ao enviar mensagem de prospecção via WhatsApp Baileys');
            return false;
        }
    }

    async isClientReady(organizationId: string): Promise<boolean> {
        const { status } = await getWhatsAppStatus(organizationId);
        return status === 'connected';
    }
}

export const whatsappService = new ProspectingWhatsAppService();
