import type { StudioGenerationRequest } from '../schema.js';
import { b2bResultSchema } from '../schema.js';
import { SYSTEM_RULES, invokeStructured, jsonOnlyInstruction } from '../shared.js';

export async function generateB2bMatrix(
  request: Extract<StudioGenerationRequest, { kind: 'b2b_matrix' }>,
) {
  const prompt = `${SYSTEM_RULES}

Crie uma matriz de descoberta comercial para a solução de ${request.brand.name}.
Contexto da marca: ${request.brand.description}
ICP e solução informados: ${JSON.stringify(request.inputs, null, 2)}

As dores devem ser hipóteses testáveis, as perguntas devem seguir SPIN sem induzir resposta e cada contorno de
objeção deve reconhecer a preocupação antes de propor uma pergunta útil.
${jsonOnlyInstruction('{"pains":["3 a 5 dores com mais de 10 caracteres"],"questions":["3 a 5 perguntas com mais de 10 caracteres"],"objections":[{"objection":"objeção detalhada","rebuttal":"contorno detalhado com mais de 10 caracteres"},{"objection":"objeção 2","rebuttal":"contorno 2"},{"objection":"objeção 3","rebuttal":"contorno 3"}]}')}`;
  return invokeStructured(
    prompt,
    'studio:b2b-matrix',
    b2bResultSchema,
    '{"pains":["Falta de visibilidade em tempo real sobre ocorrências","Elevado custo operacional com tratativas manuais","Dificuldade em engajar a equipe comercial nas metas"],"questions":["Como vocês realizam o acompanhamento de metas hoje?","Qual o impacto financeiro das ocorrências não tratadas?","Se pudessem automatizar o diagnóstico, qual seria o ganho?"],"objections":[{"objection":"O valor da solução parece elevado para nosso momento","rebuttal":"Demonstramos o ROI rápido com redução de custos diretos nas primeiras semanas"},{"objection":"Já utilizamos outro sistema no momento","rebuttal":"Apresentamos um comparativo técnico mostrando nossa integração sem atrito"},{"objection":"Nossa equipe não tem tempo para aprender nova ferramenta","rebuttal":"Oferecemos onboarding guiado e suporte dedicado sem impacto na rotina"}]}',
    0.5,
  );
}
