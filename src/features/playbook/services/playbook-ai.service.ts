import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface PlaybookChapterInput {
    topic: string; // ex: 'Como Contornar a Objeção "Já tenho Seguro e não preciso de Rastreamento"'
    targetAudience: 'SDR' | 'Closer' | 'Onboarding' | 'CS';
    industrySegment: string; // ex: 'Transportadoras de Cargas Perigosas e Químicos'
    winningPatternsObserved?: string[];
}

export interface GeneratedPlaybookChapter {
    title: string;
    targetPersona: string;
    diagnosticQuestionsSpin: {
        situation: string[];
        problem: string[];
        implication: string[];
        needPayoff: string[];
    };
    objectionTurnaroundScripts: Array<{
        customerSays: string;
        recommendedReply: string;
        psychologicalRationale: string;
    }>;
    goldenRules: string[];
    checklistForSuccess: string[];
}

export class PlaybookAiService {
    async generatePlaybookChapter(input: PlaybookChapterInput): Promise<GeneratedPlaybookChapter> {
        const model = getAiModel('local-llama3-fast', 0.2, 'playbook-ai');
        const startTime = Date.now();

        const systemPrompt = `Você é o Head de Capacitação Comercial e autor do Playbook de Vendas da AtlasGR / TotalTrac.
Escreva um capítulo completo e prático do Playbook de Vendas sobre o tema solicitado.
Estruture utilizando a metodologia SPIN Selling adaptada para o mercado de logística, telemetria e gestão de risco.

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "title": "Título Claro do Capítulo",
  "targetPersona": "Perfil do cliente alvo",
  "diagnosticQuestionsSpin": {
    "situation": ["Qual o tamanho atual da sua frota?", "Quantas viagens por mês passam por rotas de alto risco?"],
    "problem": ["Com que frequência você tem problemas de quebra mecânica não prevista?", "Já enfrentou roubo de carga no último ano?"],
    "implication": ["Quanto custa para sua operação 1 dia de caminhão parado esperando resgate?", "Como o sinistro impacta o valor da sua apólice de seguro?"],
    "needPayoff": ["Se você pudesse travar remotamente o baú em caso de desvio sem depender do motorista, quanto isso aumentaria a segurança dos embarcadores?"]
  },
  "objectionTurnaroundScripts": [
    {
      "customerSays": "Já tenho seguro, não preciso de telemetria avançada.",
      "recommendedReply": "Entendo perfeitamente, o seguro é essencial. Mas o seguro paga a carga depois do roubo, enquanto a telemetria impede o roubo e evita que você perca o contrato com o seu cliente embarcador.",
      "psychologicalRationale": "Mostra que a perda do contrato com o cliente final é pior que a indenização da seguradora."
    }
  ],
  "goldenRules": ["Nunca discuta com a objeção do cliente; valide primeiro e redirecione."],
  "checklistForSuccess": ["Validar decisor", "Calcular custo da dor antes de passar preço"]
}`;

        try {
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Parâmetros do Playbook:\n${JSON.stringify(input, null, 2)}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'playbook-generation',
            });

            return cleanAndParseJson<GeneratedPlaybookChapter>(response.content);
        } catch (error) {
            logger.error({ err: error }, 'Erro ao gerar capítulo do playbook');
            return {
                title: input.topic,
                targetPersona: input.industrySegment,
                diagnosticQuestionsSpin: {
                    situation: ['Quantos veículos compõem a frota?'],
                    problem: ['Quais as maiores dificuldades na gestão diária?'],
                    implication: ['Qual o impacto no faturamento?'],
                    needPayoff: ['Como a automação melhoraria o resultado?'],
                },
                objectionTurnaroundScripts: [{
                    customerSays: 'Preciso pensar.',
                    recommendedReply: 'Com certeza. Qual ponto principal você gostaria de analisar?',
                    psychologicalRationale: 'Isola a objeção oculta.',
                }],
                goldenRules: ['Sempre faça perguntas abertas.'],
                checklistForSuccess: ['Revisar histórico antes do contato.'],
            };
        }
    }
}
