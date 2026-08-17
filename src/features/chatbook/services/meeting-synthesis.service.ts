import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface MeetingTranscriptInput {
    meetingTitle: string;
    participants: string[];
    rawTranscript: string;
    dealName?: string;
}

export interface MeetingActionItem {
    assignee: string;
    description: string;
    deadlineDays?: number;
}

export interface MeetingSynthesisOutput {
    executiveSummary: string;
    keyPainsIdentified: string[];
    agreedPoints: string[];
    unresolvedObjections: string[];
    actionItems: MeetingActionItem[];
    dealStageRecommendation?: string;
    sentimentScore: 'Muito Positivo' | 'Positivo' | 'Neutro / Cauteloso' | 'Negativo';
}

export class MeetingSynthesisService {
    async synthesizeMeeting(input: MeetingTranscriptInput): Promise<MeetingSynthesisOutput> {
        const model = getAiModel('local-llama3-fast', 0.2, 'meeting-synthesis');
        const startTime = Date.now();

        const systemPrompt = `Você é um Analista Executivo de Inteligência Comercial e Secretário de Reuniões de Alto Nível.
Analise a transcrição de uma reunião de vendas/alinhamento com cliente B2B e gere uma Ata Executiva Estruturada e Acionável.
Destaque:
1. Resumo Executivo em 2-3 parágrafos concisos.
2. Dores e necessidades reais do cliente.
3. Pontos acordados e alinhamentos comerciais.
4. Objeções que ainda precisam ser superadas.
5. Lista de Ações / Tarefas com responsáveis e prazos.
6. Sentimento geral e recomendação para o estágio do funil no CRM.

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "executiveSummary": "Resumo dos temas centrais tratados na reunião...",
  "keyPainsIdentified": ["Alto índice de roubo em rotas do Sudeste", "Falta de controle de temperatura no frete frigorificado"],
  "agreedPoints": ["Envio de proposta para 35 caminhões até sexta-feira"],
  "unresolvedObjections": ["Preocupação com o prazo de carência da instalação"],
  "actionItems": [
    {
      "assignee": "Vendedor (AtlasGR)",
      "description": "Elaborar proposta com taxa reduzida e enviar para aprovação",
      "deadlineDays": 2
    }
  ],
  "dealStageRecommendation": "Proposta / Negociação",
  "sentimentScore": "Positivo"
}`;

        try {
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Título: ${input.meetingTitle}\nParticipantes: ${input.participants.join(', ')}\n\nTranscrição Bruta:\n${input.rawTranscript}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'meeting-synthesis',
            });

            return cleanAndParseJson<MeetingSynthesisOutput>(response.content);
        } catch (error) {
            logger.error({ err: error }, 'Erro ao sintetizar reunião');
            return {
                executiveSummary: 'Reunião realizada com o cliente para alinhamento de oportunidades.',
                keyPainsIdentified: [],
                agreedPoints: [],
                unresolvedObjections: [],
                actionItems: [{ assignee: 'Equipe Comercial', description: 'Realizar follow-up pós-reunião' }],
                sentimentScore: 'Neutro / Cauteloso',
            };
        }
    }
}
