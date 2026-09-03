import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { cleanAndParseJson, getAiModel } from '../../../lib/ai/gateway.js';
import { generateEmailDraft, generateObjectionHandling } from '../../../lib/ai/features.js';
import { compileLeadGraph } from '../graphs/leadQualification.js';
import { generateRoleplay } from '../services/studio/generators/roleplay.js';
import { NextBestActionService } from '../../activities/services/next-best-action.service.js';
import { MeetingSynthesisService } from '../../chatbook/services/meeting-synthesis.service.js';
import { KnowledgeCopilotService } from '../../knowledge/services/knowledge-copilot.service.js';
import { GOLDEN_TOOL_NAMES, type GoldenCase } from './goldenDataset.types.js';

// Achado da auditoria (PR #328, item fora de escopo original): sem este schema, um "tool" fora de
// GOLDEN_TOOL_NAMES (nome inventado, ou a mais provável falha real: um typo do LLM) passava para o
// scorer do golden-dataset como se fosse uma seleção válida — o teste de regressão perde o sentido
// se ele mesmo aceita qualquer string como "ferramenta". `z.enum(GOLDEN_TOOL_NAMES)` é a mesma
// lista usada por `expected.expectedTool` em goldenDataset.types.ts — nunca duplicar a lista.
const toolSelectionSchema = z.object({
  tool: z.enum(GOLDEN_TOOL_NAMES),
  args: z.record(z.string(), z.unknown()),
});

const nextBestAction = new NextBestActionService();
const meeting = new MeetingSynthesisService();
const knowledge = new KnowledgeCopilotService();

/**
 * Executa cada caso sintético no mesmo serviço/motor usado pela aplicação. `tool_use` é a única
 * exceção deliberada quanto a side effects: testa a seleção/argumentos da ferramenta, mas nunca a
 * executa, para um gate de CI não escrever CRM, disparar notificações ou fazer pesquisa externa.
 */
export async function runGoldenCaseAgainstProduction(goldenCase: GoldenCase): Promise<unknown> {
  switch (goldenCase.category) {
    case 'lead_qualification':
      return compileLeadGraph().invoke(goldenCase.input);
    case 'cold_email':
      return generateEmailDraft(goldenCase.input.context, goldenCase.input.goal);
    case 'objection_handling':
      return generateObjectionHandling(goldenCase.input.objection);
    case 'roleplay':
      return generateRoleplay({
        kind: 'roleplay',
        brand: goldenCase.input.brand,
        inputs: goldenCase.input.inputs,
      });
    case 'next_best_action':
      return nextBestAction.determineNextAction(goldenCase.input);
    case 'summary':
      return meeting.synthesizeMeeting(goldenCase.input);
    case 'rag':
      return knowledge.answerTechnicalQuestion(goldenCase.input);
    case 'tool_use': {
      const model = getAiModel('local-llama3-fast', 0, 'golden-tool-router');
      const response = await model.invoke([
        new SystemMessage(
          `Selecione exatamente uma ferramenta para o cenário. Ferramentas disponíveis: ${GOLDEN_TOOL_NAMES.join(', ')}. ` +
            'Responda apenas JSON {"tool":"nome_exato","args":{}}. Não execute a ferramenta.',
        ),
        new HumanMessage(goldenCase.input.scenario),
      ]);
      return toolSelectionSchema.parse(cleanAndParseJson<unknown>(response.content));
    }
  }
}
