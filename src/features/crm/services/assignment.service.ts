import { connection } from '../../../lib/queue/redis.js';
import { prisma } from '../../../lib/prisma.js';

/**
 * Assigns a lead to the next available CLOSER in the organization using a round-robin strategy.
 * Relies on Redis to keep track of the last assigned index.
 */
export async function assignLeadRoundRobin(organizationId: string, leadId: string): Promise<string | null> {
    const users = await prisma.user.findMany({
        where: { organizationId, role: 'CLOSER' },
        orderBy: { createdAt: 'asc' },
    });

    if (users.length === 0) return null;

    const key = `roundrobin:${organizationId}:last_assigned_index`;
    
    // We use a simple INCR command. Since INCR creates the key starting at 1 if it doesn't exist,
    // we subtract 1 so that the first assignment uses index 0.
    // This avoids race conditions between concurrent requests.
    const counter = await connection.incr(key);
    const nextIndex = Math.abs(counter - 1) % users.length;

    const assignedUserId = users[nextIndex].id;

    await prisma.lead.update({
        where: { id: leadId },
        data: { owner: assignedUserId },
    });

    return assignedUserId;
}
