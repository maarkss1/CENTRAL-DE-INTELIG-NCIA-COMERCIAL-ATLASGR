import { createWorker } from 'tesseract.js';
import { logger } from '../../../lib/logger.js';
import { studioService } from '../../intelligence/services/studio.service.js';
import type { ProspectCandidate } from './prospecting.service.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class OcrValidationError extends Error {
    constructor(message: string) {
        super(message);
    }
}

/** Texto cru extraído da imagem (cartão de visita, fachada, lista impressa etc.) via OCR local. */
export async function extractTextFromImage(buffer: Buffer, mimeType: string): Promise<string> {
    if (!ACCEPTED_MIME_TYPES.has(mimeType)) {
        throw new OcrValidationError('Formato de imagem não suportado. Use JPEG, PNG ou WebP.');
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
        throw new OcrValidationError('Imagem maior que 8MB. Envie uma foto mais leve.');
    }

    // 'por+eng' porque cartões/placas de empresas brasileiras costumam misturar termos em inglês
    // (ex.: "CEO", "Sales Manager") com português — reconhecer só um idioma perde texto do outro.
    const worker = await createWorker('por+eng');
    try {
        const { data } = await worker.recognize(buffer);
        const text = data.text.trim();
        if (!text) {
            throw new OcrValidationError('Não foi possível ler nenhum texto nessa imagem. Tente uma foto mais nítida.');
        }
        return text;
    } finally {
        await worker.terminate();
    }
}

/**
 * Estrutura o texto cru do OCR em um candidato pronto para o mesmo fluxo de "promover pro CRM"
 * já usado pela Descoberta (ver prospecting.service.ts/promoteToCrm) — reaproveita o pipeline
 * existente em vez de criar um caminho de cadastro paralelo.
 */
export async function structureOcrCandidate(rawText: string, brand: { name: string; description: string }): Promise<ProspectCandidate> {
    const result = await studioService.generate({
        kind: 'ocr_extract',
        brand,
        inputs: { rawText: rawText.slice(0, 4_000) },
    }) as {
        tradeName: string;
        segment: string | null;
        location: string | null;
        phone: string | null;
        email: string | null;
        website: string | null;
        contactName: string | null;
        contactRole: string | null;
        confidence: 'alta' | 'media' | 'baixa';
    };

    if (!result.tradeName) {
        throw new OcrValidationError('A IA não conseguiu identificar o nome de uma empresa nessa imagem.');
    }

    logger.info({ confidence: result.confidence }, 'OCR estruturado pela IA');

    return {
        tradeName: result.tradeName,
        legalNameGuess: null,
        cnpjGuess: null,
        segment: result.segment || 'Não informado (via OCR)',
        size: 'Não informado',
        location: result.location || 'Não informado',
        fitScoreEstimate: result.confidence === 'alta' ? 65 : result.confidence === 'media' ? 50 : 35,
        suggestedContact: result.contactName ? { name: result.contactName, role: result.contactRole || 'Não informado' } : null,
        rationale: `Extraído por OCR + IA de uma imagem enviada (confiança ${result.confidence}) — confira os dados antes de cadastrar.`,
        phone: result.phone || null,
        website: result.website || null,
        emails: result.email ? [result.email] : undefined,
    };
}
