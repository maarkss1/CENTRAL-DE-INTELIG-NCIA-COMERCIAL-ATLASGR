import type { StudioGenerationRequest } from '../schema.js';
import { SYSTEM_RULES, invokeText, stripCodeFence } from '../shared.js';

function buildAutomationManifest(request: Extract<StudioGenerationRequest, { kind: 'automation' }>) {
    const { inputs } = request;
    return {
        name: `Automação: ${inputs.goal.slice(0, 80)}`,
        status: 'draft',
        requires_review_before_activation: true,
        orchestration_target: inputs.toolId,
        trigger: { id: inputs.triggerId, label: inputs.trigger },
        processing: {
            ai_layer: inputs.aiLayerId,
            label: inputs.aiLayer,
            output_contract: {
                status: 'QUALIFIED | UNQUALIFIED | REVIEW_REQUIRED',
                score: 'number (0-100)',
                summary: 'string',
            },
        },
        action: { id: inputs.actionId, label: inputs.action },
        required_environment_variables: ['SOURCE_API_URL', 'DESTINATION_API_URL', 'INTEGRATION_TOKEN'],
    };
}

function automationCodePrompt(request: Extract<StudioGenerationRequest, { kind: 'automation' }>): string {
    return `${SYSTEM_RULES}

Gere um script Python 3.11 completo e revisável para o fluxo abaixo:
${JSON.stringify(request.inputs, null, 2)}

Requisitos: usar requests com timeout; autenticação via INTEGRATION_TOKEN; validar payload; retries limitados;
logs sem dados pessoais; modo DRY_RUN=true por padrão; não simular sucesso; deixar endpoints em SOURCE_API_URL e
DESTINATION_API_URL; marcar claramente qualquer mapeamento que dependa da documentação real do fornecedor.
Retorne SOMENTE o código, sem bloco Markdown.`;
}

export async function generateAutomation(request: Extract<StudioGenerationRequest, { kind: 'automation' }>) {
    const blueprintPrompt = `${SYSTEM_RULES}

Escreva um blueprint técnico curto e acionável para esta automação de ${request.brand.name}:
${JSON.stringify(request.inputs, null, 2)}

Inclua: pré-requisitos, contrato de entrada, passos do fluxo, tratamento de erro/idempotência, segurança,
observabilidade, teste em sandbox e checklist antes de ativar. Seja honesto sobre credenciais e conectores que
precisam ser configurados. Retorne Markdown sem bloco de código.`;

    const [blueprint, codeScript] = await Promise.all([
        invokeText(blueprintPrompt, 'studio:automation-blueprint', 0.25),
        invokeText(automationCodePrompt(request), 'studio:automation-code', 0.2),
    ]);

    return {
        blueprint,
        n8nJson: JSON.stringify(buildAutomationManifest(request), null, 2),
        codeScript: stripCodeFence(codeScript),
    };
}
