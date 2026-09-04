import { fetchWithTimeout } from '../../../lib/http.js';

// AUDITORIA (27/08/2026): infraestrutura pronta, sem consumidor ativo hoje.
//
// `POST /api/agent/tts` (src/features/intelligence/routes/agent.routes.ts) chama
// `synthesizeSpeech` abaixo e está corretamente montado em `/api/agent` (ver
// src/bootstrap/routes.ts), mas nenhuma tela do frontend chama essa rota — busca por
// "/tts", "agent/tts" e "synthesizeSpeech" em `src/**/*.tsx` não encontra nenhum chamador. O
// roleplay de vendas (`RoleplayHub.tsx`) usa a Web Speech API nativa do navegador
// (`window.speechSynthesis`) para narrar falas, não este endpoint; ligações de voz reais usam a
// integração Birth Voices (`src/features/integrations/birth-voice/`), um pipeline totalmente
// separado. `VOICEBOX_API_URL` aponta por padrão para `127.0.0.1:17493` — segundo
// `.env.example`, uma instância de Voicebox rodando via docker compose na máquina de um
// desenvolvedor específico (`C:\Users\Mah\Documents\GitHub\voicebox`), não um serviço de
// produção. Em qualquer ambiente implantado essa chamada falha honestamente (ECONNREFUSED, com
// timeout de 30s e mensagem de erro clara — nunca finge sucesso).
//
// Esta mesma investigação já foi feita pelo Agente 12 (Voz e Telefonia) na Onda 7 — ver
// `.agents/handoffs/onda-7/12-para-07-gatilho-ligar-via-sdr-voz.md`, seção "Contexto adicional",
// item 1 — com a mesma conclusão. Decisão (reafirmada nesta auditoria, seguindo a regra de
// preservação de funcionalidade de `/AGENTS.md`): NÃO remover. Não é código decorativo nem
// órfão por engano — é uma feature de TTS para "VoiceRoleplay" implementada ponta a ponta no
// backend, apenas ainda não conectada a nenhuma tela. Se o VoiceRoleplay for retomado, conectar
// o frontend a `/api/agent/tts`; se for descontinuado de fato, essa é uma decisão de produto,
// não uma limpeza técnica silenciosa.
const VOICEBOX_API_URL = process.env.VOICEBOX_API_URL || 'http://127.0.0.1:17493';
const VOICEBOX_PROFILE_ID = process.env.VOICEBOX_PROFILE_ID;

export async function synthesizeSpeech(text: string, language = 'pt'): Promise<Buffer> {
  if (!VOICEBOX_PROFILE_ID) {
    throw new Error(
      'VOICEBOX_PROFILE_ID não configurado — crie um voice profile no Voicebox (http://127.0.0.1:17493) e defina a env var.',
    );
  }

  // Timeout: diferente dos outros clientes HTTP externos do módulo, esta chamada não tinha
  // nenhum — se o Voicebox travar, POST /api/agent/tts ficaria pendurado indefinidamente.
  const response = await fetchWithTimeout(
    `${VOICEBOX_API_URL}/generate/stream`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: VOICEBOX_PROFILE_ID,
        text,
        language,
        engine: 'qwen_custom_voice',
        model_size: '0.6B',
      }),
    },
    30_000,
    // Host vem de env var (decisão do operador, não de um request) — validamos contra o próprio
    // valor configurado, não uma lista fixa (instância auto-hospedada, endereço varia).
    [new URL(VOICEBOX_API_URL).hostname],
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`Voicebox retornou ${response.status}: ${detail}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
