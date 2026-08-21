import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface RoleplayPersona {
    name: string;
    role: string;
    companyProfile: string;
    difficulty: 'Fácil' | 'Médio' | 'Difícil' | 'Extremo';
    mainObjection: string;
    personality: string;
}

export interface RoleplayTurnInput {
    persona: RoleplayPersona;
    history: Array<{ sender: 'user' | 'persona'; text: string }>;
    userMessage: string;
}

export interface RoleplayTurnOutput {
    personaReply: string;
    currentLeadInterest: number; // 0 a 100
    objectionRaised?: string;
    coachingTip?: string;
    isDealClosed: boolean;
    isDealLost: boolean;
}

export interface RoleplayEvaluationResult {
    overallScore: number; // 0 a 100
    strengths: string[];
    weaknesses: string[];
    objectionHandlingScore: number;
    clarityScore: number;
    closingAttemptScore: number;
    actionableFeedback: string;
}

export class RoleplayAiService {
    async simulateCustomerResponse(input: RoleplayTurnInput): Promise<RoleplayTurnOutput> {
        const model = getAiModel('local-llama3', 0.7, 'roleplay-sim');
        const startTime = Date.now();

        const systemPrompt = `Você é um ator de IA simulando um cliente real em um treinamento de vendas (Roleplay B2B).
Sua Persona:
- Nome: ${input.persona.name}
- Cargo: ${input.persona.role}
- Perfil da Empresa: ${input.persona.companyProfile}
- Nível de Dificuldade: ${input.persona.difficulty}
- Objeção Principal: ${input.persona.mainObjection}
- Personalidade: ${input.persona.personality}

Regras da Simulação:
- Responda como a persona responderia no dia a dia: ocupado, pragmático, questionando valor e ROI.
- Não facilite demais se a dificuldade for Alta/Extrema.
- Se o vendedor fizer boas perguntas abertas e demonstrar valor, aumente o interesse (currentLeadInterest).
- Se o vendedor for insistente, genérico ou falar só de produto sem ouvir a dor, aumente a resistência.

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "personaReply": "Sua resposta falada em 1ª pessoa...",
  "currentLeadInterest": 45,
  "objectionRaised": "Preço muito alto comparado ao concorrente atual",
  "coachingTip": "Dica rápida para o vendedor no próximo turno",
  "isDealClosed": false,
  "isDealLost": false
}`;

        try {
            const formattedHistory = input.history.map(h => `${h.sender === 'user' ? 'Vendedor' : input.persona.name}: ${h.text}`).join('\n');
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Histórico da conversa até agora:\n${formattedHistory}\n\nVendedor acabou de falar: "${input.userMessage}"`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'roleplay-turn',
            });

            return cleanAndParseJson<RoleplayTurnOutput>(response.content);
        } catch (error) {
            logger.error({ err: error }, 'Erro no turno de roleplay');
            return {
                personaReply: 'Entendi o seu ponto, mas hoje já temos um fornecedor atendendo nossa frota. O que você tem de diferente?',
                currentLeadInterest: 50,
                isDealClosed: false,
                isDealLost: false,
            };
        }
    }

    async evaluateSession(persona: RoleplayPersona, history: Array<{ sender: 'user' | 'persona'; text: string }>): Promise<RoleplayEvaluationResult> {
        const model = getAiModel('local-llama3-fast', 0.2, 'roleplay-eval');
        const startTime = Date.now();

        const systemPrompt = `Você é um Diretor Comercial e Coach de Vendas B2B de Elite.
Avalie o desempenho completo do vendedor no roleplay simulado contra a seguinte persona:
Persona: ${persona.name} (${persona.role}) - Dificuldade: ${persona.difficulty}

Critérios de Avaliação:
1. Rapport e Escuta Ativa
2. Investigação de Dores e Perguntas Abertas (Metodologia SPIN/Sandler)
3. Contorno da Objeção Principal (${persona.mainObjection})
4. Firmeza no Call to Action / Fechamento de Próximo Passo

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "overallScore": 78,
  "strengths": ["Boa investigação da frota", "Não gaguejou ao falar de preço"],
  "weaknesses": ["Demorou para fazer a pergunta de fechamento"],
  "objectionHandlingScore": 80,
  "clarityScore": 85,
  "closingAttemptScore": 70,
  "actionableFeedback": "Parágrafo detalhado com o plano de ação prático de melhoria para o vendedor."
}`;

        try {
            const formattedHistory = history.map(h => `${h.sender === 'user' ? 'Vendedor' : persona.name}: ${h.text}`).join('\n');
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Transcrição Completa do Treinamento:\n${formattedHistory}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'roleplay-eval',
            });

            return cleanAndParseJson<RoleplayEvaluationResult>(response.content);
        } catch (error) {
            logger.error({ err: error }, 'Erro ao avaliar sessão de roleplay');
            return {
                overallScore: 75,
                strengths: ['Boa postura durante o contato inicial'],
                weaknesses: ['Reforçar justificativa de ROI'],
                objectionHandlingScore: 70,
                clarityScore: 80,
                closingAttemptScore: 75,
                actionableFeedback: 'Excelente iniciativa. Na próxima rodada, aprofunde a investigação das dores financeiras antes de apresentar a solução.',
            };
        }
    }
}
