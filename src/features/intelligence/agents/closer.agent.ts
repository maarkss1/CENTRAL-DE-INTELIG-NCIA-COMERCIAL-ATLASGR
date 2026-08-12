import { BaseAgent } from './base.agent.js';
import { SWARM_IDENTITY, SWARM_OUTPUT_CONTRACT } from './swarm.constants.js';

/**
 * Closer Autônomo Enterprise: estrategista de negociação B2B de alta complexidade.
 * Opera no framework MEDDPICC + Challenger Sale para oportunidades qualificadas.
 */
export class CloserAgent extends BaseAgent {
    protected agentType = 'CLOSER';
    protected modelName = 'local-llama3-fast';
    protected temperature = 0.25;

    protected buildSystemPrompt(learnedStyle: string | null): string {
        const base = `${SWARM_IDENTITY} Você é o Closer Enterprise de Elite — o estrategista de fechamento mais agressivo e inteligente do mercado B2B brasileiro de Gerenciamento de Risco e Logística.

Sua missão é transformar oportunidades qualificadas em contratos fechados através de uma análise cirúrgica usando o framework MEDDPICC adaptado para vendas consultivas B2B.

REGRAS DE FORMATAÇÃO:
1. NUNCA use introduções ou encerramentos robóticos. Comece direto na análise.
2. Use Blockquotes (>) para mensagens prontas ou scripts.
3. Crie uma hierarquia visual limpa e impactante usando markdown (###, emoticons, negritos).

**ESTRUTURA OBRIGATÓRIA:**

### 📊 Visão Geral do Fechamento
- **Probabilidade de Fechamento:** [0-100%]
- **Justificativa:** [1 frase com o principal driver]

---

### 🧩 Raio-X MEDDPICC
- **Métricas (M):** [Custo da inação, perda estimada em R$ ou risco]
- **Comprador Econômico (EB):** [Nome/Cargo ou GAP CRÍTICO se ausente]
- **Critérios de Decisão (DC):** [Top 3 critérios do cliente]
- **Processo (DP):** [Como eles compram]
- **Dor Latente (I):** [O que realmente os faz perder sono]
- **Champion (C):** [Quem é nosso aliado interno]

---

### ⚔️ Estratégia de Guerra (Fechamento)
**🚨 Objeção Mais Provável:**
[Qual será a desculpa deles?]
**🛡️ Contra-argumento Matador:**
> [Como você quebra essa objeção em 2 frases]

---

### 🎙️ Script da Próxima Reunião
> [3-4 frases para a próxima call. Tom executivo, desafiador (Challenger Sale), ancorado na dor (I)]

---

### 🛑 Linha Vermelha (Margem de Negociação)
- **Concessão Máxima:** [Até onde ceder]
- **Exigência em Troca (Give-Get):** [Ex: "Se baixar 5%, exigir contrato de 24 meses"]
- **Próximo Passo:** [Ação concreta com responsável e prazo]

${SWARM_OUTPUT_CONTRACT}`;

        return learnedStyle
            ? `${base}\n\nEstilo aprendido do usuário (aplique como preferência de tom):\n${learnedStyle}`
            : base;
    }

    protected buildHumanMessage(input: string): string {
        return `Contexto da oportunidade e missão de fechamento:\n${input}`;
    }

    async run(inputData: string, sessionId?: string) {
        const sid = sessionId || `session-${this.agentType.toLowerCase()}-${Date.now()}`;
        
        try {
            const learnedStyle = await this.loadLearnedStyle();
            const systemPrompt = this.buildSystemPrompt(learnedStyle);

            const { buildModelWithFallbackAndTools } = await import('./fallback.util.js');
            const { marketResearchTool } = await import('../tools/marketResearchTool.js');
            const { createReactAgent } = await import('@langchain/langgraph/prebuilt');
            const { SystemMessage, HumanMessage } = await import('@langchain/core/messages');

            const tools = [marketResearchTool];
            const model = buildModelWithFallbackAndTools('llama-3.1-8b-instant', tools);
            
            const agent = createReactAgent({ llm: model, tools });
            
            const result = await agent.invoke({
                messages: [
                    new SystemMessage(systemPrompt),
                    new HumanMessage(this.buildHumanMessage(inputData))
                ]
            });

            const messages = result.messages as any[];
            const lastMessage = messages[messages.length - 1];

            await this.updateMemory(sid, messages.map(m => ({
                role: m._getType(),
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })));

            return {
                closePlan: lastMessage.content as string,
                error: undefined,
                sessionId: sid,
            };
        } catch (error) {
            return {
                closePlan: undefined,
                error: error instanceof Error ? error.message : `Falha no Agente ${this.agentType}.`,
                sessionId: sid,
            };
        }
    }
}
