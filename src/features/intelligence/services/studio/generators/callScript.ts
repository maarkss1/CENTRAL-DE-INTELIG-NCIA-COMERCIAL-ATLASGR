import type { StudioGenerationRequest } from '../schema.js';
import { callScriptResultSchema } from '../schema.js';
import { SYSTEM_RULES, invokeStructured, jsonOnlyInstruction } from '../shared.js';

export async function generateCallScript(request: Extract<StudioGenerationRequest, { kind: 'call_script' }>) {
    const prompt = `${SYSTEM_RULES}

Crie um roteiro de ligação fria (cold call) para ${request.brand.name}, cuja solução é: ${request.brand.description}.
Dados do lead e tom: ${JSON.stringify(request.inputs, null, 2)}

A abertura deve conquistar 10 segundos de atenção sem soar como script decorado. As perguntas de descoberta devem
seguir uma lógica de qualificação (situação → problema → impacto), sem induzir a resposta. As dicas de objeção
devem cobrir as objeções mais prováveis para esse cargo/segmento, reconhecendo a preocupação antes de responder.
O fechamento deve propor um próximo passo concreto (ex.: agendar uma call), nunca fechar venda na primeira ligação.
A análise de ICP deve explicar o fit sem inventar score percentual.
${jsonOnlyInstruction('{"opening":"string","discoveryQuestions":["3 a 5 strings"],"objectionTips":[{"objection":"string","response":"string"}],"closing":"string","icpAnalysis":"string"}')}`;
    return invokeStructured(
        prompt,
        'studio:call-script',
        callScriptResultSchema,
        '{"opening":"string","discoveryQuestions":["string"],"objectionTips":[{"objection":"string","response":"string"}],"closing":"string","icpAnalysis":"string"}',
        0.55,
    );
}
