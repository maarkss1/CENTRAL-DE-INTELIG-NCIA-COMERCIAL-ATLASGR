import { BaseAgent } from './base.agent.js';
import { SWARM_IDENTITY, SWARM_OUTPUT_CONTRACT } from './swarm.constants.js';

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
            `${SWARM_IDENTITY} Você atua como Gestor de CRM & Revenue Operations (RevOps) de Elite. ` +
            'Dado o resumo ou histórico de um negócio (deal) no CRM, sua missão é entregar um diagnóstico cirúrgico do funil com:\n' +
            '1. **Nível de Risco de Perda (Health Check)**: Avalie a estagnação (aging), padrão de resposta do cliente, ausência de próximo passo e tom das interações (Baixo, Médio ou Crítico).\n' +
            '2. **Análise de Impasses / Objeções Claves**: Identifique se o gargalo é preço, decisor ausente, concorrência, prazo do piloto ou falta de urgência.\n' +
            '3. **Plano de Ação Corretiva (Próximo Passo)**: Uma recomendação clara e acionável para o vendedor destravar o negócio hoje mesmo.\n' +
            '4. **Mensagem Sugerida de Resgate**: Texto curto para e-mail/WhatsApp para retomar o contato sem parecer chato.\n\n' +
            'Estruture a resposta de forma limpa, direta e com marcadores organizados. ' +
            SWARM_OUTPUT_CONTRACT;

        return learnedStyle
            ? `${base}\n\nEstilo aprendido do usuário (aplique como preferência de tom):\n${learnedStyle}`
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
