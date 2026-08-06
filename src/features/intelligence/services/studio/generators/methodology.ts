import type { StudioGenerationRequest } from '../schema.js';
import { methodologyResultSchema } from '../schema.js';
import { SYSTEM_RULES, invokeStructured, jsonOnlyInstruction } from '../shared.js';

const FORMATS = {
    spin: '{"type":"spin","meta":{"persona":"string","icpSize":"string","fitAssessment":"string"},"situation":["3-5 perguntas"],"problem":["3-5 perguntas"],"implication":["3-5 perguntas"],"needPayoff":["3-5 perguntas"]}',
    snap: '{"type":"snap","meta":{"persona":"string","icpSize":"string","fitAssessment":"string"},"simple":{"description":"string","checklist":["2-5 itens"]},"invaluable":{"description":"string","differentiator":"string"},"align":{"description":"string","strategicFit":"string"},"priorities":{"description":"string","urgencyTrigger":"string"}}',
    aida: '{"type":"aida","meta":{"persona":"string","icpSize":"string","fitAssessment":"string"},"attention":{"hook":"string","opening":"string"},"interest":{"body":"string"},"desire":{"proof":"string"},"action":{"cta":"string"}}',
    meddpicc: '{"type":"meddpicc","meta":{"persona":"string","icpSize":"string","fitAssessment":"string"},"metrics":"string","economicBuyer":"string","decisionCriteria":"string","decisionProcess":"string","paperProcess":"string","identifiedPain":"string","champion":"string","competitors":"string"}',
    challenger: '{"type":"challenger","meta":{"persona":"string","icpSize":"string","fitAssessment":"string"},"teach":{"title":"string","script":"string"},"tailor":{"title":"string","script":"string"},"takeControl":{"title":"string","script":"string"}}',
} as const;

export async function generateMethodology(request: Extract<StudioGenerationRequest, { kind: 'methodology' }>) {
    const format = FORMATS[request.inputs.framework];
    const prompt = `${SYSTEM_RULES}

Crie uma estratégia comercial usando exclusivamente a metodologia ${request.inputs.framework.toUpperCase()}
para ${request.brand.name}.
Contexto da marca: ${request.brand.description}
Entradas fornecidas:
${JSON.stringify(request.inputs, null, 2)}

Trate dor e benefício como hipóteses a validar. Não invente benchmarks, percentuais, prazos, garantias, clientes,
compatibilidade técnica ou fit score. Em "fitAssessment", descreva em uma frase quais dados ainda precisam ser
confirmados. Para SPIN, escreva perguntas abertas e não indutivas. Para MEDDPICC, diferencie o que foi informado
do que ainda precisa ser descoberto. Para AIDA e Challenger, evite falsa prova social.
${jsonOnlyInstruction(format)}`;
    return invokeStructured(
        prompt,
        `studio:methodology:${request.inputs.framework}`,
        methodologyResultSchema,
        format,
        0.45,
    );
}
