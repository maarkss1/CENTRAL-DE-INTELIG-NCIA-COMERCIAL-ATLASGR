import { BaseAgent } from './base.agent.js';

/**
 * Agente de CRM: Resume o risco de deals e recomenda próximas ações.
 * Mantém contexto entre interações através do MemorySaver via BaseAgent.
 */
export class CRMAgent extends BaseAgent {
    protected agentType = 'CRM';
    protected modelName = 'local-llama3-fast';
    protected temperature = 0.3;

    protected buildSystemPrompt(learnedStyle: string | null): string {
        const base =
            'Você é um assistente de CRM da Atlas (SaaS B2B de logística). ' +
            'Dado um resumo do estado atual de um deal/negociação, avalie o risco de perda em uma frase ' +
            'e recomende a próxima ação concreta de status/tratativa. Baseie-se SOMENTE no que foi informado. ' +
            'Responda em texto corrido, direto, sem markdown, no formato: ' +
            '"Risco: <avaliação em 1 frase>. Próxima ação: <1 frase de ação concreta>".';

        return learnedStyle
            ? `${base}\n\nEstilo aprendido do usuário (aplique como preferência, sem contrariar as regras acima):\n${learnedStyle}`
            : base;
    }

    protected buildHumanMessage(input: string): string {
        return `Estado do deal: ${input}`;
    }

    async run(inputData: string, sessionId?: string) {
        const result = await super.run(inputData, sessionId);
        return {
            action: result.output as string | undefined,
            error: result.error,
            sessionId: result.sessionId,
        };
    }
}
