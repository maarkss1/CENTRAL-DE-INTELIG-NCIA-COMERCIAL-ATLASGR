import type { StudioGenerationRequest } from '../schema.js';
import { b2bResultSchema } from '../schema.js';
import { SYSTEM_RULES, invokeStructured, jsonOnlyInstruction } from '../shared.js';

export async function generateB2bMatrix(request: Extract<StudioGenerationRequest, { kind: 'b2b_matrix' }>) {
    const prompt = `${SYSTEM_RULES}

Crie uma matriz de descoberta comercial para a solução de ${request.brand.name}.
Contexto da marca: ${request.brand.description}
ICP e solução informados: ${JSON.stringify(request.inputs, null, 2)}

As dores devem ser hipóteses testáveis, as perguntas devem seguir SPIN sem induzir resposta e cada contorno de
objeção deve reconhecer a preocupação antes de propor uma pergunta útil.
${jsonOnlyInstruction('{"pains":["3 a 5 strings"],"questions":["3 a 5 strings"],"objections":[{"objection":"string","rebuttal":"string"}]}')}`;
    return invokeStructured(prompt, 'studio:b2b-matrix', b2bResultSchema, '{"pains":["string"],"questions":["string"],"objections":[{"objection":"string","rebuttal":"string"}]}', 0.5);
}
