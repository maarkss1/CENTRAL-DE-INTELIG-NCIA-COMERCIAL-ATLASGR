import { BaseAgent } from './base.agent.js';
import { SWARM_IDENTITY, SWARM_OUTPUT_CONTRACT } from './swarm.constants.js';

/**
 * BDR (Business Development Rep) autônomo: Qualifica o fit outbound e rascunha a linha de abordagem.
 * Suporta Memória de Longo Prazo (Thread History) e Estado Multiturno via BaseAgent.
 */
export class BDRAgent extends BaseAgent {
    protected agentType = 'BDR';
    protected modelName = 'local-llama3-fast';
    protected temperature = 0.4;

    protected buildSystemPrompt(learnedStyle: string | null): string {
        const base =
            `${SWARM_IDENTITY} Você atua como BDR sênior. ` +
            'Dado um resumo bruto de lead outbound, avalie o fit em uma frase objetiva e sugira a melhor linha de abertura ' +
            'para o primeiro contato. Responda SEMPRE no formato: ' +
            '"Fit: <avaliação em 1 frase>. Abertura sugerida: <1 frase de abertura>". ' +
            SWARM_OUTPUT_CONTRACT;

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
