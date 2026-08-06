import type { StudioGenerationRequest } from '../schema.js';
import { SYSTEM_RULES, invokeText, stripCodeFence } from '../shared.js';

export async function generateScript(request: Extract<StudioGenerationRequest, { kind: 'script' }>) {
    const prompt = `${SYSTEM_RULES}

Gere o artefato solicitado para ${request.brand.name}.
Contexto da marca: ${request.brand.description}
Especificação: ${JSON.stringify(request.inputs, null, 2)}

O resultado deve ser completo, coerente com a linguagem escolhida e seguro por padrão. Para código: inclua
validação, erros úteis, timeouts e variáveis de ambiente; não afirme que integrações foram testadas; não use
credenciais hardcoded. Para prompt de sistema: não solicite cadeia de pensamento privada e defina um contrato
de saída verificável. Retorne SOMENTE o artefato, sem bloco Markdown.`;
    return { content: stripCodeFence(await invokeText(prompt, 'studio:script', 0.25)) };
}
