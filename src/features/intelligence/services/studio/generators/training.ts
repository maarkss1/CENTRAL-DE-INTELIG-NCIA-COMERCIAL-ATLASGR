import type { StudioGenerationRequest } from '../schema.js';
import { trainingResultSchema } from '../schema.js';
import { SYSTEM_RULES, invokeStructured, jsonOnlyInstruction } from '../shared.js';

export async function generateTraining(request: Extract<StudioGenerationRequest, { kind: 'training' }>) {
    const prompt = `${SYSTEM_RULES}

Crie um microtreinamento prático para o time comercial de ${request.brand.name}.
Contexto da marca: ${request.brand.description}
Tema solicitado: ${request.inputs.topic}

Inclua de 3 a 5 etapas progressivas. Cada etapa precisa ensinar algo aplicável em uma conversa real e terminar
com uma dica operacional. Não invente estatísticas.
${jsonOnlyInstruction('{"title":"string","description":"string","steps":[{"step":1,"title":"string","detail":"string","tip":"string"}]}')}`;
    return invokeStructured(prompt, 'studio:training', trainingResultSchema, '{"title":"string","description":"string","steps":[{"step":1,"title":"string","detail":"string","tip":"string"}]}', 0.45);
}
