import type { StudioGenerationRequest } from '../schema.js';
import { messageResultSchema } from '../schema.js';
import { SYSTEM_RULES, invokeStructured, jsonOnlyInstruction } from '../shared.js';

export async function generateMessage(request: Extract<StudioGenerationRequest, { kind: 'message' }>) {
    const prompt = `${SYSTEM_RULES}

Crie uma mensagem curta de prospecção (estilo WhatsApp/SMS) para ${request.brand.name}, cuja solução é: ${request.brand.description}.
Dados do lead e tom: ${JSON.stringify(request.inputs, null, 2)}

A mensagem deve ter no máximo 3 frases curtas, tom conversacional (não parecer e-mail formal nem propaganda em
massa), uma hipótese de dor tratada como hipótese, e terminar com uma pergunta simples de sim/não ou baixo
esforço de resposta. A sugestão de follow-up deve orientar o vendedor sobre quando/como insistir se não houver
resposta em alguns dias. A análise de ICP deve explicar o fit sem inventar score percentual.
${jsonOnlyInstruction('{"body":"string","followUpSuggestion":"string","icpAnalysis":"string"}')}`;
    return invokeStructured(
        prompt,
        'studio:message',
        messageResultSchema,
        '{"body":"string","followUpSuggestion":"string","icpAnalysis":"string"}',
        0.6,
    );
}
