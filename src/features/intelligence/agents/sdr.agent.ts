import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { prisma } from '../../../lib/prisma.js';
import { getLeadContextTool, updateLeadQualificationTool } from '../tools/crmTools.js';
import { searchPlaybookTool } from '../tools/playbookTool.js';
import { HumanMessage } from '@langchain/core/messages';

// Requer OPENAI_API_KEY configurada
const llm = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0,
});

const tools = [getLeadContextTool, searchPlaybookTool, updateLeadQualificationTool];

export class SDRAgent {
    async run(leadId: string, sessionId?: string) {
        const agent = createReactAgent({
            llm,
            tools,
            messageModifier: `Você é um SDR Autônomo da AtlasGR. 
Sua missão é qualificar um lead avaliando seu fit com o ICP (Ideal Customer Profile) da empresa.
1. Use a ferramenta 'get_lead_context' para pegar os dados do Lead usando o ID fornecido.
2. Se tiver dúvidas sobre os critérios de qualificação, use a ferramenta 'search_playbook' com termos como 'ICP da Atlas' ou 'como qualificar transportadoras'.
3. Analise friamente os dados coletados. Transportadoras e embarcadores com mais frota e mais faturamento costumam ter nota maior.
4. Ao final, use OBRIGATORIAMENTE a ferramenta 'update_lead_qualification' com sua nota final (0 a 100), um status sugerido ('Primeiro_Contato' se score > 70, caso contrário 'Qualificacao'), e um resumo curto com a justificativa.
Trabalhe de forma autônoma, chamando as ferramentas quantas vezes for necessário, até chamar a 'update_lead_qualification' e finalizar a sua tarefa.`
        });

        const inputs = {
            messages: [new HumanMessage(`Por favor, inicie a análise e qualificação do lead com o ID: ${leadId}`)]
        };

        const result = await agent.invoke(inputs);

        const sid = sessionId || `session-${leadId}-${Date.now()}`;
        
        // Salvar a trilha de pensamento e memória no banco para auditoria
        await this.updateMemory(sid, result.messages.map((m: any) => ({
            role: m._getType(),
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            tool_calls: m.tool_calls || undefined
        })));

        return { success: true, sessionId: sid };
    }

    private async updateMemory(sessionId: string, messages: any) {
        await prisma.agentMemory.create({
            data: {
                sessionId,
                agentType: 'SDR',
                messages
            }
        });
    }
}
