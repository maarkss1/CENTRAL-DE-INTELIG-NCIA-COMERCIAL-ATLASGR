import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';

const GraphState = Annotation.Root({
    input: Annotation<string>(),
    action: Annotation<string>(),
});

/**
 * Agente de CRM: dado um resumo do estado atual de um deal, resume o risco e recomenda a próxima
 * ação de status — mesmo padrão de nó único + LLM usado em `graphs/leadQualification.ts`.
 */
export class CRMAgent {
    async run(inputData: string) {
        const graph = new StateGraph(GraphState)
            .addNode('updateStatus', async (state) => {
                const model = getAiModel('gemini-flash', 0.3, 'crm-agent');
                const startTime = Date.now();

                const response = await model.invoke([
                    new SystemMessage(
                        'Você é um assistente de CRM da Atlas (SaaS B2B de logística). Dado um resumo do estado atual de um deal/negociação, avalie o risco de perda em uma frase e recomende a próxima ação concreta de status/tratativa. Baseie-se SOMENTE no que foi informado. Responda em texto corrido, direto, sem markdown, no formato: "Risco: <avaliação em 1 frase>. Próxima ação: <1 frase de ação concreta>".',
                    ),
                    new HumanMessage(`Estado do deal: ${state.input}`),
                ]);

                await logAiUsage({
                    model: response.response_metadata.model,
                    usage: response.response_metadata.tokenUsage,
                    latencyMs: Date.now() - startTime,
                });

                return { action: response.content.trim() || `Status updated for: ${state.input}` };
            })
            .addEdge(START, 'updateStatus')
            .addEdge('updateStatus', END);

        const compiled = graph.compile();
        const result = await compiled.invoke({ input: inputData });

        return result;
    }
}
