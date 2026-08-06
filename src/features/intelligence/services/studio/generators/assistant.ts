import type { StudioGenerationRequest } from '../schema.js';
import { SYSTEM_RULES, invokeText } from '../shared.js';

export async function generateAssistant(request: Extract<StudioGenerationRequest, { kind: 'assistant' }>) {
    const modeInstruction = request.inputs.mode === 'internal'
        ? 'Priorize o contexto interno fornecido. Se ele não sustentar a resposta, explicite a lacuna.'
        : 'Responda com conhecimento geral estável, sem fingir acesso a fontes externas em tempo real.';
    const prompt = `${SYSTEM_RULES}

Atue como copiloto comercial de ${request.brand.name}.
Contexto da marca: ${request.brand.description}
Modo: ${modeInstruction}
Contexto interno disponível:
${request.inputs.localContext || 'Nenhum contexto interno compatível foi encontrado.'}

Pergunta do usuário:
${request.inputs.question}

Não há ferramenta de navegação web conectada nesta conversa. Nunca afirme ter consultado sites, CNPJ, notícias,
LinkedIn ou dados atuais. Quando a pergunta depender de informação externa ou recente, diga isso objetivamente
e sugira qual dado ou fonte o usuário deve confirmar. Responda em Markdown conciso e orientado à próxima ação.`;
    return {
        answer: await invokeText(prompt, 'studio:assistant', 0.35, 'local-llama3-fast'),
        capability: request.inputs.mode === 'internal' ? 'internal_context' : 'general_knowledge',
        webAccess: false,
    };
}
