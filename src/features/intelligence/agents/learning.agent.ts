import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getAiModel } from '../../../lib/ai/gateway.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import type { Prisma } from '@prisma/client';

// AgentMemory não tem colunas dedicadas para "perfil de aprendizado", mas sessionId+agentType já
// bastam pra guardar um registro por (tenant, ator) sem precisar de migração nova.
function learningProfileSessionId(tenantId: string, actorId: string): string {
    return `learning-profile:${tenantId}:${actorId}`;
}

interface LearningProfilePayload {
    guidelines: string;
    updatedAt: string;
}

/**
 * Lê as diretrizes de estilo aprendidas para um (tenant, ator), se existirem.
 * Usado pelos agentes SDR/BDR/CRM para incorporar o estilo do usuário no system prompt.
 * Best-effort: falhas de leitura nunca devem interromper o agente que está consultando.
 */
export async function getLearningProfile(tenantId: string, actorId: string): Promise<string | null> {
    try {
        const memory = await prisma.agentMemory.findFirst({
            where: {
                sessionId: learningProfileSessionId(tenantId, actorId),
                agentType: 'LEARNING_PROFILE',
                organizationId: tenantId,
            },
            orderBy: { createdAt: 'desc' },
        });
        const payload = memory?.messages as unknown as LearningProfilePayload | undefined;
        return payload?.guidelines?.trim() || null;
    } catch (error) {
        logger.warn({ err: error, tenantId, actorId }, 'Failed to read learning profile');
        return null;
    }
}

/**
 * LearningAgent (Self-Reflection)
 * Este agente roda em background para observar as ações manuais do usuário (via AuditLog)
 * e sintetizar um "Manual de Estilo" dinâmico.
 * Esse manual (Few-Shot) é persistido em AgentMemory e injetado nos agentes SDR/BDR/CRM
 * (via getLearningProfile) para que eles ajam de acordo com o estilo do usuário humano.
 */
export class LearningAgent {
    async reflectAndLearn(actorId: string, tenantId: string) {
        try {
            // Busca as últimas 50 ações manuais do usuário (ex: mudanças de lead, qualificações, e-mails enviados)
            const recentActions = await prisma.auditLog.findMany({
                where: { actorId, tenantId },
                orderBy: { timestamp: 'desc' },
                take: 50,
            });

            if (recentActions.length === 0) {
                return null;
            }

            const actionsText = recentActions.map(a => 
                `[Ação: ${a.action}] Entidade: ${a.entity} | Detalhes: ${JSON.stringify(a.details)}`
            ).join('\n');

            const model = getAiModel('local-llama3-fast', 0.1, 'learning-agent');
            const systemPrompt = new SystemMessage(
                `Você é o Agente de Reflexão (Learning Agent) da Atlas.
Sua missão é analisar o log de ações manuais de um usuário humano no CRM e deduzir o "Estilo de Qualificação e Vendas" dele.
Descubra padrões: Como ele classifica um lead? O que faz ele descartar um lead? Que tom ele usa?
Gere um parágrafo denso e direto contendo as DIRETRIZES DE ESTILO APRENDIDAS. Estas diretrizes serão injetadas no Agente SDR autônomo para clonar o comportamento do usuário.`
            );

            const response = await model.invoke([
                systemPrompt,
                new HumanMessage(`Ações manuais recentes do usuário no CRM:\n${actionsText}`)
            ]);

            const learnedStyle = response.content.trim();

            // Persiste as diretrizes aprendidas em AgentMemory para os outros agentes carregarem
            // dinamicamente via getLearningProfile (um registro por tenant+ator, sobrescrito a cada reflexão).
            await this.persistProfile(tenantId, actorId, learnedStyle);

            logger.info({ actorId, tenantId }, 'LearningAgent updated user style guidelines successfully.');

            return learnedStyle;

        } catch (error) {
            logger.error({ err: error }, 'LearningAgent failed to reflect and learn');
            return null;
        }
    }

    private async persistProfile(tenantId: string, actorId: string, guidelines: string): Promise<void> {
        const sessionId = learningProfileSessionId(tenantId, actorId);
        const payload: LearningProfilePayload = { guidelines, updatedAt: new Date().toISOString() };
        try {
            const existing = await prisma.agentMemory.findFirst({ where: { sessionId, organizationId: tenantId } });
            if (existing) {
                await prisma.agentMemory.update({
                    where: { id: existing.id },
                    data: { messages: payload as unknown as Prisma.InputJsonValue },
                });
            } else {
                await prisma.agentMemory.create({
                    data: {
                        sessionId,
                        agentType: 'LEARNING_PROFILE',
                        organizationId: tenantId,
                        messages: payload as unknown as Prisma.InputJsonValue,
                    },
                });
            }
        } catch (error) {
            logger.error({ err: error, tenantId, actorId }, 'Failed to persist learning profile');
        }
    }
}
