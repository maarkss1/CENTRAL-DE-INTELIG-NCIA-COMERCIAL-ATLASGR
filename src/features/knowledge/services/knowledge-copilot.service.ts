import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface CopilotQueryInput {
    question: string;
    retrievedDocumentSnippets: string[];
    userRole?: string;
}

export interface CopilotAnswerOutput {
    directAnswer: string;
    technicalSpecifications: string[];
    recommendedCompatibilityNotes?: string;
    confidenceScore: number; // 0 a 100
    sourceReferences: string[];
}

export class KnowledgeCopilotService {
    async answerTechnicalQuestion(input: CopilotQueryInput): Promise<CopilotAnswerOutput> {
        const model = getAiModel('local-llama3-fast', 0.2, 'knowledge-copilot');
        const startTime = Date.now();

        const systemPrompt = `Você é o Engenheiro Especialista e Copiloto Técnico de Soluções da AtlasGR / TotalTrac.
Sua missão é responder dúvidas técnicas e comerciais de consultores sobre hardwares, rastreadores, sensores de telemetria, atuadores (bloqueio, travas, sirenes) e regras de PGR (Plano de Gerenciamento de Risco).
Regras:
1. Baseie-se prioritariamente nos trechos de documentos fornecidos (RAG).
2. Se a informação não estiver clara nos documentos, declare explicitamente com honestidade técnica.
3. Seja preciso, cite pinagens, frequências e protocolos se aplicável.

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "directAnswer": "Resposta clara, direta e técnica...",
  "technicalSpecifications": [
    "Alimentação: 9V a 36V DC",
    "Comunicação: 4G / LTE Cat-M1 com fallback 2G",
    "Sensores suportados: Temperatura 1-Wire, Trava de Baú e Sensor de Porta"
  ],
  "recommendedCompatibilityNotes": "Homologado para carretas frigoríficas e bitrens graneleiros",
  "confidenceScore": 95,
  "sourceReferences": ["Manual do Módulo Atlas v2.4", "Tabela de Compatibilidade 2026"]
}`;

        try {
            const contextText = input.retrievedDocumentSnippets.join('\n---\n');
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Documentos Internos de Apoio:\n${contextText || 'Nenhum documento específico encontrado.'}\n\nDúvida do Consultor:\n${input.question}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'knowledge-copilot-answer',
            });

            return cleanAndParseJson<CopilotAnswerOutput>(response.content);
        } catch (error) {
            logger.error({ err: error }, 'Erro no Copiloto de Conhecimento');
            return {
                directAnswer: 'Não foi possível sintetizar a resposta com os dados atuais. Por favor, consulte o suporte de engenharia.',
                technicalSpecifications: [],
                confidenceScore: 40,
                sourceReferences: [],
            };
        }
    }
}
