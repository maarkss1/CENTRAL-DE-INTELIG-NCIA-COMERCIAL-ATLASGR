/**
 * Geração de embeddings — caminho separado do chat completion (modelo diferente, contrato de
 * resposta diferente, e o provedor padrão hoje nem sai para a rede). Usado para a Memória
 * Vetorial (RAG) do Agente SDR via pgvector.
 */
import { callProvider } from './circuit-breaker.js';
import { readProviderError } from './redaction.js';
import { normalizeApiBaseUrl, resolveEmbeddingTimeoutMs } from './http-client.js';

const MAX_EMBEDDING_INPUT_CHARS = 100_000;

export const generateEmbedding = async (
  text: string,
  kind: 'query' | 'passage' = 'passage',
): Promise<number[]> => {
  // Provedor padrão é o modelo local: não depende de chave, de cota nem de serviço externo no ar.
  // `EMBEDDINGS_PROVIDER=gateway` volta ao caminho antigo (LiteLLM → Google) quando desejado.
  if ((process.env.EMBEDDINGS_PROVIDER || 'local') === 'local') {
    const { embedLocal } = await import('../local-embeddings.js');
    return embedLocal(text, kind);
  }

  // EMBEDDINGS_PROVIDER=gateway é o caminho legado via proxy LiteLLM (pré-modelo local). O
  // modelo servido pelo proxy é definido em litellm-config.yaml, fora deste código.
  const LITELLM_URL = normalizeApiBaseUrl(process.env.LITELLM_URL || 'http://localhost:4000');
  const LITELLM_KEY = process.env.LITELLM_KEY || 'sk-litellm';
  const normalizedText = text.trim();
  if (!normalizedText) throw new Error('O texto do embedding não pode ser vazio.');
  if (normalizedText.length > MAX_EMBEDDING_INPUT_CHARS) {
    throw new Error(`O texto do embedding excede ${MAX_EMBEDDING_INPUT_CHARS} caracteres.`);
  }

  return callProvider('embedding', async () => {
    const response = await fetch(`${LITELLM_URL}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LITELLM_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.LITELLM_EMBEDDING_MODEL || 'text-embedding-3-small',
        input: normalizedText,
      }),
      signal: AbortSignal.timeout(resolveEmbeddingTimeoutMs()),
    });

    if (!response.ok) {
      throw new Error(
        `Falha ao gerar embedding (HTTP ${response.status}): ${await readProviderError(response)}`,
      );
    }

    const data = (await response.json()) as { data?: Array<{ embedding?: unknown }> };
    const embedding = data.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0 || !embedding.every(Number.isFinite)) {
      throw new Error('O provedor retornou um embedding inválido.');
    }
    return embedding as number[];
  });
};
