import { Request, Response } from 'express';
import { connection } from '../../lib/queue/redis.js';

const clients = new Set<{ id: string, orgId: string, res: Response }>();

// Assina o canal no Redis para disparar SSE (Pub/Sub global)
const subscriber = connection.duplicate();
subscriber.subscribe('voice-notifications');
subscriber.on('message', (channel, message) => {
    if (channel === 'voice-notifications') {
        const payload = JSON.parse(message);
        // Notifica apenas os clientes da mesma organização
        for (const client of clients) {
            if (client.orgId === payload.organizationId) {
                client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
            }
        }
    }
});

export const sseService = {
    addClient(req: Request, res: Response, organizationId: string) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const clientId = Date.now().toString();
        const client = { id: clientId, orgId: organizationId, res };
        clients.add(client);

        req.on('close', () => {
            clients.delete(client);
        });
    },

    notifyVoiceQualified(organizationId: string, leadId: string, message: string) {
        const payload = {
            type: 'voice-qualified',
            organizationId,
            leadId,
            message,
        };
        connection.publish('voice-notifications', JSON.stringify(payload));
    }
};
