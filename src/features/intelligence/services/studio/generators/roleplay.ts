import type { StudioGenerationRequest } from '../schema.js';
import { roleplayResultSchema } from '../schema.js';
import { SYSTEM_RULES, invokeStructured, jsonOnlyInstruction } from '../shared.js';

const PERSONA_LABELS = {
    skeptical_cfo: 'CFO cético, orientado a ROI, risco e custo total',
    strict_buyer: 'comprador rigoroso, orientado a condições comerciais e comparação',
    tech_director: 'diretor técnico, orientado a segurança, arquitetura e implantação',
} as const;

export async function generateRoleplay(request: Extract<StudioGenerationRequest, { kind: 'roleplay' }>) {
    const prompt = `${SYSTEM_RULES}

Simule um comprador B2B para treinar um SDR da ${request.brand.name}.
Contexto da marca: ${request.brand.description}
Persona: ${PERSONA_LABELS[request.inputs.persona]}
Contexto de playbook (use como referência, não como fato comprovado):
${request.inputs.playbookContext || 'Nenhum contexto específico disponível.'}

Histórico da conversa:
${JSON.stringify(request.inputs.transcript, null, 2)}

Última resposta do SDR:
${request.inputs.message}

Gere uma réplica realista do comprador, sem encerrar a conversa cedo e sem inventar números. Avalie somente a
última resposta: clareza considera objetividade e compreensão; tratamento de objeção considera escuta, validação
da preocupação e próxima pergunta. Use notas inteiras de 0 a 100 (por exemplo, 6 de 10 deve ser retornado como
60). As notas são estimativas pedagógicas, não métricas objetivas.
${jsonOnlyInstruction('{"reply":"string","feedback":"feedback curto e acionável","clarity":70,"objectionHandling":60}')}`;
    const result = await invokeStructured(
        prompt,
        'studio:roleplay',
        roleplayResultSchema,
        '{"reply":"string","feedback":"string","clarity":70,"objectionHandling":60}',
        0.55,
    );
    const clarity = result.clarity <= 10 ? result.clarity * 10 : result.clarity;
    const objectionHandling = result.objectionHandling <= 10
        ? result.objectionHandling * 10
        : result.objectionHandling;
    return {
        ...result,
        clarity,
        objectionHandling,
        total: Math.round((clarity + objectionHandling) / 2),
    };
}
