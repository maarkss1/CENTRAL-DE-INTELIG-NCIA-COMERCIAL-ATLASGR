# Análise do Sistema de IA (Prospector Atlas)

Conforme solicitado, segue a análise detalhada dos componentes de Inteligência Artificial do projeto, abordando Prompts, Agentes, Memória, Custos, Fallback, RAG e Consumo de Tokens.

## 1. Prompts
- **Estruturação**: Os prompts estão sendo construídos utilizando o padrão de mensagens do LangChain (`SystemMessage`, `HumanMessage`, `AIMessage`).
- **Exemplo**: No `supervisor.agent.ts`, há um prompt explícito de sistema que orienta a síntese: *"Você é o Supervisor do Enxame de Agentes da Atlas. Com base na missão do usuário e nos resultados retornados pelos especialistas, escreva uma resposta final única, direta e acionável em português do Brasil, sem markdown, resumindo o que foi feito e quais são os próximos passos recomendados. Baseie-se SOMENTE nas informações fornecidas; não invente dados novos."*
- **Engenharia de Prompts**: Focada na redução de alucinações (restrição explícita "não invente dados novos") e formatação específica da saída (sem markdown, português do Brasil).

## 2. Agentes
- **Orquestração (Swarm)**: A arquitetura utiliza LangGraph para orquestrar um "Enxame" (Swarm) de agentes através de grafos de estado.
- **Tipos de Agentes Identificados**:
  - `supervisor`: Toma decisões de roteamento e faz a síntese final.
  - `sdr` (Sales Development Representative)
  - `bdr` (Business Development Representative)
  - `crm`: Agente focado em interações com o sistema de CRM.
  - `ops` (Operations): Provavelmente trata de tarefas operacionais ou integrações de infraestrutura.
- **Implementação Extra**: Existe também um `AutonomousAgent` em `server/ai/AutonomousAgent.ts` que implementa um fluxo simples (`plan` -> `research` -> `compile`) como base ou prova de conceito para workflows em background.

## 3. Memória
- **Persistência de Sessão**: O sistema usa o `MemorySaver` do pacote `@langchain/langgraph` (checkpointer) injetado na compilação do fluxo (`workflow.compile({ checkpointer: memory })`).
- **Gestão via Thread ID**: As conversas e os estados dos agentes são mantidos passando um `thread_id` configurável (`sessionId` no `SwarmOrchestrator`).
- **Cache de Embeddings**: Há um mecanismo explícito de cache em memória para embeddings locais (limitado a 500 itens, usando `Map<string, number[]>`), o que previne reprocessamento idêntico e preserva recursos na mesma sessão de máquina.

## 4. Custos e Fallbacks (Gateway)
O `gateway.ts` (`src/lib/ai/gateway.ts`) atua como o roteador inteligente para otimizar custos e gerir falhas:
- **Priorização/Cascata de Fallback**: Há um sistema de "Circuit Breaker" e fallbacks, que tenta provedores numa ordem que visa diminuir custo e dependência externa:
  1. **Modelos Locais (Ollama via LiteLLM)**: O alias `'local-llama3'` é padrão e mapeia para modelos locais rodando no próprio servidor ou rede (ex: `llama-3.3-70b-versatile` no Groq ou Ollama). Isso tem custo quase zero de inferência contínua se rodado localmente.
  2. **Provedores Cloud (Groq, OpenAI, Gemini)**: Usados quando há sobrecarga ou indisponibilidade, ou mapeados especificamente.
  3. **Último Recurso**: Chamada direta ao LiteLLM como fallback final após outros falharem.
- **Tratamento Timeout/Falhas**: Define `DEFAULT_GATEWAY_TIMEOUT_MS = 30_000` e `DEFAULT_FALLBACK_TIMEOUT_MS = 60_000`, e utiliza Redis (se disponível) para manter o estado do Circuit Breaker.

## 5. RAG (Retrieval-Augmented Generation) e Embeddings
- **Motor de RAG**: Há um `RagEngine.ts` que define o esqueleto de respostas baseadas estritamente num contexto (prompt restritivo: *"Answer the question based ONLY on the provided context."*).
- **Embeddings 100% Locais**: Definido no `local-embeddings.ts`, o sistema utiliza o modelo `@xenova/transformers` (`multilingual-e5-base`).
- **Vantagens de Custo e Segurança**:
  - O documento informa explicitamente: *"as duas rotas externas do projeto falharam em produção... Rodar o modelo aqui elimina essa classe de falha e, num CRM, tem o ganho de que o conteúdo dos documentos nunca sai da infraestrutura."*
  - O cache da Hugging Face é gravado em disco (cerca de 400MB) para inicialização rápida.
  - A dimensionalidade gerada é de **768**, garantindo compatibilidade direta com a extensão `pgvector` (`vector(768)`) no banco de dados, ou seja, sem chamadas externas cobradas por token no caso da etapa de embedding.

## 6. Token Usage e Limites
Para evitar estouro de contexto e custos excessivos, o `gateway.ts` impõe limites rígidos via código (Safety Rails):
- `MAX_MESSAGES_PER_REQUEST = 100`: Trunca históricos de conversa infinitos.
- `MAX_TOTAL_MESSAGE_CHARS = 200_000`: Corta strings extremamente longas antes de serializar no JSON.
- `MAX_EMBEDDING_INPUT_CHARS = 100_000`: Impede que tentativas de embutir textos absurdamente longos causem Out of Memory (OOM) no servidor de predição local ou recusem chamadas (HTTP 413) se enviado para um provedor de nuvem.

## Conclusão da Arquitetura de IA
A arquitetura de IA demonstra uma elevada maturidade em **Operacionalização (AIOps)**. Em vez de depender unicamente de provedores SaaS cobrados por token de forma cega, o sistema implementa uma camada forte de Gateway para Failover (Circuit Breaking), adota processamento local de Embeddings via ONNX/Transformers.js (economizando tokens de indexação em larga escala e protegendo PII de CRM), e implementa grafos de decisão rígidos usando LangGraph para segmentar competências de inteligência em múltiplos agentes especialistas.
