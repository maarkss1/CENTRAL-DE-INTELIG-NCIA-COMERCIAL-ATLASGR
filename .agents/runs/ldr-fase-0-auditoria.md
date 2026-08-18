# Fase 0 — Auditoria real e plano de implementação do LDR

## Objetivo

Mapear o que já existe para o fluxo LDR / Account Intelligence e definir o primeiro corte de
implementação sem duplicar CRM, prospecção, Market Intelligence, IA, Bitrix ou workers. O pacote
`LDR_ATLASGR_PROMPTS_ORQUESTRADOS.zip` foi tratado como especificação de produto fornecida pelo
usuário, não como autoridade para substituir `AGENTS.md` nem como autorização para operações
destrutivas.

## Estado inicial

- Branch: `codex/etapa-2-market-intelligence`, no mesmo commit de `main` (`dc7cbd0d`).
- O working tree já estava alterado antes desta auditoria:
  - `prisma/schema.prisma`;
  - `scripts/db/02-enable-extensions.sql`;
  - `scripts/db/create-app-role.sql`;
  - `prisma/migrations/20260818123000_market_intelligence_companies/migration.sql`;
  - `LDR_ATLASGR_PROMPTS_ORQUESTRADOS.zip` não versionado.
- Essas mudanças não foram descartadas, reformatadas ou assumidas como prontas.
- O incremento local cria `MarketIntelligenceDataset`, `MarketIntelligenceCompany` e
  `MarketIntelligenceMunicipalityMapping`; ele não cria os sete agregados de Account Intelligence
  solicitados pelo produto.
- O manifesto publicado em
  `public/tools/atlas-market-intelligence/data/manifest.json` declara `decisionReady: false` e
  registra CNPJ/ICP nacional ainda não publicado.

## Mapa da arquitetura atual

### Entrada e interface

- `src/App.tsx` monta `/market-intelligence`.
- `src/pages/MarketIntelligence.tsx` entrega `MarketIntelligenceApp`.
- `src/features/market-intelligence/marketIntelligence.data.ts` lê JSON estático do bundle público.
- `src/features/market-intelligence/components/MarketIntelligenceApp.tsx` apresenta visão executiva,
  território e saúde dos dados. Não existe navegação para Account 360 nem busca server-side de
  empresas nessa feature.

### CRM e perfil empresarial

- `server.ts` protege `/api/companies` com autenticação e tenant.
- `src/features/companies/routes/company.routes.ts` oferece listagem, detalhe, escrita e
  enriquecimento de `Company`, com RBAC nas mutações.
- `prisma/schema.prisma` já tem `Company`, `Contact`, `Lead`, `Activity`, `TimelineEvent` e relações
  com `Organization`; `Company` é a conta CRM que deve ser reutilizada quando uma empresa pesquisada
  for promovida ao fluxo comercial.

### Descoberta e enriquecimento

- `src/features/prospecting/routes/prospecting.routes.ts` expõe descoberta multi-provider, consulta
  CNPJ, promoção ao CRM, busca de decisores e geração de abordagem.
- `src/features/prospecting/routes/prospecting-tools.routes.ts` separa Google Places, Apollo e Hunter.
- `src/features/prospecting/services/enrichment.service.ts` combina Receita/BrasilAPI, domínio,
  Google/OpenStreetMap, GDELT, Apollo/Hunter, fit determinístico e lookalike pgvector; persiste
  `EnrichmentLog` e contatos quando aplicável.
- A descoberta existente deve ser adaptada como entrada do LDR, não reimplementada.

### Score, sinais, decisores e IA

- `src/features/market-intelligence/domain/scoreEngine.ts` calcula oportunidade territorial
  explicável, com confiança e bloqueio por dados ausentes; não é um Account Score.
- `src/features/prospecting/services/enrichment/fitScore.ts` calcula fit de empresa sem histórico
  versionado de score.
- `prisma/schema.prisma` e
  `src/features/integrations/whatsapp/conversation-intelligence.service.ts` persistem
  `ConversationSignal` associado a lead; não há sinal material por conta.
- `src/features/contacts/services/decision-committee.service.ts` classifica contatos, mas não está
  ligado a uma rota de Account 360 e usa classificação genérica de contingência quando a IA falha.
- `src/features/activities/services/next-best-action.service.ts` existe sem consumidor encontrado e
  devolve um follow-up genérico quando a IA falha. Isso não pode ser apresentado como recomendação
  calculada do LDR.
- `src/features/intelligence/services/swarmScheduler.service.ts` cria recomendações pendentes
  idempotentes para leads e há agentes Supervisor/SDR/BDR/Closer, porém ainda sem consumir um
  snapshot de Account Intelligence.

### Bitrix, cadência e runtime

- `src/features/integrations/bitrix/bitrix.routes.ts` cobre conexões, importação de leads/deals,
  comentários, regras de sync e extrações.
- `src/features/integrations/bitrix/service/outboundSync.ts`, `syncRules.ts` e
  `src/lib/queue/bitrixSync.worker.ts` formam uma base reaproveitável, com proteção contra
  duplicidade e falha observável.
- Não foi localizado endpoint para criar tarefa Bitrix a partir de recomendação de conta.
- `src/features/cadence` contém domínio, persistência e consultas de execuções/opt-out, mas não há
  contrato LDR que transforme uma recomendação aprovada em início de cadência.
- `worker.ts` e `src/lib/queue/**` já fornecem Redis/BullMQ, retries e separação de processo para o
  reprocessamento futuro.

## Classificação das capabilities

| # | Capability | Estado | Evidência e lacuna principal |
|---|---|---|---|
| 1 | Busca de empresa real | PARCIAL | `/api/prospecting/discover` e `/enrich-cnpj` usam fontes reais; `/market-intelligence` ainda não possui busca paginada server-side sobre o universo CNPJ. |
| 2 | Perfil cadastral da empresa | FUNCIONA | `Company` + `/api/companies/:id` + enriquecimento Receita/BrasilAPI; falta apenas compor a visão LDR. |
| 3 | Enriquecimento | PARCIAL | Receita, Google/OSM, GDELT, Apollo/Hunter e logs existem; contratos de proveniência/confiança são heterogêneos e payload bruto é persistido em alguns logs. |
| 4 | ICP/Fit | PARCIAL | Fit determinístico e score territorial existem; não há versão histórica por conta nem taxonomia LDR única. |
| 5 | Account Score | PARCIAL | Opportunity Score territorial e lookalike existem; total fit/timing/intent/relationship por conta, razões e histórico não existem. |
| 6 | Evidências/fontes | PARCIAL | `SourceEvidence` existe no bundle e `EnrichmentLog` registra fonte; não há evidência normalizada por fato com FATO/INFERÊNCIA/RECOMENDAÇÃO. |
| 7 | Sinais | PARCIAL | `ConversationSignal` e notícias GDELT existem; não há `AccountSignal` material, deduplicado e ligado à empresa. |
| 8 | Timeline de sinais | NÃO IMPLEMENTADO | Timeline CRM não agrega sinais versionados da conta. |
| 9 | Decisores | PARCIAL | Apollo/Hunter e promoção para `Contact` existem; faltam `verifiedAt`, confiança, papel no comitê e provenance uniforme. |
| 10 | Grupo econômico | NÃO IMPLEMENTADO | Nenhum agregado/repositório de relações societárias ou econômicas foi localizado. |
| 11 | Resumo IA | PARCIAL | Há resumo determinístico de enriquecimento e serviços de IA; não há snapshot versionado da conta com status das fontes. |
| 12 | Next Best Action | QUEBRADO | Serviço isolado sem integração ao fluxo e com fallback genérico que pode parecer recomendação calculada. |
| 13 | Integração Bitrix | PARCIAL | Conexão, import/sync, webhook e auditoria existem; Account Intelligence não é mapeado para o Bitrix. |
| 14 | Criação de tarefa no Bitrix | NÃO IMPLEMENTADO | Há comentário em lead, mas nenhuma criação idempotente de tarefa a partir de recomendação. |
| 15 | Início de cadência | PARCIAL | Cadência e `CadenceRun` existem; falta comando autorizado/idempotente vindo de recomendação LDR. |
| 16 | Persistência de snapshots | NÃO IMPLEMENTADO | O bundle territorial tem manifesto estático; não há snapshot histórico por `Company`. |
| 17 | Reprocessamento assíncrono | PARCIAL | BullMQ, workers e fila de enriquecimento existem; falta job/endpoint idempotente de refresh da conta. |
| 18 | Feedback/aprendizado | PARCIAL | Enxame, endpoint de aprendizado e win/loss existem; não há vínculo entre execução, resultado e versão da recomendação. |
| 19 | Segurança/PII | PARCIAL | Auth, tenant e RBAC existem; o incremento local propõe catálogo global com e-mail/telefone e leitura por qualquer tenant, exigindo minimização/isolamento antes do merge. |
| 20 | Testes ponta a ponta | NÃO IMPLEMENTADO | Há suites de CRM, IA, Bitrix e score territorial, mas não existe E2E Empresa real → Account 360 → recomendação → Bitrix. |

## Reaproveitamento obrigatório

- Conta CRM: `Company`; contato: `Contact`; oportunidade: `Lead` com `funnel/pipeline` e IDs Bitrix.
- Descoberta: `discoverCandidates`, `fetchCnpjData`, Google Places, Apollo e Hunter existentes.
- Enriquecimento: `enrichCompanyData`, `EnrichmentLog`, GDELT e lookalike pgvector.
- Explicabilidade: tipos de disponibilidade/confiança e bloqueios do domínio Market Intelligence.
- Sinais de canal: `ConversationSignal` e worker WhatsApp.
- Guardrails: `AIPendingAction`, aprovação, consentimento e papéis do enxame.
- Execução externa: serviços Bitrix e infraestrutura BullMQ/Redis existente.
- Cadência: domínio de scheduling/opt-out e `CadenceRun`.

## Componentes a criar ou adaptar

Os nomes abaixo são direção de arquitetura; o Agente 01 ajusta ao padrão Prisma final e evita
duplicação semântica.

- Persistência ligada a `Company`: snapshot, score histórico, sinais, evidências normalizadas,
  decisores/metadados, relações econômicas e recomendações.
- Data access/API em `src/features/market-intelligence` com paginação server-side e escopo de tenant.
- Endpoint composto `GET /api/market-intelligence/accounts/:id/intelligence` e coleções paginadas.
- Refresh assíncrono idempotente, com estado `queued/running/ready/failed` e erro observável.
- Contrato de ação externa que converta recomendação aprovada em tarefa Bitrix sem duplicidade.
- Account 360 que consuma exclusivamente os contratos server-side e mostre loading/empty/error/stale.
- Testes unitários, integração/RLS, contrato e E2E do vertical slice.

## Riscos técnicos e bloqueadores

1. **PII global no incremento local (bloqueador).** `MarketIntelligenceCompany` inclui telefone e
   e-mail, enquanto a política proposta libera SELECT a qualquer tenant autenticado. Catálogo
   público e dados de contato devem ser separados/minimizados; dado pessoal não pode virar um
   diretório global entre organizações.
2. **Duas identidades empresariais sem crosswalk.** O catálogo CNPJ novo está explicitamente
   separado de `Company`, mas ainda não há vínculo/promote idempotente nem regra de ownership.
3. **Volume.** O frontend atual carrega arquivos JSON inteiros. O universo nacional deve ser
   consultado por busca/filtro/paginação server-side.
4. **Fallback enganoso.** Next Best Action e Decision Committee retornam recomendações genéricas em
   falha; o LDR deve registrar indisponibilidade, nunca fato/recomendação simulada.
5. **Migração ainda não validada.** Há `pg_trgm` duplicado em `02-enable-extensions.sql`, o check de
   CNPJ permite letras nos 12 primeiros caracteres e não há evidência de banco limpo + banco com
   dados atuais.
6. **Dependências reais.** Snapshot CNPJ nacional, Redis, PostgreSQL com extensões, credenciais de
   provedores e uma conexão Bitrix de teste são necessários para provar o fluxo completo.
7. **Freeze de escopo.** O LDR só é permitido por fechar a promessa já declarada de Market
   Intelligence operacional; otimizações não essenciais ficam pós-Sprint 13.

## Ownership da implementação

| Domínio | Dono | Arquivos/resultado |
|---|---|---|
| Coordenação, relatórios e integração | 00 | `.agents/runs/**`, matriz, gates e veredito |
| Schema, migrações, RLS e persistência | 01 | `prisma/schema.prisma`, `prisma/migrations/**`, repositories |
| Contratos e API | 18 | schemas HTTP, OpenAPI e paridade de tipos |
| ICP, elegibilidade e decisores | 05 | regras determinísticas e provenance de prospecção |
| Account 360 e jornada | 02 | rota/tela e estados, incluindo `src/App.tsx` quando necessário |
| IA, resumo e rationale | 07 | structured output, indisponibilidade explícita e recomendações |
| Bitrix | 06 | task/sync/webhook e idempotência externa |
| Enxame e approvals | 13 | consumo da inteligência por papéis runtime |
| Workers e refresh | 16 | filas, retries, scheduler e lifecycle |
| Cadência | 17 | recomendação aprovada → execução comercial |
| Segurança/PII | 15 com 01 | minimização, vazamento entre tenants e segredos |
| Harness e release | 14 + 08 | ambiente, gate, E2E e veredito |

Arquivos compartilhados permanecem com os donos exclusivos definidos em `AGENTS.md`. Em especial,
`prisma/schema.prisma`/migrações são do 01, `src/App.tsx` é do 02, `server.ts` exige 00 e
`package.json`/lockfile exigem 00.

## Ordem exata das próximas fases

1. Resolver o handoff de PII/RLS e estabilizar o catálogo empresarial em andamento.
2. Fase 1: persistência Account Intelligence + API de leitura/refresh e testes de autorização.
3. Fase 2: Account 360 sobre empresa real e estados honestos da interface.
4. Fase 3: score explicável, sinais deduplicados, decisores e evidências normalizadas.
5. Fase 4: recomendação aprovada → tarefa Bitrix idempotente, com retorno de status.
6. Fase 5: refresh/recomendações em workers, scheduler e cadência dentro dos guardrails.
7. Fase 6: grupo econômico e monitoramento de mudanças materiais.
8. Fase 7: a11y, segurança, integração, E2E e `RELEASE APPROVED`/`BLOCKED` do 08.

## Critérios de aceite globais

- Uma empresa real é localizada sem carregar o universo nacional no navegador.
- Promoção ao CRM é explícita, idempotente e preserva tenant/proveniência.
- Snapshot, score, sinais, evidências, decisores e recomendação persistem com versão e timestamps.
- Fato, inferência e recomendação são distinguíveis; ausência aparece como `NÃO DISPONÍVEL`.
- Score tem razões e não usa componente ausente como zero.
- Ação Bitrix é autorizada, idempotente, auditável e retorna estado à Central.
- Nenhum PII ou payload bruto desnecessário atravessa tenants ou aparece em logs/UI.
- Fluxos críticos têm caminho feliz e falha cobertos; migração passa em banco limpo e atualizado.
- Gate completo e verificações aplicáveis são executados com evidência real.

## Handoffs

- `.agents/handoffs/ldr-fase-0/00-para-01-catalogo-cnpj-pii-rls.md` — bloqueador aberto.

## Veredito

**FASE 0: PASS.** A arquitetura e as lacunas foram classificadas com evidência do repositório.

**FASE 1: NÃO INICIAR MERGE enquanto o handoff de PII/RLS estiver aberto.** O primeiro incremento
executável é estabilizar o catálogo empresarial que já está no working tree, sob ownership do
Agente 01, e então adicionar a persistência Account Intelligence ligada a `Company`.
