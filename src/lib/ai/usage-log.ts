import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';
import { requestContext } from '../async-context.js';
import { estimateCostUsd, type AiUsageLogInput } from './gateway-core.js';

/**
 * Persiste consumo de IA respeitando RLS.
 *
 * Chamadas com tenant usam o fluxo normal. Telemetria interna sem tenant usa INSERT parametrizado
 * sem RETURNING. A policy do banco só aceita esse caso quando a conexão é o papel backend
 * `prospector_app` e não existe app.current_tenant_id ativo.
 *
 * Não usamos app.bypass_rls nem GUC temporário: além de reduzir superfície de privilégio, isso
 * evita depender da afinidade de conexão de transações interativas do Prisma/adapter-pg.
 */
export const logAiUsage = async (input: AiUsageLogInput): Promise<void> => {
    const organizationId = requestContext.getStore()?.tenantId ?? null;
    const data = {
        model: input.model,
        tokens: input.usage.totalTokens,
        cost: estimateCostUsd(input.model, input.usage),
        latencyMs: input.latencyMs,
        promptId: input.promptId,
        organizationId,
    };

    try {
        if (organizationId) {
            await prisma.aILog.create({ data });
            return;
        }

        const id = randomUUID();
        await prisma.$executeRaw`
            INSERT INTO "AILog"
                ("id", "tokens", "cost", "latencyMs", "model", "promptId", "organizationId", "createdAt")
            VALUES
                (${id}, ${data.tokens}, ${data.cost}, ${data.latencyMs}, ${data.model}, ${data.promptId ?? null}, NULL, CURRENT_TIMESTAMP)
        `;
    } catch (error) {
        // Telemetria nunca deve derrubar a resposta útil ao usuário.
        logger.warn({ err: error, model: input.model }, 'Unable to persist AI usage log');
    }
};
