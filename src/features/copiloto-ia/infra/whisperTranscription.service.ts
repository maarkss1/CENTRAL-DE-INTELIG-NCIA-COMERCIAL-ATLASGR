/**
 * Adapter de transcrição (speech-to-text) — OpenAI Whisper, decisão explícita do usuário para esta
 * onda (reaproveita `OPENAI_API_KEY`, já configurada para o gateway de chat — mesmo padrão de
 * `src/lib/ai/gateway/providers/openai.provider.ts`: lê `process.env.OPENAI_API_KEY` direto, fora
 * do schema validado de `src/config/env.ts`, seguindo o padrão já existente dos outros provedores
 * de IA). NÃO passa pelo gateway de chat (`getAiModel()`) — Whisper não é chat completion, então
 * orçamento e custo são tratados à parte por quem chama (ver
 * `jobs/transcribeConversation.worker.ts`: `assertAiBudgetNotExceeded()` antes, `AILog` manual
 * depois, preço por minuto de áudio, não por token).
 */
const OPENAI_AUDIO_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-1';
/** Preço público da OpenAI para whisper-1, USD por minuto de áudio (set/2026). */
export const WHISPER_USD_PER_MINUTE = 0.006;

export interface WhisperSegment {
  /** Segundos (float) — convertido para ms inteiros por quem persiste em `CopilotoTranscriptSegment`. */
  start: number;
  end: number;
  text: string;
}

export interface WhisperTranscriptionResult {
  text: string;
  durationSeconds: number;
  segments: WhisperSegment[];
}

export function isWhisperConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

function fileExtensionFor(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] || 'webm';
}

export async function transcribeAudioWithWhisper(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<WhisperTranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Transcrição indisponível: OPENAI_API_KEY não configurada.');
  }

  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
    `audio.${fileExtensionFor(mimeType)}`,
  );
  form.append('model', WHISPER_MODEL);
  form.append('response_format', 'verbose_json');

  const res = await fetch(OPENAI_AUDIO_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`Whisper retornou ${res.status}: ${errorBody.slice(0, 300)}`);
  }

  const body = (await res.json()) as {
    text?: string;
    duration?: number;
    segments?: { start: number; end: number; text: string }[];
  };

  return {
    text: body.text ?? '',
    durationSeconds: body.duration ?? 0,
    segments: (body.segments ?? []).map((segment) => ({
      start: segment.start,
      end: segment.end,
      text: segment.text.trim(),
    })),
  };
}
