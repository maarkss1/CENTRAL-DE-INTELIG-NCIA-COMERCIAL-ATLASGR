<<<<<<< HEAD
/**
 * ProspectingWhatsAppService
 *
 * NOTA DE MIGRAÇÃO (onda-1): Este serviço originalmente importava `whatsapp-web.js` e
 * `qrcode-terminal`, que não constam em package.json. O cliente WhatsApp do projeto usa
 * `@whiskeysockets/baileys` (registrado em `src/features/integrations/whatsapp/`).
 *
 * Handoff 01-para-05-tsc-whatsapp-service.md registra a migração necessária.
 * Enquanto isso, este stub preserva a interface pública sem introduzir erros de build.
 */
=======
>>>>>>> integracao/onda-2
import { logger } from '../../../lib/logger.js';
import { sendWhatsAppMessage, getWhatsAppStatus } from '../../integrations/whatsapp/whatsapp.service.js';

export class ProspectingWhatsAppService {
<<<<<<< HEAD
    private isReady = false;

    /** Envia uma mensagem WhatsApp. Stub: encaminhar para o cliente Baileys real via handoff 05. */
    async sendMessage(to: string, message: string): Promise<boolean> {
        logger.warn(`ProspectingWhatsAppService.sendMessage: stub — migração pendente (handoff 01-para-05). to=${to}, msg length=${message.length}`);
        return false;
=======
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
>>>>>>> integracao/onda-2
    }

    async isClientReady(organizationId: string): Promise<boolean> {
        const { status } = await getWhatsAppStatus(organizationId);
        return status === 'connected';
    }
}

export const whatsappService = new ProspectingWhatsAppService();
