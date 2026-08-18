import { logger } from '../../../lib/logger.js';
import { enqueueWhatsAppCommand } from '../../../lib/queue/whatsappCommand.queue.js';
import { getWhatsAppStatus } from '../../integrations/whatsapp/whatsapp.service.js';

export class ProspectingWhatsAppService {
    async sendMessage(organizationId: string, to: string, message: string): Promise<boolean> {
        try {
            await enqueueWhatsAppCommand({
                type: 'send',
                organizationId,
                number: to,
                text: message,
            });
            return true;
        } catch (error) {
            logger.error({ error, organizationId, to }, 'Falha ao enfileirar mensagem de prospecção via WhatsApp');
            return false;
        }
    }

    async isClientReady(organizationId: string): Promise<boolean> {
        const { status } = await getWhatsAppStatus(organizationId);
        return status === 'connected';
    }
}

export const whatsappService = new ProspectingWhatsAppService();
