import type { StudioGenerationRequest } from '../schema.js';
import { superagentAiResultSchema } from '../schema.js';
import { SYSTEM_RULES, invokeStructured, jsonOnlyInstruction, safeIdentifier } from '../shared.js';

function buildSuperagentScaffolds(
    request: Extract<StudioGenerationRequest, { kind: 'superagent' }>,
    aiResult: { summary: string; systemPrompt: string },
) {
    const { inputs } = request;
    const className = `${safeIdentifier(inputs.name)}Agent`;
    const agentId = `agent_${safeIdentifier(inputs.name).toLowerCase()}`;
    const jsonConfig = {
        agent_id: agentId,
        name: inputs.name,
        role: inputs.role,
        target_llm: {
            provider: inputs.provider,
            model: inputs.model,
            temperature: inputs.temperature,
        },
        memory: { type: inputs.memory },
        tools: inputs.tools,
        status: 'draft',
        requires_review_before_deploy: true,
    };

    const pythonScript = `import json
import os
from typing import Any

class ${className}:
    """Esqueleto revisável. Conecte o SDK do provedor antes de usar em produção."""

    def __init__(self) -> None:
        self.name = ${JSON.stringify(inputs.name)}
        self.model = ${JSON.stringify(inputs.model)}
        self.api_key = os.getenv("LLM_API_KEY")
        if not self.api_key:
            raise RuntimeError("Configure LLM_API_KEY antes de iniciar o agente.")

    def process(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not payload:
            raise ValueError("payload não pode ser vazio")
        # PLACEHOLDER: Conecte o SDK do provedor (ex: OpenAI, Gemini) e valide a saída.
        return {"status": "REVIEW_REQUIRED", "agent": self.name, "input": payload}

if __name__ == "__main__":
    print(json.dumps({"agent": ${JSON.stringify(inputs.name)}, "status": "DRAFT"}, ensure_ascii=False))
`;

    const powershellScript = `[CmdletBinding()]
param(
    [string]$ConfigPath = ".\\agent-config.json"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "Manifesto não encontrado: $ConfigPath"
}
if (-not $env:LLM_API_KEY) {
    throw "Configure LLM_API_KEY antes de iniciar o agente."
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
[PSCustomObject]@{
    Agent = $config.name
    Model = $config.target_llm.model
    Status = "DRAFT_VALIDATED"
    RequiresReview = $true
} | ConvertTo-Json
`;

    return {
        summary: aiResult.summary,
        systemPrompt: aiResult.systemPrompt,
        jsonConfig: JSON.stringify(jsonConfig, null, 2),
        pythonScript,
        powershellScript,
    };
}

export async function generateSuperagent(request: Extract<StudioGenerationRequest, { kind: 'superagent' }>) {
    const prompt = `${SYSTEM_RULES}

Projete o prompt de sistema de um agente para ${request.brand.name}.
Contexto da marca: ${request.brand.description}
Configuração alvo: ${JSON.stringify(request.inputs, null, 2)}

O prompt deve definir missão, limites, dados permitidos, tratamento de incerteza, uso seguro das ferramentas,
confirmação humana antes de qualquer ação externa e um contrato JSON de saída. A configuração de provedor/modelo
é o alvo de implantação, não alegue que ele já está provisionado.
${jsonOnlyInstruction('{"summary":"resumo do projeto em 2 a 4 frases","systemPrompt":"prompt de sistema completo"}')}`;
    const aiResult = await invokeStructured(
        prompt,
        'studio:superagent',
        superagentAiResultSchema,
        '{"summary":"string","systemPrompt":"string"}',
        0.35,
    );
    return buildSuperagentScaffolds(request, aiResult);
}
