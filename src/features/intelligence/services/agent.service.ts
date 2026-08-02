import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { getTenantId } from '../../../lib/async-context.js';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Prisma } from '@prisma/client';

export interface AgentMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export abstract class AgentService {
    protected abstract agentType: string;

    // organizationId é opcional no construtor porque nem toda subclasse roda dentro de uma
    // requisição HTTP (ex: SDROutboundDraftAgent é instanciado a partir de um worker do BullMQ,
    // onde getTenantId() — que depende do AsyncLocalStorage populado por authenticateToken — não
    // tem valor). Quem sabe o tenant no momento da criação (o worker) deve passá-lo explicitamente;
    // quem roda dentro de uma requisição pode omitir e cair no fallback do contexto.
    constructor(protected sessionId: string, private organizationId?: string) {}

    private resolveOrganizationId(): string | undefined {
        return this.organizationId ?? getTenantId();
    }

    protected async loadMemory(): Promise<AgentMessage[]> {
        const memory = await prisma.agentMemory.findFirst({
            where: { sessionId: this.sessionId, agentType: this.agentType, organizationId: this.resolveOrganizationId() },
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
                organizationId: this.resolveOrganizationId(),
                messages: messages as unknown as Prisma.InputJsonValue,
            }
        });
    }

    protected async callLLM(messages: AgentMessage[]): Promise<string> {
        logger.info({ agentType: this.agentType, messageCount: messages.length }, 'Calling LLM via LiteLLM...');
        
        const model = getAiModel('local-llama3', 0.7, this.agentType);
        const startTime = Date.now();

        try {
            const langChainMessages = messages.map((message) => {
                if (message.role === 'system') return new SystemMessage(message.content);
                if (message.role === 'assistant') return new AIMessage(message.content);
                return new HumanMessage(message.content);
            });
            const result = await model.invoke(langChainMessages);
            await logAiUsage({
                model: result.response_metadata.model,
                usage: result.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
            });
            return result.content;
        } catch (error) {
            logger.error({ err: error, agentType: this.agentType }, 'LLM call failed');
            throw new Error(`Falha ao gerar mensagem pelo agente ${this.agentType}`, { cause: error });
        }
    }

    public async processMessage(content: string): Promise<string> {
        const history = await this.loadMemory();
        
        const priorConversation = history.filter((message) => message.role !== 'system').slice(-20);
        const boundedHistory: AgentMessage[] = [
            { role: 'system', content: this.getSystemPrompt() },
            ...priorConversation,
            { role: 'user', content },
        ];
        
        const responseContent = await this.callLLM(boundedHistory);
        boundedHistory.push({ role: 'assistant', content: responseContent });
        
        await this.saveMemory(boundedHistory);
        return responseContent;
    }

    protected abstract getSystemPrompt(): string;
}
