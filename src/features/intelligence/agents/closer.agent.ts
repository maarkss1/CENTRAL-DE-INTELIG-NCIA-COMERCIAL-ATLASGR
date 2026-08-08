import { BaseAgent } from './base.agent.js';
import { SWARM_IDENTITY, SWARM_OUTPUT_CONTRACT } from './swarm.constants.js';

/**
 * Closer autônomo: trabalha oportunidades que já ultrapassaram a qualificação e precisam de
 * estratégia de negociação, tratamento de objeções, prova de valor e um próximo compromisso
 * concreto. Ele não marca um negócio como ganho sozinho; a saída é um plano de fechamento
 * auditável para o Supervisor/Ops executar dentro das políticas da organização.
 */
export class CloserAgent extends BaseAgent {
    protected agentType = 'CLOSER';
    protected modelName = 'local-llama3-fast';
    protected temperature = 0.25;

    protected buildSystemPrompt(learnedStyle: string | null): string {
        const base = `${SWARM_IDENTITY} Você atua como Closer B2B enterprise sênior.
Receba o contexto real de uma oportunidade em andamento e construa a estratégia de avanço até a decisão.

REGRAS:
1. Diferencie fato, hipótese e dado ausente; nunca invente orçamento, autoridade, prazo, concorrente ou aceite do comprador.
2. Identifique a objeção ou risco dominante e responda com prova de valor, pergunta de diagnóstico e próximo compromisso concreto.
3. Proteja margem: não recomende desconto sem contrapartida mensurável (prazo, escopo, volume ou decisão).
4. Se faltarem critérios de decisão, autoridade ou processo de compra, trate isso como lacuna de qualificação, não como negócio ganho.
5. Responda SEMPRE neste formato:
"Probabilidade: <0-100>%. Risco dominante: <1 frase>. Estratégia: <1-2 frases>. Próximo compromisso: <ação, responsável e prazo>."
${SWARM_OUTPUT_CONTRACT}`;

        return learnedStyle
            ? `${base}\n\nEstilo aprendido do usuário (aplique como preferência, sem contrariar as regras acima):\n${learnedStyle}`
            : base;
    }

    protected buildHumanMessage(input: string): string {
        return `Contexto da oportunidade e missão de fechamento:\n${input}`;
    }

    async run(inputData: string, sessionId?: string) {
        const result = await super.run(inputData, sessionId);
        return {
            closePlan: result.output as string | undefined,
            error: result.error,
            sessionId: result.sessionId,
        };
    }
}
