/**
 * Roteamento de nomes lógicos de modelo → nome real que cada provedor espera. Isolado do resto
 * do gateway para que trocar de provedor (ou o modelo que um provedor resolve por baixo) nunca
 * exija tocar em regra de negócio: quem chama `getAiModel('local-llama3', ...)` continua
 * funcionando igual, só este arquivo muda.
 */

// Nome lógico mantido por compatibilidade com os serviços existentes. Renomeado de "gemini-pro"
// (IA-001): esse nome sugeria o Gemini real do Google, mas o alias sempre resolveu, por padrão,
// para um modelo Ollama local via litellm-config.yaml — nunca para o Gemini de verdade.
export const LOCAL_MODEL = 'local-llama3';

// O app usa nomes lógicos para não acoplar cada ferramenta a um provedor específico.
// O LiteLLM/Ollama resolve esses nomes conforme litellm-config.yaml / modelo instalado.
const MODEL_ALIASES: Record<string, string> = {
  'qwen-2.5-coder': 'qwen-coder',
  'deepseek-coder-v2': 'deepseek-coder',
};

const GROQ_MODEL_ALIASES: Record<string, string> = {
  'local-llama3': 'openai/gpt-oss-120b',
  'local-llama3-fast': 'openai/gpt-oss-20b',
  'gpt-4o': 'openai/gpt-oss-120b',
  'gpt-4o-mini': 'openai/gpt-oss-20b',
  'claude-sonnet': 'openai/gpt-oss-120b',
};

/** Resolve o nome lógico pedido pelo chamador para o nome canônico usado internamente
 * (independente de provedor) — ex.: `qwen-2.5-coder` → `qwen-coder`. */
export function resolveModelName(modelName: string): string {
  return MODEL_ALIASES[modelName] || modelName;
}

/** Resolve o nome canônico para o nome específico que a API do Groq espera. */
export function resolveGroqModelName(resolvedModel: string): string {
  return GROQ_MODEL_ALIASES[resolvedModel] || resolvedModel;
}
