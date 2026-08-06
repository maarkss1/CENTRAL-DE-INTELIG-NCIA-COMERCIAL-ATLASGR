import { fetchWithTimeout } from '../../../lib/http.js';

const VOICEBOX_API_URL = process.env.VOICEBOX_API_URL || 'http://127.0.0.1:17493';
const VOICEBOX_PROFILE_ID = process.env.VOICEBOX_PROFILE_ID;

export async function synthesizeSpeech(text: string, language = 'pt'): Promise<Buffer> {
    if (!VOICEBOX_PROFILE_ID) {
        throw new Error('VOICEBOX_PROFILE_ID não configurado — crie um voice profile no Voicebox (http://127.0.0.1:17493) e defina a env var.');
    }

    // Timeout: diferente dos outros clientes HTTP externos do módulo, esta chamada não tinha
    // nenhum — se o Voicebox travar, POST /api/agent/tts ficaria pendurado indefinidamente.
    const response = await fetchWithTimeout(`${VOICEBOX_API_URL}/generate/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            profile_id: VOICEBOX_PROFILE_ID,
            text,
            language,
            engine: 'qwen_custom_voice',
            model_size: '0.6B',
        }),
    }, 30_000);

    if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText);
        throw new Error(`Voicebox retornou ${response.status}: ${detail}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
