import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel } from '../../../lib/ai/gateway.js';
import { generateEmailDraft, generateObjectionHandling } from '../../../lib/ai/features.js';
import { compileLeadGraph } from '../graphs/leadQualification.js';
import { RoleplayAiService } from '../../roleplay/services/roleplay-ai.service.js';
import { NextBestActionService } from '../../activities/services/next-best-action.service.js';
import { MeetingSynthesisService } from '../../chatbook/services/meeting-synthesis.service.js';
import { KnowledgeCopilotService } from '../../knowledge/services/knowledge-copilot.service.js';
import { GOLDEN_TOOL_NAMES, type GoldenCase } from './goldenDataset.types.js';

const roleplay = new RoleplayAiService();
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
            return roleplay.simulateCustomerResponse(goldenCase.input);
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
                    `Selecione exatamente uma ferramenta para o cenário. Ferramentas disponíveis: ${GOLDEN_TOOL_NAMES.join(', ')}. `
                    + 'Responda apenas JSON {"tool":"nome_exato","args":{}}. Não execute a ferramenta.',
                ),
                new HumanMessage(goldenCase.input.scenario),
            ]);
            return cleanAndParseJson<{ tool: string; args: Record<string, unknown> }>(response.content);
        }
    }
}
