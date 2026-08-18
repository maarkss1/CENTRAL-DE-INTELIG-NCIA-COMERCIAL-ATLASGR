# Fase 0 — Auditoria real e plano de implementação do LDR

## Objetivo

Mapear o que já existe para o fluxo LDR / Account Intelligence e definir o primeiro corte de
implementação sem duplicar CRM, prospecção, Market Intelligence, IA, Bitrix ou workers. O pacote
`LDR_ATLASGR_PROMPTS_ORQUESTRADOS.zip` foi tratado como especificação de produto fornecida pelo
usuário, não como autoridade para substituir `AGENTS.md` nem como autorização para operações
destrutivas.

## Estado inicial

- A auditoria começou na branch `codex/etapa-2-market-intelligence`, então em `dc7cbd0d`, com
  mudanças locais em `prisma/schema.prisma`, dois scripts de bootstrap PostgreSQL e uma migração
  `20260818123000_market_intelligence_companies`.
- Durante a auditoria, outra sessão avançou a mesma branch para `9721f95c` e `f1b98d66` e as
  mudanças locais de schema deixaram de existir no checkout. Nenhuma operação desta execução fez
  commit, reset ou descarte desses arquivos.
- Os novos commits versionam testes Python e três arquivos `__pycache__/*.pyc`; os `.pyc` aparecem
  removidos no working tree atual e não serão restaurados por esta fase.
- A fundação LDR persistente continua ausente no estado atual; os campos/modelos observados no
  incremento transitório foram usados apenas para identificar riscos antes de eventual reintrodução.
- O manifesto em `public/tools/atlas-market-intelligence/data/manifest.json` declara
  `decisionReady: false` e CNPJ/ICP nacional ainda não publicado.

## Mapa da arquitetura atual

### Interface e dados empresariais

- `src/App.tsx` monta `/market-intelligence`; a página lê JSON estático por
  `src/features/market-intelligence/marketIntelligence.data.ts`. Não existe busca server-side de
  empresas nem Account 360 nessa feature.
- `server.ts` protege `/api/companies` com autenticação e tenant.
- `src/features/companies/routes/company.routes.ts` oferece listagem, detalhe, escrita e
  enriquecimento de `Company`, com RBAC nas mutações.
- `Company`, `Contact` e `Lead` são as entidades CRM que devem ser reutilizadas quando uma empresa
  pesquisada for promovida ao fluxo comercial.

### Descoberta, score e IA

- `src/features/prospecting/routes/prospecting.routes.ts` expõe descoberta multi-provider, consulta
  CNPJ, promoção ao CRM e busca de decisores.
- `src/features/prospecting/services/enrichment.service.ts` combina Receita/BrasilAPI, Google/OSM,
  GDELT, Apollo/Hunter, fit determinístico e lookalike; persiste `EnrichmentLog` e contatos.
- `src/features/market-intelligence/domain/scoreEngine.ts` calcula oportunidade territorial
  explicável, com confiança e bloqueio por dados ausentes; não é um Account Score.
- `ConversationSignal` persiste sinais de WhatsApp ligados a lead; não há sinal material por conta.
- `decision-committee.service.ts` classifica contatos, mas usa classificação genérica quando a IA
  falha.
- `next-best-action.service.ts` não possui consumidor encontrado e devolve follow-up genérico na
  falha. Isso não pode aparecer como recomendação calculada do LDR.
- `swarmScheduler.service.ts` cria recomendações pendentes idempotentes para leads, mas ainda não
  consome snapshot de Account Intelligence.

### Bitrix, cadência e runtime

- `src/features/integrations/bitrix/bitrix.routes.ts` cobre conexões, importação de leads/deals,
  comentários, regras de sync e extrações.
- `outboundSync.ts`, `syncRules.ts` e `src/lib/queue/bitrixSync.worker.ts` são base reaproveitável,
  com proteção contra duplicidade e falha observável.
- Não foi localizado endpoint para criar tarefa Bitrix a partir de recomendação de conta.
- `src/features/cadence` contém domínio, persistência e consultas, mas não há contrato LDR que
  transforme uma recomendação aprovada em início de cadência.
- `worker.ts` e `src/lib/queue/**` já fornecem Redis/BullMQ para o refresh futuro.

## Classificação obrigatória

| # | Capability | Estado | Evidência e lacuna principal |
|---|---|---|---|
| 1 | Busca de empresa real | PARCIAL | `/api/prospecting/discover` e `/enrich-cnpj` usam fontes reais; Market Intelligence ainda não possui busca paginada server-side. |
| 2 | Perfil cadastral da empresa | FUNCIONA | `Company`, `/api/companies/:id` e enriquecimento real existem; falta compor a visão LDR. |
| 3 | Enriquecimento | PARCIAL | Receita, Google/OSM, GDELT, Apollo/Hunter e logs existem; proveniência/confiança são heterogêneas. |
| 4 | ICP/Fit | PARCIAL | Fit determinístico e score territorial existem; não há versão histórica por conta. |
| 5 | Account Score | PARCIAL | Opportunity Score territorial e lookalike existem; total fit/timing/intent/relationship e histórico não existem. |
| 6 | Evidências/fontes | PARCIAL | `SourceEvidence` e `EnrichmentLog` existem; não há evidência por fato com FATO/INFERÊNCIA/RECOMENDAÇÃO. |
| 7 | Sinais | PARCIAL | `ConversationSignal` e GDELT existem; não há `AccountSignal` deduplicado. |
| 8 | Timeline de sinais | NÃO IMPLEMENTADO | Timeline CRM não agrega sinais versionados da conta. |
| 9 | Decisores | PARCIAL | Apollo/Hunter e `Contact` existem; faltam verificação, confiança e papel persistido. |
| 10 | Grupo econômico | NÃO IMPLEMENTADO | Nenhum agregado/repositório de relações societárias foi localizado. |
| 11 | Resumo IA | PARCIAL | Há resumo de enriquecimento e IA; não há snapshot versionado da conta com estado das fontes. |
| 12 | Next Best Action | QUEBRADO | Serviço isolado, sem integração, e com fallback genérico enganoso. |
| 13 | Integração Bitrix | PARCIAL | Conexão, import/sync, webhook e auditoria existem; Account Intelligence não é mapeado. |
| 14 | Criação de tarefa no Bitrix | NÃO IMPLEMENTADO | Há comentário em lead, mas nenhuma tarefa idempotente por recomendação. |
| 15 | Início de cadência | PARCIAL | Cadência e `CadenceRun` existem; falta comando autorizado vindo da recomendação. |
| 16 | Persistência de snapshots | NÃO IMPLEMENTADO | O manifesto territorial é estático; não há snapshot histórico por `Company`. |
| 17 | Reprocessamento assíncrono | PARCIAL | BullMQ e fila de enriquecimento existem; falta refresh idempotente da conta. |
| 18 | Feedback/aprendizado | PARCIAL | Enxame e win/loss existem; falta ligar execução, resultado e versão da recomendação. |
| 19 | Segurança/PII | PARCIAL | Auth/tenant/RBAC existem; a migração local propõe catálogo global com e-mail/telefone. |
| 20 | Testes ponta a ponta | NÃO IMPLEMENTADO | Não existe E2E Empresa real → Account 360 → recomendação → Bitrix. |

## Reaproveitamento obrigatório

- Conta CRM: `Company`; contato: `Contact`; oportunidade: `Lead` e seus IDs Bitrix.
- Descoberta/enriquecimento: serviços de CNPJ, Google Places, Apollo, Hunter, GDELT, fit e lookalike.
- Explicabilidade: disponibilidade, confiança e bloqueios do domínio Market Intelligence.
- Sinais: `ConversationSignal` e worker WhatsApp.
- Guardrails: `AIPendingAction`, aprovação, consentimento e agentes runtime.
- Execução: serviços Bitrix, BullMQ/Redis e domínio de cadência existentes.

## Componentes a criar ou adaptar

- Persistência ligada a `Company`: snapshot, score histórico, sinais, evidências, metadados de
  decisores, relações econômicas e recomendações.
- API em `src/features/market-intelligence` com paginação server-side, tenant e refresh assíncrono.
- Account 360 consumindo somente contratos server-side, com loading/empty/error/stale.
- Ação externa que converta recomendação aprovada em tarefa Bitrix idempotente.
- Testes de domínio, integração/RLS, contrato e E2E do vertical slice.

## Riscos e bloqueadores

1. **PII global no incremento local.** `MarketIntelligenceCompany` inclui telefone/e-mail e a RLS
   proposta libera SELECT a qualquer tenant autenticado. Catálogo público e dado pessoal devem ser
   separados/minimizados antes do merge.
2. **Duas identidades empresariais sem crosswalk.** Catálogo CNPJ e `Company` ainda não têm promoção
   idempotente/ownership formal.
3. **Volume.** O frontend atual lê JSON inteiro; o universo nacional exige busca server-side.
4. **Fallback enganoso.** NBA e comitê de decisão fabricam contingência quando a IA falha.
5. **Migração sem prova.** `pg_trgm` está duplicado no bootstrap, o check do CNPJ aceita letras nos
   12 primeiros caracteres e não há evidência de migração em banco limpo + atualizado.
6. **Dependências externas.** Snapshot CNPJ, PostgreSQL/extensões, Redis, credenciais de provedores e
   conexão Bitrix de teste serão necessários para provar o fluxo.

## Ownership

| Domínio | Dono |
|---|---|
| Coordenação, relatório, integração e veredito | 00 |
| Schema, migrações, RLS e persistência | 01 |
| Contratos e API | 18 |
| ICP, elegibilidade e decisores | 05 |
| Account 360 e jornada | 02 |
| IA, resumo e rationale | 07 |
| Bitrix | 06 |
| Enxame/approvals | 13 |
| Workers/refresh | 16 |
| Cadência | 17 |
| Segurança/PII | 15 com 01 |
| Harness e release | 14 + 08 |

Arquivos compartilhados permanecem com os donos exclusivos de `AGENTS.md`, especialmente Prisma
(01), `src/App.tsx` (02), `server.ts` e `package.json`/lockfile (aprovação 00).

## Execução da Fase 1 iniciada

- Base isolada: `f1b98d66`.
- Branch/worktree de integração: `integracao/ldr-fase-1` em
  `C:/Users/marce/OneDrive/Documentos/GitHub/wt-integracao-ldr-fase-1`.
- Especialista ativo: Agente 01, branch `agente/01-plataforma-dados`, em
  `C:/Users/marce/OneDrive/Documentos/GitHub/wt-agente-01-ldr`.
- Matriz desta leva: apenas o Agente 01 edita `prisma/schema.prisma` e
  `prisma/migrations/**`; nenhum outro especialista foi disparado, portanto não há sobreposição de
  propriedade na leva.
- O checkout `codex/etapa-2-market-intelligence` não será usado para integrar código enquanto a
  outra sessão continuar modificando-o.

## Primeiro incremento da Fase 1

- `20b1935 feat(01): adiciona fundacao de account intelligence` criou os sete agregados ligados a
  `Company`: `AccountIntelligenceSnapshot`, `AccountSignal`, `DecisionMaker`,
  `IntelligenceEvidence`, `AccountScore`, `AccountRecommendation` e `EconomicRelationship`.
- `dce3320 fix(01): exige contato real para decisor` fechou a lacuna de identidade: decisor exige
  `Contact` tenant-safe, guarda área/senioridade e não duplica e-mail/telefone.
- Merges na integração: `0b9214e` e `27d11bb`.
- Todas as tabelas novas carregam `organizationId`, RLS `FORCE ROW LEVEL SECURITY`, `WITH CHECK`
  fail-closed e FKs compostas para impedir referências cross-tenant inclusive sob bypass.
- Snapshot e score são históricos/versionados; sinais e evidências têm dedupe; recomendações têm
  rationale, `externalRef` e chave de idempotência parcial; relações econômicas exigem origem e
  destino distintos no mesmo tenant.

## Validação do primeiro incremento

| Validação | Resultado | Evidência |
|---|---|---|
| `prisma validate` | PASS | Schema integrado válido após as duas levas. |
| `prisma generate` | PASS | Prisma Client 7.9.1 gerado. |
| `tsc --noEmit` | PASS | 0 erros após regenerar o client. |
| ESLint somente leitura sobre `src` | PASS com avisos preexistentes | 0 erros, 85 warnings; nenhum arquivo alterado. |
| Suíte unitária completa | FALHOU por timeout isolado | 160 arquivos/1266 testes passaram; 1 teste 3CX excedeu 5 s. |
| Reexecução isolada do teste 3CX | PASS | 1 arquivo, 12/12 testes, 3,34 s; falha classificada como flutuação de tempo, não regressão LDR. |
| Build frontend (Vite) | PASS | 3593 módulos transformados. |
| Bundle servidor (esbuild) | PASS | `dist/server.cjs` gerado. |
| Wrapper `npm run build` | BLOQUEADO pelo ambiente | Runtime não expõe `node` no PATH; os dois comandos internos foram executados diretamente e passaram. |
| Integração/E2E/migração em PostgreSQL | NÃO EXECUTADO | Fase 1 ainda não concluiu API; baseline registra Docker indisponível. Não declarar gate verde. |

O incremento está integrado apenas em `integracao/ldr-fase-1`; não houve merge ou push para a
branch compartilhada/principal.

## Ordem de implementação

1. Resolver PII/RLS e estabilizar o catálogo empresarial em andamento.
2. Fundação persistente + API Account Intelligence e testes de autorização.
3. Account 360 sobre empresa real.
4. Score, sinais, decisores, evidências e recomendação explicável.
5. Recomendação aprovada → tarefa Bitrix idempotente, com retorno de estado.
6. Refresh/workers/scheduler/cadência.
7. Grupo econômico e monitoramento.
8. Design, segurança, integração, E2E e veredito de release.

## Critérios de aceite globais

- Empresa real é localizada sem carregar o universo nacional no navegador.
- Promoção ao CRM é explícita, idempotente e preserva tenant/proveniência.
- Snapshot, score, sinais, evidências, decisores e recomendação persistem com versão/timestamps.
- Fato, inferência e recomendação são distintos; ausência aparece como `NÃO DISPONÍVEL`.
- Score é explicável e não converte ausência em zero.
- Ação Bitrix é autorizada, idempotente, auditável e retorna estado.
- Nenhum PII ou payload bruto desnecessário atravessa tenants ou aparece em logs/UI.
- Migração passa em banco limpo/atualizado e o E2E real fica verde.

## Handoffs

- `.agents/handoffs/ldr-fase-0/00-para-01-catalogo-cnpj-pii-rls.md` — resolvido pelo Agente 01 no
  commit `4373faa`; pedido original e seção de resolução preservados.

## Veredito

**FASE 0: PASS.** Arquitetura e lacunas foram classificadas com evidência do repositório.

**FASE 1: EM ANDAMENTO.** O bloqueador de PII/RLS foi resolvido e a fundação persistente está
integrada em branch isolada. A fase ainda não recebe PASS: faltam data access/APIs, testes reais de
migração/RLS em PostgreSQL e o vertical slice com empresa real.
