import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../../lib/ai/gateway.js';
import { logger } from '../../../../lib/logger.js';

export interface CadenceStepContext {
    companyName: string;
    contactName: string;
    channel: 'email' | 'whatsapp' | 'call' | 'linkedin';
    stepNumber: number;
    previousInteraction?: string;
    leadReaction?: 'sem_resposta' | 'abriu_email' | 'clicou_link' | 'pediu_tempo' | 'objecao_preco';
    valueProposition?: string;
}

export interface GeneratedCadenceStep {
    subject?: string; // Para e-mails
    content: string;
    channel: 'email' | 'whatsapp' | 'call' | 'linkedin';
    callToAction: string;
    tone: 'consultivo' | 'urgencia_moderada' | 'reconexao' | 'breakup';
    followUpDelayDays: number;
}

export class CadenceAiService {
    async generateNextStep(context: CadenceStepContext): Promise<GeneratedCadenceStep> {
        const model = getAiModel('local-llama3-fast', 0.4, 'cadence-ai');
        const startTime = Date.now();

        const systemPrompt = `Você é um estrategista sênior de Outbound e Cadências de Vendas B2B de Alta Conversão.
Gere o conteúdo da próxima mensagem da cadência para o canal solicitado (${context.channel}).
Diretrizes:
- Canal WhatsApp: Mensagens curtas, diretas, no tom conversacional e profissional. Max 3-4 parágrafos pequenos.
- Canal E-mail: Assunto chamativo e sem clichês ("quick question", "parceria", etc.). Corpo conciso focado na dor do cliente.
- Canal Call: Roteiro bullet-point de 30 segundos para abertura de ligação telefônica.
- Adapte a mensagem dependendo da reação anterior do lead (${context.leadReaction || 'sem_resposta'}).

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "subject": "Assunto do e-mail (ou nulo se for WhatsApp/Call)",
  "content": "Texto completo da mensagem ou roteiro",
  "channel": "${context.channel}",
  "callToAction": "Pergunta final de fechamento (ex: faz sentido 10 min nesta quinta?)",
  "tone": "consultivo",
  "followUpDelayDays": 3
}`;

        try {
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Dados da Cadência:\n${JSON.stringify(context, null, 2)}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'cadence-step-generation',
            });

            return cleanAndParseJson<GeneratedCadenceStep>(response.content);
        } catch (error) {
            logger.error({ err: error }, 'Erro ao gerar passo de cadência');
            return {
                subject: context.channel === 'email' ? `Oportunidade para ${context.companyName}` : undefined,
                content: `Olá ${context.contactName}, tudo bem? Gostaria de entender como vocês estão estruturando a gestão de risco e rastreamento da frota na ${context.companyName}.`,
                channel: context.channel,
                callToAction: 'Como está sua agenda para 15 minutos esta semana?',
                tone: 'consultivo',
                followUpDelayDays: 3,
            };
        }
    }
}
