import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { logger } from '../../../lib/logger.js';

export class ProspectingWhatsAppService {
    private client: Client;
    private isReady: boolean = false;

    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth({ clientId: 'prospecting-client' }),
            puppeteer: {
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            },
        });

        this.initialize();
    }

    private initialize() {
        this.client.on('qr', (qr) => {
            logger.info('WhatsApp QR Code generated. Scan to authenticate.');
            qrcode.generate(qr, { small: true });
        });

        this.client.on('ready', () => {
            logger.info('WhatsApp Client is ready!');
            this.isReady = true;
        });

        this.client.on('auth_failure', (msg) => {
            logger.error('WhatsApp authentication failure', { msg });
            this.isReady = false;
        });

        this.client.on('disconnected', (reason) => {
            logger.warn('WhatsApp disconnected', { reason });
            this.isReady = false;
        });

        this.client.initialize().catch(err => {
            logger.error('Failed to initialize WhatsApp client', { err });
        });
    }

    /**
     * Send a WhatsApp message to a specific number.
     * @param to The number to send the message to (e.g., '5511999999999')
     * @param message The text message to send
     */
    async sendMessage(to: string, message: string): Promise<boolean> {
        if (!this.isReady) {
            logger.error('Cannot send message: WhatsApp client is not ready');
            return false;
        }

        try {
            // WhatsApp requires the number to be in the format 'number@c.us'
            const formattedNumber = `${to.replace(/\D/g, '')}@c.us`;
            const response = await this.client.sendMessage(formattedNumber, message);
            logger.info(`WhatsApp message sent to ${to}`, { messageId: response.id.id });
            return true;
        } catch (error) {
            logger.error(`Failed to send WhatsApp message to ${to}`, { error });
            return false;
        }
    }

    isClientReady(): boolean {
        return this.isReady;
    }
}

export const whatsappService = new ProspectingWhatsAppService();
