import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getAiModel } from '../../../lib/ai/gateway.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';

export class LearningAgent {
    async reflectAndLearn(userId: string, tenantId: string) {
        try {
            const recentActions = await prisma.auditLog.findMany({
                where: { actorId: userId, tenantId },
                orderBy: { timestamp: 'desc' },
                take: 50,
            });

            if (recentActions.length === 0) {
                return null;
            }

            const actionsText = recentActions.map(a => 
                `[Ação: ${a.action}] Entidade: ${a.entity} | Detalhes: ${JSON.stringify(a.details)}`
            ).join('\n');

            const model = getAiModel('gemini-flash', 0.1, 'learning-agent');
            const systemPrompt = new SystemMessage(
                `Você é o Agente de Reflexão (Learning Agent) da Atlas.
Sua missão é analisar o log de ações manuais de um usuário humano no CRM e deduzir o "Estilo de Qualificação e Vendas" dele.
Gere um parágrafo denso e direto contendo as DIRETRIZES DE ESTILO APRENDIDAS.`
            );

            const response = await model.invoke([
                systemPrompt,
                new HumanMessage(`Ações manuais recentes:\n${actionsText}`)
            ]);

            const learnedStyle = response.content.trim();

            // Store it globally per toolKey as per schema
            await prisma.aiEngineSetting.upsert({
                where: { toolKey: `learned_user_style_${userId}` },
                create: {
                    toolKey: `learned_user_style_${userId}`,
                    provider: 'google',
                    model: 'gemini-flash',
                    temperature: 0.1,
                },
                update: {
                    temperature: 0.1,
                }
            });

            logger.info({ userId, tenantId }, 'LearningAgent updated user style guidelines successfully.');
            
            return learnedStyle;

        } catch (error) {
            logger.error({ err: error }, 'LearningAgent failed to reflect and learn');
            return null;
        }
    }
}
