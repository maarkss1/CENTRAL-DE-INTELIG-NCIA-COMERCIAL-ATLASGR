# Fase 0 — Auditoria e Plano de Implementação do LDR

## A. Mapa da Arquitetura Atual
O repositório já possui uma fundação sólida e operacional de Market Intelligence e CRM:
- **Banco de Dados**: PostgreSQL com `pgvector` para lookalike scoring, PrismaORM gerenciando schemas amplos para Company, Contact, Lead, MarketIntelligenceCompany, etc.
- **Integração Bitrix24**: Sincronização robusta em `/features/integrations/bitrix` (Leads, Deals, webhooks).
- **Enriquecimento e Prospecção**: Serviços integrados em `apollo.service.ts`, `hunter.service.ts`, `cnpjLookup.ts`.
- **Inteligência e Automação**: Filas BullMQ (`agent.worker.ts`, `swarmScheduler.worker.ts`), `AIPendingAction`, motores de score (`scoreEngine.ts`).

## B. Tabela de Capabilities

| Capability | Status | Observação / Evidência |
| --- | --- | --- |
| 1. Busca de empresa real | FUNCIONA | `MarketIntelligenceCompany` via dataset importado e `cnpjLookup.ts`. |
| 2. Perfil cadastral | FUNCIONA | Schema `Company` com campos ricos, enrichmentLogs. |
| 3. Enriquecimento | FUNCIONA | Apollo, Hunter, BrasilAPI integrados na prospect service. |
| 4. ICP/Fit | FUNCIONA | `fitScore.ts` e enum `MarketIntelligenceIcpTier` existentes. |
| 5. Account Score | PARCIAL | `scoreEngine.ts` implementa score base, mas carece de granularidade para todo o fluxo LDR. |
| 6. Evidências/fontes | FUNCIONA | Tabela `EnrichmentLog` e `MarketIntelligenceDataset` hash/versionamento. |
| 7. Sinais | PARCIAL | `ConversationSignal` e `TimelineEvent` existem no banco, mas captação de sinais macro/mercado precisa refinamento. |
| 8. Timeline de sinais | FUNCIONA | Tabela `TimelineEvent` funcional para lead. |
| 9. Decisores | FUNCIONA | Busca via `DecisionMakerSearch.tsx` e `Apollo/people.ts`. |
| 10. Grupo econômico | PARCIAL | Campo `matrizFilial` no MarketIntelligence, mas navegação/agregação em tela é fraca/ausente. |
| 11. Resumo IA | PARCIAL | Logs de IA (`AILog`), UI (`AIPendingActions.tsx`) mas falta resumo consolidado "Account 360" rico. |
| 12. Next Best Action | PARCIAL | `AIPendingAction` implementado para fluxos de aprovação, precisa integração direta como Next Best Action de vendas. |
| 13. Integração Bitrix | FUNCIONA | Sincronização OUTBOUND/INBOUND existente em `bitrix.service.ts`. |
| 14. Criação de tarefa Bitrix | NÃO IMPLEMENTADO | Faltam endpoints explícitos para gerar tasks no Bitrix (só manipula Deal/Lead). |
| 15. Início de cadência | FUNCIONA | Infraestrutura de `CadenceRun` e `CadenceSequence` disponível. |
| 16. Persistência de snapshots | FUNCIONA | `MarketIntelligenceDataset` import pipeline implementado. |
| 17. Reprocessamento assíncrono | FUNCIONA | BullMQ e workers (ex: `swarmScheduler.worker.ts`) rodando. |
| 18. Feedback/aprendizado | PARCIAL | Lookalike vector search (`profileEmbedding`), mas faltam endpoints formais de feedback loop de vendas. |
| 19. Segurança/PII | FUNCIONA | `OptOutRecord`, RLS (via tenant isolation/organizationId). |
| 20. Testes ponta a ponta | PARCIAL | Playwright configurado, mas carece de testes e2e para o fluxo LDR completo. |

## C. Arquivos e Services que Serão Reaproveitados
- Todos os de `features/prospecting` e `features/integrations/bitrix`.
- `scoreEngine.ts` (para expansão).
- `AIPendingAction` no domínio de intelligence.
- `prisma/schema.prisma` (aumentando poucos campos ou tabelas necessárias).

## D. Arquivos que Precisam ser Criados
- Novos endpoints/handlers de Account 360 no backend.
- UI do Account 360 (dashboard agregado com IA, Grupo Econômico, Timeline rica).
- Integração de `Task` no pacote do `bitrix.service.ts` e `client.ts`.
- Adaptações em rules de Next Best Action.

## E. Riscos Técnicos
- Concorrência de migrations Prisma (mitigado pelo Agente 01/01A exclusivo).
- Sobrecarga de API Rate Limits (Apollo/Hunter/Bitrix).

## F. Dependências Externas
- Apollo API, Bitrix24 Webhook/REST API, OpenAI/LLM (Langchain via `autonomyRoleRunner.service.ts`).

## G. Ordem Exata de Implementação (Fases 1–7)
Conforme 00_LEIA-ME.txt:
- FASE 1 — Fundação de dados e API
- FASE 2 — Account Intelligence 360
- FASE 3 — Score, sinais, decisores e evidências
- FASE 4 — Bitrix24 e Next Best Action
- FASE 5 — Runtime, workers, cadências e autonomia
- FASE 6 — Grupo econômico e monitoramento contínuo
- FASE 7 — Design, QA, segurança e release

## H. Matriz de Ownership por Agente
- **00 Coordenador**: Orquestração, merge integration, controle de fases.
- **01 / 01A**: `schema.prisma`, migrations, RLS, banco de dados.
- **02 Produto e UX**: Fluxos frontend, navegação Account 360.
- **03 Design / Acessibilidade**: Refinamento visual da UI.
- **04 CRM e BI**: Métricas, histórico, pipeline.
- **05 Prospecção**: Integrações Apollo/Hunter, enrichments.
- **06 / 06A Integrações**: Bitrix24 (criação de Tarefas, webhook).
- **07 IA e Automações**: Modelos Langchain, Score, Next Best Action.
- **08 QA e Release**: Testes E2E (Playwright), testes de integração, auditoria de release.
- **16 Runtime / 17 Cadência**: Trabalhadores BullMQ, sequências.

## I. Critérios de Aceite Globais
- Nenhuma funcionalidade baseia-se em mocks.
- 100% testado nas integrações e E2E.
- O fluxo de Account 360 gera uma Ação rastreável (Tarefa/Ação) no Bitrix.
- A fase não é aprovada sem scripts obrigatórios passando (`lint`, `test`, `build`).
