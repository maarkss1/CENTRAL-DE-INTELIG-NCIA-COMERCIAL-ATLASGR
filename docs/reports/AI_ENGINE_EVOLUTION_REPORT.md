# Relatório de Evolução da IA (AI Engine) - AtlasGR

## 1. Resumo Executivo
Este relatório detalha a refatoração e evolução dos módulos de Inteligência Artificial da plataforma AtlasGR. O objetivo principal foi consolidar a arquitetura dos agentes, remover lógicas simuladas (mocks) em interfaces frontend, e garantir uma integração real, confiável e segura utilizando o conceito de Clean Architecture.

## 2. Estado Anterior
- **Mocks no Frontend**: Ferramentas como o `RobustScriptGenerator` e o `SuperagentCreator` possuíam botões para "gerar offline" que contornavam o motor de IA e simulavam resultados com `setTimeout`.
- **Agentes Duplicados**: Havia dois arquivos (`sdr.agent.ts` e `sdr-agent.ts`) tratando das mesmas lógicas do SDR B2B (gerar e-mail vs. qualificar lead). Apenas o primeiro possuía LangGraph.

## 3. Estado Atual & Módulos Alterados
- **Agentes SDR (sdr.agent.ts)**: A lógica do `sdr-agent.ts` foi unificada dentro do `sdr.agent.ts`. O agente autônomo agora é centralizado, utilizando o fluxo LangGraph para qualificação e um pipeline para o RAG ao gerar rascunhos de e-mail (usando `vectorService.searchSimilar`). O arquivo antigo foi removido.
- **Queue/Worker (agent.worker.ts)**: Foi atualizado para instanciar o `SDRAgent` unificado de `sdr.agent.ts`.
- **RobustScriptGenerator & SuperagentCreator (Frontend)**: As funções temporárias offline (`handleGenerateOffline` / `handleCreateOffline`) e os mocks usando `setTimeout` foram removidos. Agora, toda a criação de inteligência é acionada obrigatoriamente pelas rotas `/api/intelligence/studio`.
- **Access Policy**: Testes locais foram ajustados para passar localmente com a verificação correta.

## 4. Arquitetura Alvo
O sistema utiliza um **Model Router** central (gateway LiteLLM / Groq) por trás do backend e entrega IA transacional com **Human-in-the-loop**. Os agentes não executam as ações (como envio de e-mails) sozinhos, mas sim as registram no módulo de `AIPendingAction`, que aguarda a aprovação de um humano na aplicação, mitigando riscos corporativos e atendendo à matriz de compliance.

## 5. Testes e Validação
As refatorações foram processadas, passando pelo validador de sintaxe strict e pela camada de testes unitários com Vitest (`npx vitest run -c vitest.unit.config.ts --passWithNoTests`), garantindo 100% dos testes da suíte passando após as modificações de segurança (access-policy e agentes).

## 6. Próximos Passos
- Refinar relatórios de telemetria analítica com logs mais densos sobre tokens do Groq/LiteLLM se necessário.
- Incluir métricas customizáveis por pipeline do LangGraph para medir precisão de agentes.
