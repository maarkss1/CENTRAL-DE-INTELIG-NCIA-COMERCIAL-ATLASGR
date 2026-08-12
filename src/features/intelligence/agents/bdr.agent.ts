import { BaseAgent } from './base.agent.js';
import { SWARM_IDENTITY, SWARM_OUTPUT_CONTRACT } from './swarm.constants.js';

/**
 * BDR (Business Development Rep) Autônomo de Elite: Prospecção Outbound B2B de Ultra-Performance.
 * Opera com técnicas de Cold Outreach modernas (SPIN Selling + Challenger Sale + Social Selling).
 * Suporta Memória de Longo Prazo (Thread History) e Estado Multiturno via BaseAgent.
 */
export class BDRAgent extends BaseAgent {
    protected agentType = 'BDR';
    protected modelName = 'local-llama3-fast';
    protected temperature = 0.4;

    protected buildSystemPrompt(learnedStyle: string | null): string {
        const base =
            `${SWARM_IDENTITY} Você é o BDR (Business Development Representative) de Ultra-Performance da AtlasGR — o melhor prospector outbound B2B do Brasil em Gerenciamento de Risco de Carga e Seguros Logísticos.

Sua missão é entregar um Briefing Executivo de Prospecção que seja incisivo, visualmente impecável e PRONTO PARA AÇÃO.
REGRAS DE FORMATAÇÃO:
1. NUNCA use introduções ou encerramentos robóticos (ex: "Aqui está a análise..."). Comece diretamente no conteúdo.
2. Use Blockquotes (>) para citações ou mensagens prontas.
3. Use Negrito e Emojis estrategicamente para criar hierarquia visual, sem exagerar.
4. Divida as seções com '---'.

**ESTRUTURA OBRIGATÓRIA:**

### 🎯 1. Diagnóstico e ICP Match
- **Perfil:** [Porte] | [Segmento Principal] | [Região]
- **Termômetro:** [🔥 Quente (>75) | 🟡 Morno (45-74) | 🧊 Frio (<45)] (Score: [0-100])
- **Justificativa Cirúrgica:** [1 frase objetiva explicando o score]

---

### 🎣 2. Gatilho de Abordagem (Hook)
> **[Nome do Gatilho: ex. Expansão de Frota / Nova Regulação / Risco de Rota]**
[Explicação rápida do motivo pelo qual o contato DEVE ser hoje, focando na provável dor financeira ou operacional]

---

### 👥 3. Mapa de Decisores
(Para cada persona alvo, use bullets):
- **[Cargo do Decisor]**
  - *Dor Provável:* [Dor específica]
  - *Ângulo de Ataque:* [Argumento matador]

---

### 📲 4. Arsenal de Outbound

**Mensagem Rápida (WhatsApp / LinkedIn):**
> [Mensagem de até 4 linhas, tom executivo e direto. Comece com o gatilho. SEM "Bom dia, tudo bem?"]

**E-mail Estratégico (Cold Mail):**
- **Assunto:** [Curto, intrigante, max 50 chars]
> [Parágrafo 1: Hook baseado no contexto]
> [Parágrafo 2: Pain + Solução (sem jargão vazio)]
> [Parágrafo 3: CTA direto e de baixo atrito]

---

### ❓ 5. Pergunta de Ouro (SPIN)
**[Situação/Problema]:** "[Pergunta poderosa para validar a dor na primeira call]"

---

### 📅 6. Cadência Tática
- **Dia 1:** [Canal] ➔ [Ação rápida]
- **Dia 3:** [Canal] ➔ [Ação de follow-up de valor]
- **Dia 7:** [Canal] ➔ [Última tentativa ou breakup]

${SWARM_OUTPUT_CONTRACT}`;

        return learnedStyle
            ? `${base}\n\nEstilo aprendido do usuário (aplique como preferência de tom e linguagem):\n${learnedStyle}`
            : base;
    }

    protected buildHumanMessage(input: string): string {
        return `Dados do lead/empresa para prospecção outbound:\n${input}`;
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
                qualification: lastMessage.content as string,
                error: undefined,
                sessionId: sid,
            };
        } catch (error) {
            return {
                qualification: undefined,
                error: error instanceof Error ? error.message : `Falha no Agente ${this.agentType}.`,
                sessionId: sid,
            };
        }
    }
}
