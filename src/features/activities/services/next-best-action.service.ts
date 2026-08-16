import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface MeetingOrCallNote {
    leadOrClientName: string;
    stage: string;
    rawNote: string;
    salesRepName?: string;
}

export interface NextBestActionResult {
    recommendedAction: string;
    actionType: 'task' | 'meeting' | 'email' | 'whatsapp' | 'proposal_revision' | 'escalation';
    priority: 'Alta' | 'Média' | 'Baixa';
    suggestedDueDateDays: number;
    suggestedMessageTemplate?: string;
    keyRiskDetected?: string;
    summaryBulletPoints: string[];
}

export class NextBestActionService {
    async determineNextAction(note: MeetingOrCallNote): Promise<NextBestActionResult> {
        const model = getAiModel('local-llama3-fast', 0.2, 'next-best-action');
        const startTime = Date.now();

        const systemPrompt = `Você é um Gerente de Operações Comerciais (RevOps) de Alta Performance.
Analise o registro/anotação de uma interação comercial recente e defina com precisão cirúrgica o PRÓXIMO MELHOR PASSO (Next Best Action) para o vendedor.
Regras:
1. Identifique compromissos assumidos pelo vendedor ou pelo lead.
2. Defina uma tarefa acionável e objetiva com prazo realista (em dias).
3. Se o vendedor prometeu enviar algo, crie o modelo sugerido do texto.
4. Sinalize se há risco de perda do deal.

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "recommendedAction": "Enviar proposta atualizada com desconto na taxa de adesão",
  "actionType": "proposal_revision",
  "priority": "Alta",
  "suggestedDueDateDays": 1,
  "suggestedMessageTemplate": "Olá [Nome], conforme combinado em nossa ligação...",
  "keyRiskDetected": "Cliente mencionou estar avaliando proposta mais barata do concorrente",
  "summaryBulletPoints": [
    "Cliente demonstrou interesse no módulo de telemetria",
    "Pediu revisão na taxa de instalação"
  ]
}`;

        try {
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Anotações da Interação:\n${JSON.stringify(note, null, 2)}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'next-best-action',
            });

            return cleanAndParseJson<NextBestActionResult>(response.content);
        } catch (error) {
            logger.error({ err: error }, 'Erro ao calcular Next Best Action');
            return {
                recommendedAction: 'Fazer follow-up com o cliente sobre os pontos conversados.',
                actionType: 'task',
                priority: 'Média',
                suggestedDueDateDays: 2,
                summaryBulletPoints: [note.rawNote.slice(0, 100)],
            };
        }
    }
}
