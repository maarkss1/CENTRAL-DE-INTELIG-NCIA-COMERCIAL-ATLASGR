import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';
import type { SearchHit } from '../search.service.js';

export interface CopilotQueryInput {
    question: string;
    /** Trechos reais recuperados por `searchService.hybridSearch` — nunca fornecidos pelo cliente. */
    hits: SearchHit[];
    userRole?: string;
}

/** Citação real, resolvida a partir de um `SearchHit` — nunca texto livre inventado pelo LLM. */
export interface CopilotCitation {
    documentId: string;
    chunkId: string;
    documentTitle: string;
    chunkIndex: number;
    score: number;
}

export interface CopilotAnswerOutput {
    directAnswer: string;
    technicalSpecifications: string[];
    recommendedCompatibilityNotes?: string;
    confidenceScore: number; // 0 a 100
    sourceReferences: CopilotCitation[];
}

/** Forma bruta que pedimos ao LLM — `citedSnippetIndexes` referencia a lista numerada no prompt, nunca texto livre. */
interface RawCopilotResponse {
    directAnswer: string;
    technicalSpecifications: string[];
    recommendedCompatibilityNotes?: string;
    confidenceScore: number;
    citedSnippetIndexes: number[];
}

export class KnowledgeCopilotService {
    /**
     * AI-010: a resposta nunca é gerada com PII/conteúdo do cliente — a IA só vê os trechos de
     * documentos internos da base de conhecimento do tenant (manuais, regras de PGR), que já
     * passaram pela busca híbrida real (`searchService.hybridSearch`). O "gate de citação" aqui é
     * estrutural, não um pedido de honestidade ao modelo: o LLM nunca escreve o nome/título de uma
     * fonte — ele só pode apontar o ÍNDICE de um trecho que nós fornecemos, e nós resolvemos esse
     * índice de volta para os metadados reais (`documentId`/`chunkId`/`score`) do `SearchHit`
     * correspondente. Um índice inventado, fora de faixa ou duplicado é descartado, nunca vira uma
     * citação — a lista de citações finais é sempre um subconjunto verificável dos hits reais.
     */
    async answerTechnicalQuestion(input: CopilotQueryInput): Promise<CopilotAnswerOutput> {
        const model = getAiModel('local-llama3-fast', 0.2, 'knowledge-copilot');
        const startTime = Date.now();

        const systemPrompt = `Você é o Engenheiro Especialista e Copiloto Técnico de Soluções da AtlasGR / TotalTrac.
Sua missão é responder dúvidas técnicas e comerciais de consultores sobre hardwares, rastreadores, sensores de telemetria, atuadores (bloqueio, travas, sirenes) e regras de PGR (Plano de Gerenciamento de Risco).
Regras:
1. Baseie-se EXCLUSIVAMENTE nos trechos numerados fornecidos abaixo (RAG) — nunca em conhecimento externo ou memorizado.
2. Se a informação não estiver clara nos trechos, declare explicitamente com honestidade técnica em vez de inventar.
3. Seja preciso, cite pinagens, frequências e protocolos se aplicável.
4. NUNCA escreva o nome/título de uma fonte no texto — para indicar de onde veio uma informação, cite apenas o NÚMERO do trecho em "citedSnippetIndexes". Não invente números que não estejam na lista fornecida.

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
  "citedSnippetIndexes": [1, 3]
}`;

        const hasContext = input.hits.length > 0;
        const contextText = hasContext
            ? input.hits.map((hit, index) => `[${index + 1}] ${hit.content}`).join('\n---\n')
            : 'Nenhum documento da base de conhecimento foi encontrado para esta pergunta.';

        try {
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Trechos Numerados da Base de Conhecimento:\n${contextText}\n\nDúvida do Consultor:\n${input.question}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'knowledge-copilot-answer',
            });

            const raw = cleanAndParseJson<RawCopilotResponse>(response.content);

            return {
                directAnswer: raw.directAnswer,
                technicalSpecifications: raw.technicalSpecifications ?? [],
                recommendedCompatibilityNotes: raw.recommendedCompatibilityNotes,
                confidenceScore: raw.confidenceScore,
                sourceReferences: this.resolveCitations(raw.citedSnippetIndexes, input.hits),
            };
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

    /**
     * Resolve os índices (1-based, como no prompt) devolvidos pelo LLM de volta para os `SearchHit`
     * reais correspondentes — descartando silenciosamente qualquer índice fora de faixa, não-inteiro
     * ou duplicado. Nunca lança: um índice inválido é uma alucinação de citação, não um erro fatal —
     * a resposta continua sendo devolvida, só sem aquela citação específica.
     */
    private resolveCitations(citedSnippetIndexes: unknown, hits: SearchHit[]): CopilotCitation[] {
        if (!Array.isArray(citedSnippetIndexes)) return [];

        const seen = new Set<number>();
        const citations: CopilotCitation[] = [];

        for (const raw of citedSnippetIndexes) {
            const index = typeof raw === 'number' ? raw : Number(raw);
            if (!Number.isInteger(index) || index < 1 || index > hits.length || seen.has(index)) continue;
            seen.add(index);

            const hit = hits[index - 1]!;
            citations.push({
                documentId: hit.documentId,
                chunkId: hit.chunkId,
                documentTitle: hit.documentTitle,
                chunkIndex: hit.chunkIndex,
                score: hit.score,
            });
        }

        return citations;
    }
}
