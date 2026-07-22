import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';

export interface AgentMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export abstract class AgentService {
    protected abstract agentType: string;

    constructor(protected sessionId: string) {}

    protected async loadMemory(): Promise<AgentMessage[]> {
        const memory = await prisma.agentMemory.findFirst({
            where: { sessionId: this.sessionId, agentType: this.agentType },
            orderBy: { createdAt: 'desc' }
        });

        if (!memory) return [];
        return memory.messages as unknown as AgentMessage[];
    }

    protected async saveMemory(messages: AgentMessage[]): Promise<void> {
        await prisma.agentMemory.create({
            data: {
                sessionId: this.sessionId,
                agentType: this.agentType,
                messages: messages as any
            }
        });
    }

    protected async callLLM(messages: AgentMessage[]): Promise<string> {
        // Integração genérica, num ambiente real seria chamado a OpenAI/Gemini via litellm ou SDK
        logger.info({ agentType: this.agentType, messageCount: messages.length }, 'Calling LLM...');
        
        // Simulação do retorno do LLM
        return "Mensagem gerada pelo agente " + this.agentType;
    }

    public async processMessage(content: string): Promise<string> {
        const history = await this.loadMemory();
        
        if (history.length === 0) {
            history.push({ role: 'system', content: this.getSystemPrompt() });
        }
        
        history.push({ role: 'user', content });
        
        const responseContent = await this.callLLM(history);
        history.push({ role: 'assistant', content: responseContent });
        
        await this.saveMemory(history);
        return responseContent;
    }

    protected abstract getSystemPrompt(): string;
}
