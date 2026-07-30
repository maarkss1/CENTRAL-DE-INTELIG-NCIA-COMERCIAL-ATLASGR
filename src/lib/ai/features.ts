import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getAiModel } from './gateway';

const callModel = async (systemPrompt: string, userPrompt: string, model: string = 'gemini-pro') => {
    const aiModel = getAiModel(model);
    const result = await aiModel.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
    ]);
    return result.content;
};

export const summarizeLead = async (leadData: string) => {
    return callModel(
        'Você é um assistente de CRM de logística B2B especializado em resumir perfis de leads.',
        `Resuma as seguintes informações do lead, focando em oportunidades de negócios e logística:\n${leadData}`
    );
};

export const generateEmailDraft = async (context: string, goal: string) => {
    return callModel(
        'Você é um assistente de CRM de logística B2B especializado em escrever e-mails profissionais.',
        `Escreva um rascunho de e-mail profissional com base neste contexto:\nContexto: ${context}\nObjetivo: ${goal}`
    );
};

export const analyzeSentiment = async (text: string) => {
    return callModel(
        'Você é um assistente de CRM B2B. Analise o sentimento do texto a seguir.',
        `Qual o sentimento (Positivo, Negativo, Neutro) deste texto?\nTexto: ${text}`
    );
};

export const extractKeywords = async (text: string) => {
    return callModel(
        'Você é um assistente de CRM B2B. Extraia as palavras-chave mais relevantes.',
        `Extraia as palavras-chave principais do texto abaixo, separadas por vírgula:\nTexto: ${text}`
    );
};

export const categorizeLead = async (leadDescription: string) => {
    return callModel(
        'Você é um assistente de CRM especializado em logística B2B.',
        `Com base nesta descrição, em qual indústria/segmento este lead se enquadra melhor?\nDescrição: ${leadDescription}`
    );
};

export const predictConversionScore = async (leadData: string) => {
    return callModel(
        'Você é um analista de dados de CRM experiente em logística B2B.',
        `Avalie os dados deste lead e forneça uma estimativa de probabilidade de conversão de 0 a 100, junto com uma breve justificativa.\nDados: ${leadData}`
    );
};

export const generateMeetingAgenda = async (topic: string, duration: string) => {
    return callModel(
        'Você é um assistente de vendas de logística B2B.',
        `Gere uma pauta estruturada para uma reunião com os seguintes detalhes:\nTópico: ${topic}\nDuração: ${duration}`
    );
};

export const draftFollowUp = async (previousInteraction: string) => {
    return callModel(
        'Você é um especialista em vendas B2B focado em follow-up eficaz.',
        `Crie uma mensagem de follow-up concisa baseada na interação anterior:\nInteração Anterior: ${previousInteraction}`
    );
};

export const scoreLeadQuality = async (leadData: string) => {
    return callModel(
        'Você é um especialista em qualificação de leads B2B (logística).',
        `Classifique a qualidade do lead (Fria, Morna, Quente) e explique por que, com base nos dados:\n${leadData}`
    );
};

export const translateText = async (text: string, targetLanguage: string) => {
    return callModel(
        `Você é um tradutor fluente em ${targetLanguage}.`,
        `Traduza o seguinte texto para ${targetLanguage}:\n${text}`
    );
};

export const suggestNextAction = async (leadStatus: string, recentHistory: string) => {
    return callModel(
        'Você é um consultor de vendas de logística B2B.',
        `Sugira a melhor próxima ação para este lead:\nStatus: ${leadStatus}\nHistórico Recente: ${recentHistory}`
    );
};

export const generateObjectionHandling = async (objection: string) => {
    return callModel(
        'Você é um negociador experiente em vendas B2B (logística).',
        `Forneça argumentos fortes e respostas para lidar com esta objeção do cliente:\nObjeção: ${objection}`
    );
};

export const analyzeCompetitors = async (companyDescription: string) => {
    return callModel(
        'Você é um analista de inteligência de mercado no setor de logística.',
        `Liste possíveis concorrentes diretos ou alternativas de mercado baseados na descrição da empresa:\n${companyDescription}`
    );
};

export const generateElevatorPitch = async (productDetails: string) => {
    return callModel(
        'Você é um executivo de vendas de alto desempenho em logística.',
        `Crie um 'elevator pitch' convincente de 30 segundos para o seguinte produto/serviço:\n${productDetails}`
    );
};

export const identifyPainPoints = async (customerFeedback: string) => {
    return callModel(
        'Você é um especialista em experiência do cliente de logística.',
        `Identifique as principais dores (pain points) relatadas neste feedback do cliente:\n${customerFeedback}`
    );
};

export const createColdCallScript = async (targetAudience: string, valueProposition: string) => {
    return callModel(
        'Você é um SDR de logística B2B.',
        `Crie um script de cold call curto e eficaz para o seguinte público, enfatizando o valor:\nPúblico: ${targetAudience}\nProposta de Valor: ${valueProposition}`
    );
};

export const summarizeMeetingNotes = async (transcript: string) => {
    return callModel(
        'Você é um assistente executivo.',
        `Crie um resumo claro e conciso desta transcrição de reunião:\n${transcript}`
    );
};

export const generateLinkedInMessage = async (prospectProfile: string, purpose: string) => {
    return callModel(
        'Você é um especialista em social selling B2B.',
        `Escreva uma mensagem de conexão no LinkedIn (máx. 300 caracteres) com base no perfil e objetivo:\nPerfil: ${prospectProfile}\nObjetivo: ${purpose}`
    );
};

export const extractActionItems = async (transcript: string) => {
    return callModel(
        'Você é um gerente de projetos focado em execução.',
        `Extraia uma lista de itens de ação (action items) com responsáveis, se mencionado, a partir desta transcrição:\n${transcript}`
    );
};

export const evaluateDealRisk = async (dealDetails: string) => {
    return callModel(
        'Você é um diretor de vendas responsável por gerenciar pipeline B2B.',
        `Avalie o nível de risco (Baixo, Médio, Alto) deste negócio e aponte os fatores críticos:\n${dealDetails}`
    );
};
