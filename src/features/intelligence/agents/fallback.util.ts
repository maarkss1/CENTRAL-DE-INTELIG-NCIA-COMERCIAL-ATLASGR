import { ChatOpenAI } from '@langchain/openai';

function buildCandidates(modelName: string): ChatOpenAI[] {
    return [
        new ChatOpenAI({
            modelName,
            temperature: 0,
            apiKey: process.env.GROQ_API_KEY || 'missing-key',
            maxRetries: 3,
            timeout: 30_000,
            configuration: { baseURL: 'https://api.groq.com/openai/v1' }
        }),
        new ChatOpenAI({
            modelName: 'gpt-4o-mini',
            temperature: 0,
            apiKey: process.env.OPENAI_API_KEY || 'missing-key',
            maxRetries: 3,
            timeout: 30_000
        }),
    ];
}

/**
 * Monta o modelo primário (Groq) com fallback para OpenAI, pulando qualquer provedor sem API key
 * configurada. Quando `tools` é informado, cada candidato (primário e fallbacks) recebe bindTools
 * antes do fallback ser montado — sem isso, um fallback assumindo o lugar do primário no meio de
 * uma execução perderia acesso às ferramentas do agente.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildModelWithFallback(modelName: string, tools?: any[]) {
    const candidates = buildCandidates(modelName);
    const available = candidates.filter(llm => llm.apiKey !== 'missing-key');

    const bind = (llm: ChatOpenAI) => (tools ? llm.bindTools(tools) : llm);

    if (available.length === 0) return bind(candidates[0]);

    const [primary, ...fallbacks] = available;
    const primaryBound = bind(primary);

    if (fallbacks.length === 0) return primaryBound;

    return primaryBound.withFallbacks({ fallbacks: fallbacks.map(bind) });
}

// Mantido para não obrigar troca simultânea de todos os call sites — delega para
// buildModelWithFallback, que agora cobre os dois casos (com e sem tools) num único lugar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildModelWithFallbackAndTools(modelName: string, tools: any[]) {
    return buildModelWithFallback(modelName, tools);
}
