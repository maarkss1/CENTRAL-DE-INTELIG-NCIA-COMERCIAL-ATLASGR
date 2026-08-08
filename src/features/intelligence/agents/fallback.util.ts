import { ChatOpenAI } from '@langchain/openai';

export function buildModelWithFallback(modelName: string) {
    const groqLlm = new ChatOpenAI({
        modelName: modelName,
        temperature: 0,
        apiKey: process.env.GROQ_API_KEY || 'missing-key',
        maxRetries: 3,
        timeout: 30_000,
        configuration: { baseURL: 'https://api.groq.com/openai/v1' }
    });

    const geminiLlm = new ChatOpenAI({
        modelName: 'gemini-1.5-flash',
        temperature: 0,
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || 'missing-key',
        maxRetries: 3,
        timeout: 30_000,
        configuration: { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' }
    });

    const openaiLlm = new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        temperature: 0,
        apiKey: process.env.OPENAI_API_KEY || 'missing-key',
        maxRetries: 3,
        timeout: 30_000
    });

    const llms = [groqLlm, geminiLlm, openaiLlm].filter(llm => llm.apiKey !== 'missing-key');
    
    if (llms.length === 0) return groqLlm;

    const primary = llms[0];
    const fallbacks = llms.slice(1);

    if (fallbacks.length > 0) {
        return primary.withFallbacks({ fallbacks });
    }

    return primary;
}

export function buildModelWithFallbackAndTools(modelName: string, tools: any[]) {
    const groqLlm = new ChatOpenAI({
        modelName: modelName,
        temperature: 0,
        apiKey: process.env.GROQ_API_KEY || 'missing-key',
        maxRetries: 3,
        timeout: 30_000,
        configuration: { baseURL: 'https://api.groq.com/openai/v1' }
    });

    const geminiLlm = new ChatOpenAI({
        modelName: 'gemini-1.5-flash',
        temperature: 0,
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || 'missing-key',
        maxRetries: 3,
        timeout: 30_000,
        configuration: { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' }
    });

    const openaiLlm = new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        temperature: 0,
        apiKey: process.env.OPENAI_API_KEY || 'missing-key',
        maxRetries: 3,
        timeout: 30_000
    });

    const llms = [groqLlm, geminiLlm, openaiLlm].filter(llm => llm.apiKey !== 'missing-key');
    
    if (llms.length === 0) return groqLlm.bindTools(tools);

    const primary = llms[0];
    const fallbacks = llms.slice(1);

    const primaryWithTools = primary.bindTools(tools);
    if (fallbacks.length > 0) {
        const fallbacksWithTools = fallbacks.map(f => f.bindTools(tools));
        return primaryWithTools.withFallbacks({ fallbacks: fallbacksWithTools });
    }

    return primaryWithTools;
}
