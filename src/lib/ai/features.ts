import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getAiModel } from './gateway.js';

const callModel = async (systemPrompt: string, userPrompt: string, model: string = 'gemini-pro') => {
    const aiModel = getAiModel(model);
    const result = await aiModel.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
    ]);
    return result.content;
};

const callModelJson = async <T>(systemPrompt: string, userPrompt: string, model: string = 'gemini-flash'): Promise<T> => {
    const aiModel = getAiModel(model);
    const result = await aiModel.invoke([
        new SystemMessage(`${systemPrompt}\n\nRespond strictly in JSON format without markdown blocks or code formatting.`),
        new HumanMessage(userPrompt),
    ]);

    let content = result.content.trim();
    if (content.startsWith('```json')) {
        content = content.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (content.startsWith('```')) {
        content = content.replace(/^```/, '').replace(/```$/, '').trim();
    }

    try {
        return JSON.parse(content) as T;
    } catch {
        throw new Error(`Failed to parse AI JSON response: ${content}`);
    }
};

export interface SentimentResult { sentiment: 'Positivo' | 'Negativo' | 'Neutro'; confidence: number; }
export interface KeywordResult { keywords: string[]; }
export interface CategorizationResult { industry: string; segment: string; reasoning: string; }
export interface ActionItemsResult { actionItems: Array<{ task: string; owner?: string; deadline?: string }>; }
export interface TranslationResult { translatedText: string; }

export const summarizeLead = async (leadData: string) => callModel('Você é um assistente da AtlasGR especializado em resumir perfis de leads no mercado B2B.', `Resuma as seguintes informações do lead de forma estratégica, focando em oportunidades de negócios e logística corporativa:\n${leadData}`, 'gemini-pro');
export const generateEmailDraft = async (context: string, goal: string) => callModel('Você é um SDR experiente da AtlasGR, especializado em escrever e-mails frios e follow-ups persuasivos B2B.', `Escreva um e-mail profissional com foco em alta taxa de resposta.\nContexto: ${context}\nObjetivo: ${goal}`, 'gemini-pro');
export const predictConversionScore = async (leadData: string) => callModel('Você é um Analista de RevOps avançado da AtlasGR.', `Avalie os dados qualitativos deste lead B2B e forneça uma estimativa de probabilidade de conversão (0 a 100%). Justifique criticamente apontando sinais vitais de compra.\nDados: ${leadData}`, 'gemini-pro');
export const generateMeetingAgenda = async (topic: string, duration: string) => callModel('Você é um Consultor de Vendas Enterprise da AtlasGR.', `Gere uma pauta (agenda) estruturada, orientada a fechamento e discovery, para uma reunião B2B com os seguintes detalhes:\nTópico: ${topic}\nDuração: ${duration}`, 'gemini-pro');
export const draftFollowUp = async (previousInteraction: string) => callModel('Você é um especialista em vendas B2B focado em cadências de follow-up que geram engajamento.', `Crie uma mensagem de follow-up engajadora (sem soar insistente demais) baseada na interação anterior:\nInteração Anterior: ${previousInteraction}`, 'gemini-pro');
export const scoreLeadQuality = async (leadData: string) => callModel('Você é um Diretor de Vendas B2B responsável por qualificação rigorosa (BANT/SPIN).', `Classifique a maturidade do lead (Fria, Morna, Quente) detalhando objetivamente por que essa classificação foi dada com base nos dados:\n${leadData}`, 'gemini-pro');
export const suggestNextAction = async (leadStatus: string, recentHistory: string) => callModel('Você é um mentor de Inside Sales B2B.', `Com base no status do lead e no histórico recente de touchpoints, sugira a próxima ação tática mais provável de gerar avanço no funil:\nStatus: ${leadStatus}\nHistórico: ${recentHistory}`, 'gemini-pro');
export const generateObjectionHandling = async (objection: string) => callModel('Você é um treinador de objeções de vendas complexas (logística/tecnologia B2B).', `O prospect levantou a seguinte objeção. Forneça 3 estratégias de contorno (Reframe, Pivot, Case Study) para superá-la:\nObjeção: ${objection}`, 'gemini-pro');
export const analyzeCompetitors = async (companyDescription: string) => callModel('Você é um Inteligência de Mercado B2B (Competitive Intelligence).', `A partir da descrição desta empresa, deduz e liste quem seriam seus 5 prováveis concorrentes diretos no mercado (seja global ou LATAM):\n${companyDescription}`, 'gemini-pro');
export const generateElevatorPitch = async (productDetails: string) => callModel('Você é um Copywriter de Vendas Enterprise.', `Crie um 'elevator pitch' magnético de no máximo 30 segundos (em formato de texto) destacando o ROI para este produto/serviço:\n${productDetails}`, 'gemini-pro');
export const identifyPainPoints = async (customerFeedback: string) => callModel('Você é um especialista em CS (Customer Success) e Discovery de vendas B2B.', `Mapeie e liste de forma acionável as dores primárias (pain points) explícitas e implícitas contidas neste feedback/ata de reunião:\n${customerFeedback}`, 'gemini-pro');
export const createColdCallScript = async (targetAudience: string, valueProposition: string) => callModel('Você é um SDR Outbound de alta conversão.', `Crie um script de Cold Call B2B (abertura, quebra-gelo, pitch de 15s e call-to-action) voltado para este cenário:\nPúblico-alvo: ${targetAudience}\nProposta de Valor: ${valueProposition}`, 'gemini-pro');
export const summarizeMeetingNotes = async (transcript: string) => callModel('Você é um BDR focado em documentação de CRM.', `Transforme a transcrição desta reunião de vendas B2B em um resumo executivo com os principais tópicos discutidos:\n${transcript}`, 'gemini-pro');
export const generateLinkedInMessage = async (prospectProfile: string, purpose: string) => callModel('Você é um estrategista de Social Selling no LinkedIn.', `Escreva uma mensagem de conexão hyper-personalizada (limite 300 caracteres) focada em conversão silenciosa:\nPerfil: ${prospectProfile}\nObjetivo: ${purpose}`, 'gemini-pro');
export const evaluateDealRisk = async (dealDetails: string) => callModel('Você é um Gerente de Pipeline de Vendas B2B (Deal Desk).', `Analise os sinais presentes nesta negociação, determine o Risco (Baixo, Médio, Alto) e aponte os buracos que o vendedor deixou abertos:\n${dealDetails}`, 'gemini-pro');

export const analyzeSentiment = async (text: string): Promise<SentimentResult> => callModelJson<SentimentResult>('Você é um sistema de análise de sentimentos NLP. Output no formato JSON: { "sentiment": "Positivo" | "Negativo" | "Neutro", "confidence": number }.', `Analise o texto: "${text}"`, 'gemini-flash');
export const extractKeywords = async (text: string): Promise<KeywordResult> => callModelJson<KeywordResult>('Você é um extrator de Named Entity Recognition. Extraia palavras-chave e tópicos comerciais B2B do texto. Output no formato JSON: { "keywords": ["string"] }.', `Texto: "${text}"`, 'gemini-flash');
export const categorizeLead = async (leadDescription: string): Promise<CategorizationResult> => callModelJson<CategorizationResult>('Você é um classificador de verticais de mercado B2B. Output no formato JSON: { "industry": "string", "segment": "string", "reasoning": "string" }.', `Descrição da empresa: "${leadDescription}"`, 'gemini-flash');
export const translateText = async (text: string, targetLanguage: string): Promise<TranslationResult> => callModelJson<TranslationResult>(`Você é um tradutor API preciso. Output no formato JSON: { "translatedText": "string" }. Traduza para ${targetLanguage}.`, `Texto original: "${text}"`, 'gemini-flash');
export const extractActionItems = async (transcript: string): Promise<ActionItemsResult> => callModelJson<ActionItemsResult>('Você é um extrator de Next Steps (Action Items). Output no formato JSON: { "actionItems": [{ "task": "string", "owner": "string opcional", "deadline": "string opcional" }] }.', `Transcrição ou Ata: "${transcript}"`, 'gemini-flash');
