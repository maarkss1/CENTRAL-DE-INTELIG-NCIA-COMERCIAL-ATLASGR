import { Request, Response } from 'express';
import { connection, queuesEnabled } from '../../lib/queue/redis.js';
import { logger } from '../../lib/logger.js';

const clients = new Set<{ id: string, orgId: string, res: Response }>();

type VoiceNotification = {
    type: 'voice-qualified';
    organizationId: string;
    leadId: string;
    message: string;
};

function deliverLocally(payload: VoiceNotification) {
    for (const client of clients) {
        if (client.orgId === payload.organizationId) {
            client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
    }
}

// Redis Pub/Sub é útil quando existem múltiplas instâncias/processos, mas é opcional.
// Quando ENABLE_QUEUES != true, não criamos subscriber nem tentamos conexão alguma;
// notificações SSE continuam funcionando dentro da própria instância via fallback local.
const subscriber = queuesEnabled ? connection.duplicate() : null;

if (subscriber) {
    subscriber.on('error', (err) => {
        logger.warn({ message: err.message }, 'Voice notification Redis subscriber unavailable');
    });

    void subscriber.subscribe('voice-notifications').catch((err: unknown) => {
        logger.warn(
            { message: err instanceof Error ? err.message : String(err) },
            'Could not subscribe to voice-notifications Redis channel',
        );
    });

    subscriber.on('message', (channel, message) => {
        if (channel !== 'voice-notifications') return;

        try {
            deliverLocally(JSON.parse(message) as VoiceNotification);
        } catch (err) {
            logger.warn(
                { message: err instanceof Error ? err.message : String(err) },
                'Invalid voice notification payload received from Redis',
            );
        }
    });
}

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
        const payload: VoiceNotification = {
            type: 'voice-qualified',
            organizationId,
            leadId,
            message,
        };

        if (!queuesEnabled) {
            deliverLocally(payload);
            return;
        }

        void connection.publish('voice-notifications', JSON.stringify(payload)).catch((err: unknown) => {
            logger.warn(
                { message: err instanceof Error ? err.message : String(err) },
                'Could not publish voice notification through Redis; delivering locally',
            );
            deliverLocally(payload);
        });
    },
};
