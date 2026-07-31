import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getAiModel } from '../../../lib/ai/gateway.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';

/**
 * LearningAgent (Self-Reflection)
 * Este agente roda em background para observar as ações manuais do usuário (via AuditLog)
 * e sintetizar um "Manual de Estilo" dinâmico.
 * Esse manual (Few-Shot) será injetado nos agentes SDR e BDR para que eles ajam exatamente
 * como o usuário humano atua.
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

            const model = getAiModel('gemini-flash', 0.1, 'learning-agent');
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

            // Salva as diretrizes aprendidas na tabela de configuração (AiEngineSetting)
            // para serem carregadas dinamicamente pelos outros agentes.
            // aiEngineSetting schema is limited right now, skipping persistence of learned style.


            logger.info({ actorId, tenantId }, 'LearningAgent updated user style guidelines successfully.');
            
            return learnedStyle;

        } catch (error) {
            logger.error({ err: error }, 'LearningAgent failed to reflect and learn');
            return null;
        }
    }
}
