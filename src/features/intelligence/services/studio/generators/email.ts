import type { StudioGenerationRequest } from '../schema.js';
import { emailResultSchema } from '../schema.js';
import { SYSTEM_RULES, invokeStructured, jsonOnlyInstruction } from '../shared.js';

export async function generateEmail(request: Extract<StudioGenerationRequest, { kind: 'email' }>) {
    const prompt = `${SYSTEM_RULES}

Crie um cold e-mail para ${request.brand.name}, cuja solução é: ${request.brand.description}.
Dados do lead e tom: ${JSON.stringify(request.inputs, null, 2)}

Instrução crítica: Mantenha um tom consultivo, colaborativo e absolutamente não-agressivo. Evite ser pushy, invasivo ou insistente. O e-mail deve soar como um convite genuíno à conversa.

O assunto deve ser curto. O corpo deve ter no máximo 140 palavras, uma hipótese de dor claramente tratada como
hipótese e um CTA simples. A análise de ICP deve explicar o fit sem inventar score percentual.
${jsonOnlyInstruction('{"subject":"string","body":"string","icpAnalysis":"string"}')}`;
    return invokeStructured(prompt, 'studio:email', emailResultSchema, '{"subject":"string","body":"string","icpAnalysis":"string"}', 0.55);
}
