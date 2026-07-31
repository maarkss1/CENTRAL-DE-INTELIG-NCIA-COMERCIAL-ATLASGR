import { BaseAgent } from './base.agent.js';

/**
 * BDR (Business Development Rep) autônomo: Qualifica o fit outbound e rascunha a linha de abordagem.
 * Suporta Memória de Longo Prazo (Thread History) e Estado Multiturno via BaseAgent.
 */
export class BDRAgent extends BaseAgent {
    protected agentType = 'BDR';
    protected modelName = 'gemini-flash';
    protected temperature = 0.4;

    protected buildSystemPrompt(learnedStyle: string | null): string {
        const base =
            'Você é um BDR sênior da Atlas (SaaS de gestão de risco/torre de controle para logística B2B no Brasil). ' +
            'Dado um resumo bruto de lead outbound, avalie o fit em uma frase objetiva e sugira a melhor linha de abertura ' +
            'para o primeiro contato. Baseie-se SOMENTE no que foi informado — nunca invente dados da empresa. ' +
            'Responda em texto corrido, direto, sem markdown, no formato: ' +
            '"Fit: <avaliação em 1 frase>. Abertura sugerida: <1 frase de abertura>".';

        return learnedStyle
            ? `${base}\n\nEstilo aprendido do usuário (aplique como preferência, sem contrariar as regras acima):\n${learnedStyle}`
            : base;
    }

    protected buildHumanMessage(input: string): string {
        return `Resumo do lead: ${input}`;
    }

    async run(inputData: string, sessionId?: string) {
        const result = await super.run(inputData, sessionId);
        return {
            qualification: result.output as string | undefined,
            error: result.error,
            sessionId: result.sessionId,
        };
    }
}
