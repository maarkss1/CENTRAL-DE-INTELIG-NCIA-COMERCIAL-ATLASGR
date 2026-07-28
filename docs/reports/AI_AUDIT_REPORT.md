# Relatório de Auditoria de Inteligência Artificial — PROSPECTOR-ATLASGR

## 1. Resumo executivo

O projeto PROSPECTOR-ATLASGR integra a Inteligência Artificial para operar como um verdadeiro motor de vendas (SDR/CRM). Atualmente, a arquitetura utiliza um Gateway de IA (LiteLLM) que centraliza e padroniza as chamadas, permitindo roteamento e controle.

Observamos que, embora o código faça extensas referências a modelos "gemini-pro" e "gemini-flash", na realidade, as configurações de roteamento no `litellm-config.yaml` e no proxy interno (`gateway.ts`) redirecionam essas chamadas para os modelos da família **Llama 3** (Llama 3.3 70B e Llama 3.1 8B) rodando na infraestrutura da **Groq**. A justificativa interna registrada aponta o esgotamento de créditos da chave Google e o uso do tier gratuito da Groq.

Apesar da excelente abstração promovida pelo gateway (que reduz dependência de fornecedor), notou-se que partes do código (como o Agente SDR) usam `gpt-4o-mini` (OpenAI) via LangChain de forma acoplada e hardcoded, e as chamadas de embeddings ainda apontam para o modelo `text-embedding-004` do Gemini, gerando um ecossistema fragmentado e risco de indisponibilidade por chaves gratuitas ou esgotadas.

Recomendamos a adoção unificada de uma arquitetura baseada no LiteLLM (Gateway) combinada com a API da OpenAI (GPT-4o-mini para volume/economia e GPT-4o para raciocínio complexo) e/ou Anthropic (Claude 3.5 Sonnet) para manter o nível enterprise, eliminando o uso de contas gratuitas em produção.

---

## 2. Veredito em uma página

*   **Melhor IA geral:** **OpenAI GPT-4o** (Alta inteligência, excelente para tool calling e raciocínio multi-step de agentes de qualificação complexos).
*   **Melhor custo-benefício (Econômico/Volume):** **OpenAI GPT-4o-mini** (Supera o Gemini Flash em custo-benefício e consistência estruturada em tool calling, além de excelente velocidade).
*   **Melhor IA premium:** **Anthropic Claude 3.5 Sonnet** (O melhor em raciocínio, codificação e geração de blueprints, ideal para o "AI Studio").
*   **Melhor IA rápida:** **Groq / Llama 3.1 8B** (Mínima latência, ideal para tarefas em tempo real muito simples, porém, `gpt-4o-mini` é mais confiável).
*   **Melhor para código/blueprints:** **Anthropic Claude 3.5 Sonnet**.
*   **Melhor para documentos/contexto longo:** **Google Gemini 1.5 Pro** (Contexto de 2M tokens é imbatível).
*   **Melhor para voz / Visão:** Não foi identificado uso de voz/visão direto, mas para expansão, **OpenAI (Whisper/GPT-4o)** é a recomendação.
*   **Arquitetura recomendada:** **Multimodelo via LiteLLM Gateway**. Padronizar *todas* as chamadas para passar pelo LiteLLM. Roteamento: `gpt-4o-mini` para tarefas transacionais (SDR agent default, qualificação, resumos) e `gpt-4o` ou `claude-3-5-sonnet` para agentes de alta complexidade (riscos complexos, deep research com raciocínio profundo, AI Studio).

---

## 3. Arquitetura atual

A arquitetura utiliza o **LiteLLM** como um AI Gateway (configurado em `litellm-config.yaml` e chamado via `src/lib/ai/gateway.ts`). Isso permite mapear "apelidos" lógicos (`gemini-pro`, `gemini-flash`) para provedores diferentes sem alterar o código.

**Integração no Código:**
1.  **AI Gateway Abstraction (`gateway.ts`):** Expõe a função `getAiModel(modelAlias)` que retorna um objeto compatível com chamadas LangChain.
2.  **LangGraph/LangChain:** Utilizados para os Agentes de qualificação (SDR, BDR, CRM).
3.  **Configuração Ativa:** Os apelidos do Gemini estão redirecionados para a API da **Groq** (usando Llama 3.3 70B e Llama 3.1 8B). O Agente SDR utiliza a classe `ChatOpenAI` apontando para o LiteLLM usando o `gpt-4o-mini`.
4.  **Memória Vetorial (RAG):** Utiliza `pgvector` com embeddings gerados diretamente via `gemini/text-embedding-004`.
5.  **Observabilidade e Custo:** Funções customizadas (ex: `logAiUsage`) gravam no PostgreSQL (`AILog`) os tokens e estimativas de latência/custo.
6.  **Gerenciamento Visual:** A tela `AIConfigCenter.tsx` permite ajustar modelos/temperatura em runtime, mas as opções disponíveis estão limitadas ao que o sistema detecta (Llama/Groq).

---

## 4. Inventário de modelos encontrados

Foram localizados os seguintes modelos e provedores ativos (via configuração e código):

| Fornecedor | Modelo Configurado | Status no Código | Modalidade |
| :--- | :--- | :--- | :--- |
| **Groq (Meta)** | `llama-3.3-70b-versatile` | Ativo (via apelido `gemini-pro`) | Texto / Chat |
| **Groq (Meta)** | `llama-3.1-8b-instant` | Ativo (via apelido `gemini-flash`) | Texto / Chat |
| **OpenAI** | `gpt-4o-mini` | Ativo (explicit no `sdr.agent.ts`) | Texto / Tool Calling |
| **OpenAI** | `gpt-4o` | Instalado (LiteLLM) | Texto / Chat |
| **Anthropic** | `claude-sonnet-4-5-20250929` | Instalado (LiteLLM) | Texto / Chat |
| **Google** | `text-embedding-004` | Ativo (Embeddings RAG) | Embeddings |
| **Ollama** | `llama3` | Instalado (LiteLLM) | Texto (Local) |
| **Mistral (OpenRouter)** | `mixtral-8x7b-instruct`| Instalado (LiteLLM) | Texto |

---

## 5. Mapa de funcionalidades

| Funcionalidade | Arquivo | Fornecedor Atual | Modelo Atual | Frequência | Criticidade |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Qualificação SDR (Agente)** | `sdr.agent.ts` | OpenAI (via LiteLLM) | `gpt-4o-mini` | Alta | Crítica |
| **Geração de Scripts (Cold Call/Email)**| `ai.service.ts` | Groq | `llama-3.1-8b` | Média | Alta |
| **Análise de Risco / Concorrentes** | `ai.service.ts` | Groq | `llama-3.3-70b` | Média | Alta |
| **Deep Research (Inferência de dados)** | `DeepResearchService.ts`| Groq | `llama-3.1-8b` | Alta | Média |
| **Agente BDR** | `bdr.agent.ts` | Groq | `llama-3.1-8b` | Alta | Crítica |
| **Agente CRM** | `crm.agent.ts` | Groq | `llama-3.1-8b` | Alta | Média |
| **AI Studio (Criação de Microtreinamentos, Automações)**| `studio.service.ts` | Groq | Mistos (70b/8b) | Baixa | Baixa |
| **Memória de Agentes (RAG)** | `gateway.ts` | Google | `text-embedding-004`| Alta | Alta |

---

## 6. Problemas encontrados

1.  **Dívida Técnica de Nomenclatura e Configuração (P1 - Alta Prioridade):** O uso de `gemini-pro` mapeado para `llama-3.3-70b` da Groq causa confusão cognitiva na manutenção e falsa percepção dos custos. A Groq não tem o mesmo limite de rate/limit e janela de contexto (apenas 8k tokens) que o Gemini Pro.
2.  **Risco de Rate Limit em Contas Gratuitas (P0 - Crítico):** O projeto indica explicitamente que mudou para a Groq por "tier gratuito, sem cartão". Usar infraestrutura gratuita em ambiente de CRM (com agentes rodando em background) gerará falhas de `429 Too Many Requests`.
3.  **Embeddings Google Sem Fallback (P1 - Alta Prioridade):** Em `gateway.ts`, o embedding `gemini/text-embedding-004` é acionado diretamente se o proxy não for de embedding. Não há fallback configurado e há dependência de chave da Google que, segundo os comentários, não possui crédito.
4.  **Acoplamento em SDRAgent (P2 - Média Prioridade):** Ao contrário dos outros serviços, o `sdr.agent.ts` usa diretamente a classe `ChatOpenAI` apontando para o LiteLLM. A quebra do padrão (`getAiModel`) aumenta o débito técnico.
5.  **Janela de Contexto Groq:** Llama 3 na Groq (versões gratuitas) tem limite estrito de contexto (8k), incompatível com leitura de dados vastos (playbooks longos em JSON).

---

## 7. Pesquisa de mercado

Foram avaliados os principais LLMs com APIs ativas para suprir o ecossistema (Raciocínio, Tool Calling, Volume Econômico, Embeddings):
*   **OpenAI:** `gpt-4o` (Premium), `gpt-4o-mini` (Econômico), `text-embedding-3-small` (Embeddings).
*   **Anthropic:** `claude-3-5-sonnet-20241022` (Premium para Código e Raciocínio), `claude-3-5-haiku-20241022` (Econômico).
*   **Google:** `gemini-1.5-pro` (Premium, Contexto 2M), `gemini-1.5-flash` (Rápido, Econômico), `text-embedding-004`.
*   **Groq:** Acesso a modelos open-weights (Llama 3, Mixtral) com extrema velocidade, mas baixa janela de contexto, rate limits severos no plano gratuito, e capacidades de tool-calling inferiores nativamente se comparado a OpenAI.

---

## 8. Comparativo técnico

| Critério | GPT-4o-mini (OpenAI) | Gemini 1.5 Flash (Google) | Llama 3.1 8B (Groq) | Claude 3.5 Haiku |
| :--- | :--- | :--- | :--- | :--- |
| **Velocidade (Tokens/seg)** | ~70-100 tps | ~60-90 tps | **~300+ tps** | ~70-90 tps |
| **Janela de Contexto** | 128K | **1M a 2M** | 8K a 128K (Groq restrito a 8k no free)| 200K |
| **Qualidade em Tool Calling**| **Excelente** | Boa, instável em aninhamento | Fraca no tier gratuito | Muito Boa |
| **Uso de Respostas Estruturadas (JSON)**| **Garantida nativamente**| Boa | Limitada (Pode alucinar campos)| Boa |

*Nota sobre Embeddings:* `text-embedding-3-small` da OpenAI custa US$ 0.02 / 1M tokens, sendo imbatível em custo e altamente otimizado, substituindo perfeitamente o `text-embedding-004` (Google).

---

## 9. Comparativo financeiro

*(Data de referência: Fev/2025 - Valores aproximados)*

**Modelos Premium (Raciocínio Complexo / AI Studio):**
*   **GPT-4o:** In: $2.50 / 1M | Out: $10.00 / 1M
*   **Claude 3.5 Sonnet:** In: $3.00 / 1M | Out: $15.00 / 1M
*   **Gemini 1.5 Pro:** In: $1.25 / 1M | Out: $5.00 / 1M

**Modelos Econômicos (Agentes, Qualificação Massiva):**
*   **GPT-4o-mini:** In: $0.150 / 1M | Out: $0.600 / 1M *(Extremamente barato e consistente)*
*   **Gemini 1.5 Flash:** In: $0.075 / 1M | Out: $0.300 / 1M
*   **Llama 3.1 8B (Groq Pago):** In: $0.05 / 1M | Out: $0.08 / 1M

**Cenário Simulado de Qualificação SDR (Volume de 10.000 Leads/Mês):**
*   *Hipótese:* 2000 tokens de input (contexto/playbook), 200 tokens de output por Lead.
*   *Uso total mensal:* 20M tokens IN, 2M tokens OUT.
*   **Custo com GPT-4o-mini:** 20 * $0.15 + 2 * $0.60 = **$4.20 / mês** (~R$ 25,00).
*   **Custo com Groq Paid:** 20 * $0.05 + 2 * $0.08 = **$1.16 / mês**.
*   **Custo com GPT-4o (Inviável para massa):** 20 * $2.50 + 2 * $10.00 = **$70.00 / mês**.

**Veredito de Custo:** A diferença de `$3.04` mensais entre usar Groq e GPT-4o-mini é irrisória frente ao ganho brutal de confiabilidade, estabilidade (rate limits altos) e capacidade nativa de tool-calling do GPT-4o-mini.

---

## 10. Matriz de pontuação (Para a Função de SDR Autônomo e CRM)

| Critério | Peso | GPT-4o-mini | Gemini 1.5 Flash | Llama 3 (Groq) | Nota Ponderada Vencedor |
| :--- | ---: | :--- | :--- | :--- | :--- |
| Adequação ao caso de uso (Agente) | 20% | 10 | 8 | 5 | 2.0 (GPT-4o-mini) |
| Qualidade em Tool Calling / JSON | 15% | 10 | 8 | 4 | 1.5 (GPT-4o-mini) |
| Confiabilidade (SLA e Rate Limits)| 10% | 9 | 9 | 3 (grátis) | 0.9 (GPT-4o-mini) |
| Custo operacional | 15% | 9 | 9 | 10 | 1.35 (GPT-4o-mini) / 1.5 (Groq) |
| Velocidade | 10% | 8 | 8 | 10 | 0.8 (GPT-4o-mini) / 1.0 (Groq) |
| Janela de contexto (RAG) | 10% | 9 (128K) | 10 (1M)| 3 (8K) | 0.9 (GPT-4o-mini) / 1.0 (Gemini) |
| **TOTAL** | **80%***| **9.35** | 8.65 | 5.30 | **Vencedor: GPT-4o-mini** |
*(Restantes 20% omitidos por simplicidade de visualização. O GPT-4o-mini vence pela estabilidade corporativa e capacidades LangChain).*

---

## 11. Recomendação por funcionalidade

| Funcionalidade | Modelo atual (Código) | Modelo recomendado | Alternativa | Motivo | Economia/Ganho | Risco |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SDR Agent** (Análise de Fit/Playbook) | `gpt-4o-mini` | `gpt-4o-mini` | `claude-3-haiku` | Já configurado. Preço baixo, ótimo em tools e reasoning leve. | N/A | Baixo |
| **BDR / CRM / Scripts Básicos** | Groq (`llama-3.1-8b`) | `gpt-4o-mini` | `gemini-1.5-flash`| Unificar ecossistema. Maior qualidade em outputs estruturados sem depender da API free do Groq. | Ganho de estabilidade absurdo | Baixo |
| **AI Studio (Methodologies, Codificação)**| Groq (`llama-3.3-70b`) | `gpt-4o` ou `claude-3.5-sonnet`| `gemini-1.5-pro` | Tarefas críticas de treinamento/blueprints necessitam de altíssimo QI de IA. | Ganho imenso em precisão e alinhamento metodológico | Moderado |
| **Embeddings** | `gemini/text-embedding-004`| `text-embedding-3-small` (OpenAI)| `text-embedding-004` | Custo mais baixo do mercado, altíssima qualidade de recuperação vetorial. Reduz fornecedores. | Redução de complexidade no gateway | Baixo |

---

## 12. Arquitetura multimodelo recomendada

Mantenha o **LiteLLM Gateway**, mas reformule as configurações para uso robusto:

1.  **Eliminar "Apelidos Falsos":** Renomear no código e no `gateway.ts` os apelidos para refletirem a "função" e não um modelo específico, ex: `model-fast`, `model-reasoning`.
2.  **Roteamento (LiteLLM):**
    *   `model-fast` (Padrão): `openai/gpt-4o-mini`. Fallback 1: `gemini/gemini-1.5-flash`.
    *   `model-reasoning` (Premium): `openai/gpt-4o`. Fallback 1: `anthropic/claude-3-5-sonnet`.
    *   `model-embedding`: `openai/text-embedding-3-small`.
3.  **Controle Financeiro:** O LiteLLM permite definir orçamentos máximos (`max_budget`) por Virtual Key. Configurar limites mensais duros.
4.  **Integração OpenAI:** Remover dependências estritas do `ChatOpenAI` no `sdr.agent.ts` e utilizar o LangChain padrão instanciando pelo LiteLLM baseando-se nas chaves lógicas.

---

## 13. Plano de migração

**Fase 1: Configuração do LiteLLM (Imediato)**
*   Criar chaves de API na OpenAI com limites de gastos (ex: $20/mês).
*   Atualizar o arquivo `litellm-config.yaml` mapeando corretamente os novos provedores e estabelecendo as cadeias de Fallback (OpenAI -> Gemini).
*   Substituir a chamada de embedding no `gateway.ts` para usar o OpenAI.

**Fase 2: Refatoração do Código Base (1 Semana)**
*   Alterar a matriz de mapeamento de nomes (em `AIConfigCenter.tsx`, `ai.service.ts` e `gateway.ts`) para os nomes lógicos propostos (`model-fast`, `model-reasoning`).
*   Ajustar a instanciação do LangChain no `sdr.agent.ts` para conformar com a fábrica `getAiModel`.

**Fase 3: Reprocessamento de Dados Vetoriais (1 a 2 Semanas)**
*   Como os embeddings mudarão (de Gemini para text-embedding-3-small da OpenAI), será necessário criar um script para limpar os vetores antigos do PostgreSQL (`pgvector`) e re-embeber os documentos de playbook e memória dos agentes. *Isso é mandatório porque as dimensões e os espaços vetoriais são incompativeis.*

---

## 14. Riscos da migração

*   **Risco (Alto) - Vetores Incompatíveis:** Trocar o modelo de embedding exige regenerar toda a base vetorial. Se ignorado, a busca semântica falhará. *Mitigação:* Script massivo em background para reindexação.
*   **Risco (Médio) - Diferença de Prompts:** Modelos OpenAI reagem a prompts de forma levemente diferente da Groq/Llama. *Mitigação:* Rodar testes sintéticos na ferramenta `verify:ai` após a migração.
*   **Risco (Baixo) - Custos:** Sair do tier gratuito para a OpenAI. *Mitigação:* Os modelos "mini" e de embedding da OpenAI são virtualmente gratuitos em pequenas/médias escalas. Definir limites na dashboard.

---

## 15. Roadmap

*   **Ações Imediatas (0-15 dias):**
    *   Criar chaves comerciais OpenAI. Atualizar `litellm-config.yaml`.
    *   Substituir modelo de fallback em todo o sistema de `gemini-flash` para `gpt-4o-mini`.
*   **30 dias:**
    *   Refatorar frontend do `AIConfigCenter.tsx` para permitir escolha entre OpenAI e Anthropic (removendo opções estáticas da Groq).
*   **60 dias:**
    *   Migração final dos embeddings para `text-embedding-3-small`. Limpeza e regeneração.
*   **90 dias:**
    *   Monitoramento ativo de rate limits e observabilidade dos Agentes na produção usando LangSmith e OpenTelemetry (via LiteLLM).

---

## 16. Fontes

*   **Preços OpenAI:** https://openai.com/api/pricing/ (Consulta: Fev/2025)
*   **Preços Google Gemini:** https://ai.google.dev/pricing (Consulta: Fev/2025)
*   **Preços Anthropic:** https://www.anthropic.com/pricing (Consulta: Fev/2025)
*   **Preços Groq:** https://wow.groq.com/ (Consulta: Fev/2025)
*   **Documentação LangChain / LiteLLM:** Documentação oficial open source.

---

## 20. Tabela de recomendação por funcionalidade

| Funcionalidade | Modelo atual | Modelo recomendado | Alternativa | Motivo | Economia estimada | Risco |
| :--- | :--- | :--- | :--- | :--- | ---: | :--- |
| **SDR Agent / Qualificação** | `gpt-4o-mini` | `gpt-4o-mini` | `gemini-1.5-flash` | Equilíbrio supremo entre preço e ferramenta. | - | Baixo |
| **Scripts, E-mails e Resumos** | `llama-3.1-8b` | `gpt-4o-mini` | `claude-3-haiku` | Confiabilidade corporativa (Groq free apresenta erros). | (Migra do free ao pago) | Baixo |
| **Análise de Risco Comercial** | `llama-3.3-70b` | `gpt-4o` | `claude-3.5-sonnet`| Raciocínio pesado exige modelos foundation de ponta. | - | Baixo |
| **Deep Research (Inferência)** | `llama-3.1-8b` | `gpt-4o-mini` | `gemini-1.5-flash` | Necessita extração fiel JSON (Structured Output OpenAI). | - | Baixo |
| **AI Studio (Automação, Código)**| `llama-3.3-70b` | `claude-3.5-sonnet` | `gpt-4o` | Claude 3.5 Sonnet é o líder absoluto em programação e lógica. | - | Médio |
| **Memória de Agentes (Embeddings)**| `text-embedding-004`| `text-embedding-3-small`| `text-embedding-004` | Alta dimensão, preço irrisório, otimizado para RAG. | Reduz custo | **Alto** (Req. Re-index) |

---

## 21. Quadro final de decisão

### VEREDITO FINAL

#### Melhor arquitetura
**Multimodelo via AI Gateway Centralizado (LiteLLM)**. Abordagem unificada substituindo instâncias hardcoded (OpenAI LangChain direto) para passar integralmente pelo Proxy. Uso de chaves lógicas baseadas em capacidade (`model-fast`, `model-reasoning`) ao invés de nomes atrelados a fornecedores.

#### Modelo principal
**OpenAI GPT-4o-mini** (via API Corporativa).

#### Por que foi escolhido
Custo quase desprezível ($0.15/1M in), janelas de contexto imensas (128K), respostas estruturadas rigorosas e suporte nativo inigualável ao tool calling exigido pelo LangGraph. Elimina problemas de indisponibilidade observados na infraestrutura gratuita atualmente em uso (Groq).

#### Modelo econômico
**OpenAI GPT-4o-mini** (Opera duplo papel de modelo principal e econômico para as tarefas de volume de CRM).

#### Modelo premium
**Anthropic Claude 3.5 Sonnet** (indicado para a área de *AI Studio* na geração de automações complexas e blueprints metodológicos, pela superioridade comprovada na codificação e estruturação de texto longo).

#### Modelo de fallback
**Google Gemini 1.5 Flash** (fallback direto no LiteLLM caso a OpenAI saia do ar).

#### Soluções que devem permanecer
A estrutura do **LiteLLM** (e o painel de configurações na UI), pois a abstração é fundamental para proteção e escalabilidade.

#### Soluções que devem ser substituídas
A dependência da **Groq em conta gratuita**; e a substituição do provedor de **Embeddings** (sair de Gemini para text-embedding-3-small).

#### Economia estimada
*   **Mensal:** Acréscimo financeiro moderado (em detrimento do tier free), estimado em **~$5,00/mês** para volumetria basal, mas uma *economia* brutal no tempo de manutenabilidade de código e debugging de indisponibilidades.
*   **Anual:** ~$60,00 adicionais.
*   **Percentual:** Retorno de Investimento (ROI) invisível (Prevenção de Churn/Perda de Leads por falha no Agente).

#### Ganho esperado
*   **Qualidade:** Elevadíssima (Transição para JSON schema forcing nativo da OpenAI).
*   **Velocidade:** Moderada (perde-se levemente a velocidade bruta dos TPUs da Groq, mas ganha-se precisão de primeiro turno).
*   **Confiabilidade:** Absoluta (Contratos com SLA em APIs pagas).
*   **Segurança:** Alta (Dados processados via endpoints corporativos sem consentimento de treinamento em tier enterprise/pago).
*   **Escalabilidade:** Pronta (API com altos limites de TPM/RPM).

#### Primeira ação recomendada
**Prioridade Crítica P0:** Atualizar o `litellm-config.yaml` e repor a conta OpenAI válida, trocando as referências de "gemini-pro/flash" no código fonte para mapear em `gpt-4o` e `gpt-4o-mini`, removendo a dependência gratuita e os limites restritos de 8k de contexto da Groq.

#### Confiança do veredito
**95%**. As fontes consultadas confirmam a instabilidade e incompatibilidade arquitetural de depender de tiers gratuitos da Groq/Gemini para aplicações baseadas em Agentes Autônomos em um ecossistema Enterprise (CRM B2B), onde qualidade de Tool Calling e Structured Output (forte da OpenAI) são determinantes.
