import { GoogleGenAI } from '@google/genai';
import { logger } from '../logger.js';

let ai: GoogleGenAI | null = null;

if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

/**
 * Gera um vetor de embeddings de 768 dimensões para o texto fornecido
 * usando o modelo text-embedding-004 do Google Gemini.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
    if (!ai) {
        logger.warn('GEMINI_API_KEY não está definida. Não é possível gerar embeddings.');
        return null;
    }

    try {
        const response = await ai.models.embedContent({
            model: 'text-embedding-004',
            contents: text,
        });
        
        return response.embeddings?.[0]?.values || null;
    } catch (error) {
        logger.error({ err: error }, 'Erro ao gerar embeddings no Gemini');
        throw error;
    }
}
