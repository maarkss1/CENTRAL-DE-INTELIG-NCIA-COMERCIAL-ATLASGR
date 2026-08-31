/**
 * mem0 — Memória persistente para agentes IA
 *
 * Resolve o gap mapeado em PRODUCT_EXPERIENCE_CENTRAL_ATLASGR.md:
 * "AIDockWidget e useAssistantChat não lembram contexto entre sessões".
 *
 * mem0 persiste memória por userId + agentId, com backend configurável:
 * - Vector store: Qdrant (self-hosted, já no docker-compose.services.yml)
 * - LLM para extração de memória: LiteLLM (já disponível em :4000)
 *
 * Uso:
 *   import { agentMemory } from '@/lib/ai/memory/mem0';
 *
 *   // Adicionar memória após interação
 *   await agentMemory.add([{ role: 'user', content: 'Prefiro emails formais' }], { userId, agentId: 'atlas-sdr' });
 *
 *   // Recuperar memórias relevantes antes de chamar o LLM
 *   const memories = await agentMemory.search('preferência de comunicação', { userId, agentId: 'atlas-sdr' });
 *
 *   // Formatar para injeção no system prompt
 *   const context = agentMemory.formatForPrompt(memories);
 */

// Configuração baseada em variáveis de ambiente com fallbacks para dev
const MEM0_CONFIG = {
  vector_store: {
    provider: 'qdrant',
    config: {
      host: process.env.QDRANT_HOST ?? 'localhost',
      port: Number(process.env.QDRANT_PORT ?? 6333),
      collection_name: 'atlasgr_agent_memories',
    },
  },
  llm: {
    provider: 'openai',
    config: {
      // LiteLLM é compatível com a API OpenAI — usa o mesmo endpoint
      base_url: process.env.LITELLM_URL ?? 'http://localhost:4000/v1',
      api_key: process.env.LITELLM_MASTER_KEY ?? 'sk-atlas-master',
      model: process.env.MEM0_MODEL ?? 'groq/llama-3.3-70b-versatile',
    },
  },
  embedder: {
    provider: 'openai',
    config: {
      base_url: process.env.LITELLM_URL ?? 'http://localhost:4000/v1',
      api_key: process.env.LITELLM_MASTER_KEY ?? 'sk-atlas-master',
      model: process.env.MEM0_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    },
  },
  // Separação de memórias por tenant (AtlasGR / TotalTrac)
  // O userId DEVE sempre incluir o tenantId para garantir isolamento:
  // ex: "org_atlas_123:usr_abc" — nunca apenas "usr_abc"
  version: 'v1.1',
};

export interface MemorySearchResult {
  id: string;
  memory: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface AgentMemoryOptions {
  userId: string;
  agentId?: string;
  sessionId?: string;
}

/**
 * Wrapper sobre mem0 SDK (lazy-loaded para não quebrar o bundle se mem0 não estiver instalado).
 * Falha silenciosamente quando mem0 não está disponível (ex.: ambientes de teste).
 */
class AgentMemoryClient {
  private client: unknown = null;
  private initialized = false;

  private async getClient() {
    if (this.initialized) return this.client;
    this.initialized = true;
    try {
      // mem0ai não tem types — import dinâmico para evitar erros de TS em tempo de build
      const { MemoryClient } = await import('mem0ai');
      // Se MEM0_API_KEY estiver definida, usa o serviço cloud mem0
      // Caso contrário, usa o cliente local com Qdrant self-hosted
      if (process.env.MEM0_API_KEY) {
        this.client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY });
      } else {
        const { Memory } = await import('mem0ai');
        this.client = new Memory(MEM0_CONFIG);
      }
    } catch {
      // mem0 não instalado ou Qdrant indisponível — memória desabilitada
      console.warn('[mem0] Memória de agente indisponível — modo sem memória persistente');
      this.client = null;
    }
    return this.client;
  }

  /**
   * Adiciona mensagens à memória do agente.
   * Chame após cada turno de conversa para persistir o aprendizado.
   */
  async add(
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
    options: AgentMemoryOptions,
  ): Promise<void> {
    const client = await this.getClient();
    if (!client) return;
    try {
      await (
        client as {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          add: (...args: any[]) => Promise<void>;
        }
      ).add(messages, {
        user_id: options.userId,
        agent_id: options.agentId,
        session_id: options.sessionId,
      });
    } catch (err) {
      console.warn('[mem0] Falha ao adicionar memória:', err);
    }
  }

  /**
   * Busca memórias relevantes para a query.
   * Use antes de chamar o LLM para injetar contexto personalizado.
   */
  async search(query: string, options: AgentMemoryOptions): Promise<MemorySearchResult[]> {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const results = await (
        client as {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          search: (...args: any[]) => Promise<MemorySearchResult[]>;
        }
      ).search(query, {
        user_id: options.userId,
        agent_id: options.agentId,
        limit: 5,
      });
      return results;
    } catch (err) {
      console.warn('[mem0] Falha ao buscar memória:', err);
      return [];
    }
  }

  /**
   * Formata resultados de busca para injeção no system prompt do LLM.
   *
   * Uso:
   *   const memories = await agentMemory.search(userMessage, { userId });
   *   const systemPrompt = `Você é o Atlas SDR...\n\n${agentMemory.formatForPrompt(memories)}`;
   */
  formatForPrompt(memories: MemorySearchResult[]): string {
    if (memories.length === 0) return '';
    const lines = memories.map((m) => `- ${m.memory}`).join('\n');
    return `\n\n## Memória do usuário (contexto personalizado)\n${lines}\n`;
  }

  /**
   * Remove todas as memórias de um usuário (LGPD — direito ao esquecimento).
   * Deve ser chamado quando um usuário solicita exclusão de dados pessoais.
   */
  async deleteUser(userId: string): Promise<void> {
    const client = await this.getClient();
    if (!client) return;
    try {
      await (
        client as {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete_all: (...args: any[]) => Promise<void>;
        }
      ).delete_all({ user_id: userId });
    } catch (err) {
      console.warn('[mem0] Falha ao deletar memórias do usuário:', err);
    }
  }
}

/** Instância singleton do cliente de memória. */
export const agentMemory = new AgentMemoryClient();
