import { AgentService } from '../services/agent.service.js';
import { prisma } from '../../../lib/prisma.js';
import { vectorService } from '../services/vector.service.js';

export class SDRAgent extends AgentService {
    protected agentType = 'SDR_OUTBOUND';

    protected getSystemPrompt(): string {
        return `Você é um Sales Development Representative (SDR) hiper focado em prospectar B2B. 
Seu objetivo é analisar os dados de uma empresa e seus contatos para criar "Icebreakers" 
(mensagens quebra-gelo) altamente personalizadas que não pareçam escritas por IA.`;
    }

    public async draftEmailForLead(leadId: string, tenantId: string): Promise<void> {
        // Buscar informações ricas do lead para injetar no prompt
        const lead = await prisma.lead.findUnique({
            where: { id: leadId, organizationId: tenantId },
            include: { company: true, contact: true }
        });

        if (!lead || !lead.contact || !lead.company) return;

        // 1. Busca Semântica na Base de Conhecimento (RAG)
        // O Agente SDR busca se existe algum playbook, roteiro ou case de sucesso
        // que seja similar ao segmento e características desta empresa.
        const searchQuery = `Estratégia de prospecção e dores para segmento ${lead.company.segment || 'geral'}`;
        const similarKnowledge = await vectorService.searchSimilar(searchQuery, 2);
        
        let ragContext = '';
        if (similarKnowledge.length > 0) {
            ragContext = similarKnowledge.map(k => `- ${k.content}`).join('\n');
        } else {
            ragContext = 'Sem contexto adicional no playbook.';
        }

        const promptContext = `
Dados do prospect:
- Nome: ${lead.contact.name}
- Cargo: ${lead.contact.role || 'Desconhecido'}
- Empresa: ${lead.company.legalName}
- Segmento: ${lead.company.segment || 'Desconhecido'}
- Resumo de Qualificação: ${JSON.stringify(lead.qualification)}

Histórico/Contexto da Base de Conhecimento Atlas (Playbooks e Cases):
${ragContext}

Escreva um e-mail curto de primeiro contato. Foco em dor/gatilho baseado no segmento e no contexto do Playbook fornecido acima.
`;

        const generatedEmail = await this.processMessage(promptContext);

        // Salvar a ação na tabela de pendências para o SDR humano aprovar
        await prisma.aIPendingAction.create({
            data: {
                entity: 'Lead',
                action: 'send_email',
                payload: {
                    leadId,
                    to: lead.contact.email,
                    subject: `Ideia para a ${lead.company.legalName}`,
                    body: generatedEmail
                }
            }
        });
    }
}
