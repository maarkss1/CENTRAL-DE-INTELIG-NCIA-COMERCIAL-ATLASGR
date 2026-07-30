import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma.js';
import { toPrismaLeadStatus } from '../../../lib/enumMap';

/**
 * Ferramenta para o agente buscar o contexto completo de um Lead (empresa, contato, interações)
 */
export const getLeadContextTool = tool(
    async ({ leadId }: { leadId: string }) => {
        const lead = await prisma.lead.findUnique({
            where: { id: leadId },
            include: { company: true, contact: true }
        });

        if (!lead) {
            return "Erro: Lead não encontrado no CRM.";
        }

        const c = lead.company;
        const p = lead.contact;
        
        let context = `Lead ID: ${lead.id}\nStatus atual: ${lead.status}\n`;
        
        if (c) {
            context += `Empresa: ${c.tradeName}\n`;
            context += `Segmento: ${c.segment || 'Desconhecido'}\n`;
            context += `Porte: ${c.size || 'Desconhecido'}\n`;
            context += `Situação Cadastral: ${c.situacaoCadastral || 'Desconhecido'}\n`;
            context += `Tecnologias: ${c.technologies?.join(', ') || 'Nenhuma identificada'}\n`;
            context += `Resumo Enriquecimento: ${c.observations || 'Nenhum'}\n`;
        }

        if (p) {
            context += `\nContato: ${p.name} (${p.role || 'Cargo desconhecido'})\n`;
        }

        return context;
    },
    {
        name: 'get_lead_context',
        description: 'Obtém as informações detalhadas e dados enriquecidos de uma empresa e contato a partir do ID do Lead.',
        schema: z.object({
            leadId: z.string().describe('O ID do Lead (ex: cm0v...)'),
        }),
    }
);

/**
 * Ferramenta para o agente salvar a qualificação e o resumo no CRM
 */
export const updateLeadQualificationTool = tool(
    async ({ leadId, score, summary, status }: { leadId: string, score: number, summary: string, status: string }) => {
        try {
            await prisma.lead.update({
                where: { id: leadId },
                data: {
                    score,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    status: toPrismaLeadStatus(status as import('../../../lib/zod').LeadStatus) as any,
                    qualification: {
                        score,
                        summary,
                        evaluatedAt: new Date().toISOString()
                    }
                }
            });
            return `Lead ${leadId} qualificado com sucesso com nota ${score}. Status atualizado para ${status}.`;
        } catch (error) {
            return `Erro ao atualizar qualificação: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: 'update_lead_qualification',
        description: 'Salva a nota de qualificação (score), o resumo (summary) e o novo status (status) do Lead no banco de dados CRM.',
        schema: z.object({
            leadId: z.string().describe('O ID do Lead'),
            score: z.number().min(0).max(100).describe('A nota de propensão de 0 a 100'),
            summary: z.string().describe('O resumo de 1 ou 2 frases da análise da IA'),
            status: z.enum(['Novo_Lead', 'Qualificacao', 'Primeiro_Contato', 'Fechado_Perdido']).describe('O novo status sugerido para o lead baseado na nota (ex: se > 70, Primeiro_Contato; senão Qualificacao ou Fechado_Perdido)'),
        }),
    }
);
