import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma.js';
import { toPrismaLeadStatus } from '../../../lib/enumMap';
import { getTenantId } from '../../../lib/async-context.js';
import { minimizePii } from '../services/guardrails.service.js';

/**
 * Ferramenta para o agente buscar o contexto completo de um Lead (empresa, contato, interações)
 */
export const getLeadContextTool = tool(
    async ({ leadId }: { leadId: string }) => {
        // Sem isto, qualquer tenant que soubesse (ou adivinhasse) um ID de Lead conseguia ler dados
        // de outra organização através deste tool — o agente SDR roda dentro do contexto da
        // requisição que o disparou, então getTenantId() aqui é o tenant de quem pediu a qualificação.
        const organizationId = getTenantId();
        if (!organizationId) {
            return "Erro: contexto de organização ausente — não é possível buscar o lead com segurança.";
        }

        const lead = await prisma.lead.findFirst({
            where: { id: leadId, organizationId },
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

        // SEC-013b: este texto vira uma ToolMessage devolvida ao LLM externo (Groq/OpenAI/Gemini)
        // dentro do loop de tool-calling do agente — sem isto, o nome real do contato ia direto pro
        // provedor. Diferente de ai.service.ts/sdr-agent.ts (chamada única, resposta reidratada no
        // fim), aqui o texto reentra num agente multi-turn: reidratar de volta exigiria rastrear o
        // token pelo estado do grafo até onde a saída final chega no humano — não coberto ainda,
        // então o pior caso hoje é "[NOME_DO_CONTATO]" aparecer cru se a IA ecoar o token de volta
        // no resumo de qualificação, nunca o nome real vazando pro provedor externo.
        if (p) {
            context = minimizePii(context, [{ token: '[NOME_DO_CONTATO]', value: p.name }]).text;
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
        const organizationId = getTenantId();
        if (!organizationId) {
            return 'Erro ao atualizar qualificação: contexto de organização ausente.';
        }
        try {
            // updateMany (não update) porque o where precisa filtrar por organizationId além do id —
            // sem isso, o agente de um tenant conseguia sobrescrever score/status do lead de outro
            // tenant só sabendo o ID (o mesmo tipo de IDOR corrigido em get_lead_context acima).
            const { count } = await prisma.lead.updateMany({
                where: { id: leadId, organizationId },
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
            if (count === 0) {
                return `Erro: Lead ${leadId} não encontrado no CRM.`;
            }
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
