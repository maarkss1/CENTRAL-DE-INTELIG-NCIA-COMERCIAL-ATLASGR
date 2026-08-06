import type { StudioGenerationRequest } from '../schema.js';
import { ocrExtractResultSchema } from '../schema.js';
import { SYSTEM_RULES, invokeStructured, jsonOnlyInstruction } from '../shared.js';

export async function generateOcrExtract(request: Extract<StudioGenerationRequest, { kind: 'ocr_extract' }>) {
    const prompt = `${SYSTEM_RULES}

Um usuário fotografou um cartão de visita, fachada ou documento de uma empresa e o texto abaixo foi extraído por
OCR — pode ter erros de leitura, texto fora de ordem e ruído. Extraia os dados reais de empresa/contato presentes
no texto. NUNCA invente um dado que não esteja no texto: se um campo não aparecer, retorne null nele. "confidence"
deve refletir o quanto o texto realmente parece uma empresa/contato legível (alta/media/baixa), não sua vontade
de ajudar.

TEXTO EXTRAÍDO POR OCR:
${request.inputs.rawText}

${jsonOnlyInstruction('{"tradeName":"string ou null","segment":"string ou null","location":"string ou null","phone":"string ou null","email":"string ou null","website":"string ou null","contactName":"string ou null","contactRole":"string ou null","confidence":"alta|media|baixa"}')}`;
    return invokeStructured(
        prompt,
        'studio:ocr-extract',
        ocrExtractResultSchema,
        '{"tradeName":"string|null","segment":"string|null","location":"string|null","phone":"string|null","email":"string|null","website":"string|null","contactName":"string|null","contactRole":"string|null","confidence":"alta|media|baixa"}',
        0.2,
    );
}
