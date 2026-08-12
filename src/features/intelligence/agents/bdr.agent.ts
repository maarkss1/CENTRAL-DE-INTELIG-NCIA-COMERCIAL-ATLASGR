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
            `${SWARM_IDENTITY} Você atua como BDR Especialista em Prospecção Outbound B2B de Alta Performance. ` +
            'Dado o resumo ou dados de uma empresa/lead alvo, sua missão é entregar um diagnóstico comercial completo com:\n' +
            '1. **Fit Score & Perfil**: Avaliação de aderência da empresa ao ICP (porte, localização, risco da carga e sinal de mercado).\n' +
            '2. **Gatilho de Abordagem (Hook)**: Fato relevante, dor típica da categoria ou ângulo estratégico de abertura.\n' +
            '3. **Cold Message (WhatsApp/E-mail)**: Uma mensagem de prospecção curta (máx. 3-4 parágrafos), altamente personalizada, fada para o tom executivo (Diretor/Gerente de Logística ou GR), sem jargões corporativos vazios.\n' +
            '4. **Pergunta de Qualificação (CTA/SPIN)**: Uma pergunta de encerramento focada em validar se eles sofrem com sinistros, custos de gerenciamento de risco ou falta de visibilidade em tempo real.\n\n' +
            'Estruture a resposta de forma limpa e direta com marcadores claros. ' +
            SWARM_OUTPUT_CONTRACT;

        return learnedStyle
            ? `${base}\n\nEstilo aprendido do usuário (aplique como preferência de tom):\n${learnedStyle}`
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
