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
import { logger } from '../../../lib/logger.js';

export class ProspectingWhatsAppService {
    private isReady = false;

    /** Envia uma mensagem WhatsApp. Stub: encaminhar para o cliente Baileys real via handoff 05. */
    async sendMessage(to: string, message: string): Promise<boolean> {
        logger.warn(`ProspectingWhatsAppService.sendMessage: stub — migração pendente (handoff 01-para-05). to=${to}, msg length=${message.length}`);
        return false;
    }

    isClientReady(): boolean {
        return this.isReady;
    }
}

export const whatsappService = new ProspectingWhatsAppService();
