import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { getAiModel } from '../../../lib/ai/gateway.js';

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
        logger.info({ agentType: this.agentType, messageCount: messages.length }, 'Calling LLM via LiteLLM...');
        
        const model = getAiModel('gemini-pro', 0.7, this.agentType);
        
        try {
            const result = await model.invoke(messages.map(m => ({
                _getType: () => m.role,
                content: m.content
            })) as any);
            return result.content;
        } catch (error) {
            logger.error({ err: error, agentType: this.agentType }, 'LLM call failed');
            return "Erro ao gerar mensagem pelo agente " + this.agentType;
        }
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
