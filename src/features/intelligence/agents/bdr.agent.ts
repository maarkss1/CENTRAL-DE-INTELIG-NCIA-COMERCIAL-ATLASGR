import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';

const GraphState = Annotation.Root({
    input: Annotation<string>(),
    qualification: Annotation<string>(),
});

/**
 * BDR (Business Development Rep) autônomo: dado um resumo bruto de lead outbound, qualifica o fit
 * e já rascunha a linha de abordagem inicial — mesmo padrão de nó único + LLM usado em
 * `graphs/leadQualification.ts`, reaproveitando o gateway central (retry/fallback/log de custo).
 */
export class BDRAgent {
    async run(inputData: string) {
        const graph = new StateGraph(GraphState)
            .addNode('qualify', async (state) => {
                const model = getAiModel('gemini-flash', 0.4, 'bdr-agent');
                const startTime = Date.now();

                const response = await model.invoke([
                    new SystemMessage(
                        'Você é um BDR sênior da Atlas (SaaS de gestão de risco/torre de controle para logística B2B no Brasil). Dado um resumo bruto de lead outbound, avalie o fit em uma frase objetiva e sugira a melhor linha de abertura para o primeiro contato. Baseie-se SOMENTE no que foi informado — nunca invente dados da empresa. Responda em texto corrido, direto, sem markdown, no formato: "Fit: <avaliação em 1 frase>. Abertura sugerida: <1 frase de abertura>".',
                    ),
                    new HumanMessage(`Resumo do lead: ${state.input}`),
                ]);

                await logAiUsage({
                    model: response.response_metadata.model,
                    usage: response.response_metadata.tokenUsage,
                    latencyMs: Date.now() - startTime,
                });

                return { qualification: response.content.trim() || `Qualified: ${state.input}` };
            })
            .addEdge(START, 'qualify')
            .addEdge('qualify', END);

        const compiled = graph.compile();
        const result = await compiled.invoke({ input: inputData });

        return result;
    }
}
