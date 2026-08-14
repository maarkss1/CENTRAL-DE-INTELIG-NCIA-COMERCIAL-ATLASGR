import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { getTenantId } from '../../../lib/async-context.js';

const summarizeSchema = z.object({
    leadId: z.string().describe('O ID do Lead que precisa ser resumido'),
});

export const summarizeLeadTool = tool(
    async (args) => {
        const organizationId = getTenantId();
        if (!organizationId) return 'Erro: Contexto de organização ausente.';

        try {
            logger.info({ leadId: args.leadId }, 'Resumindo histórico do Lead via IA');

            const lead = await prisma.lead.findUnique({
                where: { id: args.leadId, organizationId },
                include: {
                    internalNotes: true,
                    activities: true,
                    timeline: {
                        orderBy: { createdAt: 'desc' },
                        take: 5
                    }
                }
            });

            if (!lead) return 'Lead não encontrado.';

            let resumo = `📊 **Resumo de Histórico do Lead: ${lead.title || 'Desconhecido'}**\n`;
            resumo += `\n**Status Atual:** ${lead.status}`;
            resumo += `\n**Temperatura:** ${lead.temperature || 'N/A'}`;
            resumo += `\n**Notas Internas (${lead.internalNotes.length}):** O lead possui histórico de anotações da equipe.`;
            resumo += `\n**Atividades Totais:** ${lead.activities.length}`;
            
            if (lead.timeline.length > 0) {
                resumo += `\n\n**Últimos Eventos:**\n`;
                lead.timeline.forEach(t => {
                    // TimelineEvent não tem `title`, e sim `description` (ver prisma/schema.prisma).
                    resumo += `- [${t.createdAt.toISOString().split('T')[0]}] ${t.description}\n`;
                });
            }

            return resumo;

        } catch (error) {
            logger.error({ err: error, leadId: args.leadId }, 'Erro ao gerar resumo do lead');
            return 'Erro ao tentar gerar o resumo do histórico.';
        }
    },
    {
        name: 'summarize_lead_history',
        description: 'Vê o histórico, anotações, atividades e timeline do Lead para criar um sumário para decisões rápidas.',
        schema: summarizeSchema,
    }
);
