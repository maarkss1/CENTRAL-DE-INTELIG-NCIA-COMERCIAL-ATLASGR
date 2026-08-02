const VOICEBOX_API_URL = process.env.VOICEBOX_API_URL || 'http://127.0.0.1:17493';
const VOICEBOX_PROFILE_ID = process.env.VOICEBOX_PROFILE_ID;

export async function synthesizeSpeech(text: string, language = 'pt'): Promise<Buffer> {
    if (!VOICEBOX_PROFILE_ID) {
        throw new Error('VOICEBOX_PROFILE_ID não configurado — crie um voice profile no Voicebox (http://127.0.0.1:17493) e defina a env var.');
    }

    const response = await fetch(`${VOICEBOX_API_URL}/generate/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            profile_id: VOICEBOX_PROFILE_ID,
            text,
            language,
            engine: 'qwen_custom_voice',
            model_size: '0.6B',
        }),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText);
        throw new Error(`Voicebox retornou ${response.status}: ${detail}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
