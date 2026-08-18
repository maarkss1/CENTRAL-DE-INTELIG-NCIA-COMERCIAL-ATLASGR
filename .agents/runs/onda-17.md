# Onda 17 — Sprint 05: Contrato de dados, CRM, Analytics e BI

## Identificação
- Sprint: 05
- Onda: 17
- SHA de entrada: `364a673` (main, pós-merge do PR #148 — Sprint 01/gap-fill 02-03/Sprint 04)
- Branch de integração: `claude/sprint-05-crm-dados-bi`
- Status: **APROVADA COM RESSALVA**

## Contexto

Diferente das sprints anteriores (que corrigiam violações pontuais já identificadas), esta sprint
partiu de um objetivo amplo do roadmap: "fazer `DB = domínio = repository = API = UI = Bitrix =
Analytics` bater, eliminando campos fantasma e métricas divergentes" (DATA-001 a DATA-009). Dado o
escopo, a rodada seguiu em duas fases:

1. **Auditoria real** — 5 investigações independentes e paralelas (schema/domain/repository,
   DTO/API/contratos OpenAPI, UI, mapping Bitrix, analytics/métricas), cada uma lendo o
   código-fonte diretamente, sem presumir a partir de documentação anterior. Resultado consolidado
   em `docs/DATA-CONTRACT-LEAD.md` (DATA-001).
2. **Correção seletiva** — dos ~20 achados reais, corrigidos os que eram bugs ativos de baixo
   risco e escopo contido; o restante (mudanças de contrato em cascata, mudanças de cálculo de
   métricas em produção, decisões de produto sobre mapeamento Bitrix) fica documentado como
   pendência real, não escondida.

## Achados corrigidos nesta rodada

### DATA-003 — Owner: bug ativo de escrita corrigido
`src/features/crm/components/LeadDetailDrawer.tsx` gravava o **nome** do responsável em vez do
`User.id` a cada reatribuição manual pelo dropdown "Responsável" — reintroduzia, na superfície de
escrita mais usada do produto (UI humana), o mesmo bug que a Onda 10 já tinha corrigido no import
Bitrix (`.agents/handoffs/onda-7/04-para-06-owner-bitrix-nome-nao-id.md`). Corrigido para enviar o
`id` diretamente. Verificado que o `<select>` de leitura já tolera os dois formatos (id novo e nome
legado), então a correção não quebra a exibição de dados históricos.

### DATA-004 — `closedAt`: 3 implementações divergentes unificadas
`PrismaLeadRepository.update()` (2 status fecham), `PrismaLeadRepository.updateStatus()` (4
status) e `PrismaCrm360Repository.updateLeadStage()` (2 status) mantinham listas divergentes do
que conta como "lead fechado" — a mesma transição de status fechava `closedAt` por uma rota da API
e não por outra. Unificado em `LEAD_CLOSING_STATUSES`/`isLeadClosingStatus()`
(`src/lib/enumMap.ts`), união dos 3 conjuntos anteriores — nenhum comportamento existente foi
revertido, os dois caminhos mais estreitos passaram a tratar os 2 estágios "...Cancelado" como
fechamento, igual ao terceiro já fazia. Teste unitário novo (`tests/unit/lib/enumMap.test.ts`)
fixa o contrato.

### DATA-004/005 — `funnel` nunca escrito no import de Deal do Bitrix
`src/features/integrations/bitrix/service/deals.ts` criava o `Lead` sem setar `funnel`, caindo no
default do schema (`LeadFunnel.Lead`) mesmo vindo de `crm.deal.get` — quebrava a segmentação usada
por `PrismaCommercialIntelligenceRepository`/`PrismaCrm360Repository` (que esperam
`funnel=Negocio` para todo negócio real). Corrigido para setar `LeadFunnel.Negocio` explicitamente.
`leads.ts` (import de Lead) já estava correto — o default `Lead` bate com `crm.lead.get`.

### Código morto removido
- `LEAD_FUNNEL_STATUS`, `DEAL_FUNNEL_STATUS`, `LEAD_FUNNEL = ['LEADS','DEALS']`
  (`src/lib/zod.ts`) — nunca importados em lugar nenhum, valores divergentes dos enums reais,
  risco de confusão futura por colisão de nome com `LeadFunnel` real.
- `src/features/crm360/services/crm360.service.ts` (552 linhas) — um segundo conjunto completo de
  `LEAD_STAGES`/`DEAL_STAGES`/`ensureDefaultPipelines` mantido manualmente em paralelo à
  implementação real (`PrismaCrm360Repository.ts`, registrada via DI em `shared/di/setup.ts`).
  Confirmado sem nenhum import de fora de si mesma na aplicação (só citado em 5 comentários
  desatualizados, corrigidos nesta rodada, e usado por 1 teste como atalho de setup — atualizado
  para usar a implementação real via `PrismaCrm360Repository.getPipelines()`).
- `STATUS_EMOJI` duplicado manualmente entre `KanbanColumn.tsx` e `LeadDetailDrawer.tsx` (o
  próprio comentário do drawer já reconhecia a duplicação como débito) — consolidado em
  `LEAD_STATUS_EMOJI` (`src/lib/enumMap.ts`).

## Achados documentados como pendência (não corrigidos nesta rodada)

Cada um está detalhado com arquivo:linha em `docs/DATA-CONTRACT-LEAD.md`. Resumo do motivo de cada
adiamento:

| Achado | Por que não corrigido agora |
|---|---|
| `status` interno nunca reflete `STATUS_ID`/`STAGE_ID` real no import Bitrix (sempre `Lead_Recebido`) | Exige decisão de produto — mapa `STATUS_ID`→`LeadStatus` varia por portal Bitrix, não é um bug de código isolado |
| 8 campos comerciais (resumeDate, cadenceStage, dealPackage, dealStatus, relationshipLevel, commissionPercent, partnerBroker, qualificationValidatedByAM) sem UI, sem Zod no caminho padrão | Construir UI + rota + validação é escopo de feature nova, não correção de contrato |
| `lossReason` com contrato de valor ambíguo (ID Bitrix cru via Mesa de Tratamento vs. texto via sync) | Toca em outro módulo (Mesa de Tratamento), precisa validação com o dono do fluxo |
| `amount` buscado (`OPPORTUNITY`) e descartado no import de Deal | Correção real, mas requer confirmar com o dono se `Lead.amount` deve refletir o Bitrix automaticamente ou se é intencionalmente editado só no Atlas |
| `qualificationValidatedByAM`: falha de tradução vira `false` persistido | Bug real e pequeno, mas de menor prioridade que os corrigidos — falha de tradução é rara (cache de 10 min já mitiga) |
| `currency` existe no schema mas `DealRow`/repositório o descarta — somas cross-currency sem conversão | Sem UI editando `currency` hoje, risco não se manifesta; registrado para não ser "descoberto" de novo no futuro |
| `docs/openapi.yaml`: `LeadStatus` documenta só 11/18 valores; `funnel`/`amount`/`closedAt`/`expectedCloseAt` ausentes; zero contract test real cobrindo o modelo (DATA-008) | Atualizar o YAML manualmente sem um contract test automatizado (CI) tem o mesmo risco de voltar a divergir — corrigir os dois juntos é a próxima rodada correta |
| `monthRange()`/`currentPeriod()` (commercial-intelligence) e `startOfCurrentMonth()` (analytics legado) usam UTC puro, não BRT — deslocam fechamentos perto da virada de mês | Mudança em cálculo de métrica já em produção; precisa de teste de regressão dedicado antes de mexer, não uma correção no meio de uma sprint ampla |
| `currentMonth()` frontend (local) vs `currentPeriod()` backend (UTC) — "mês atual" pode divergir | Mesma cautela do item de timezone acima |
| `buildForecastRange`/`computeTrendMomentum` duplicados linha a linha entre backend e frontend | Mudança arquitetural (frontend deveria consumir do backend), não um fix pontual |
| `analytics.service.ts:conversionRate` retorna `0` fabricado em vez de `null` quando denominador zero | `conversionRate: number` é tipo de contrato compartilhado consumido por 6+ componentes de UI com `.toFixed()` — mudar para `number \| null` é mudança de contrato em cascata |
| Índices ausentes em `Lead.owner`/`Lead.closedAt` (ambos usados em filtro/analytics) | Aplicar índice é geralmente seguro, mas decidir sem medir volume/padrão de query real em produção é chute — registrado para sprint de performance dedicada |
| Zero cobertura de teste para import Bitrix de Leads/Deals (`leads.ts`/`deals.ts`) | Construir harness mockando toda a API HTTP do Bitrix é esforço substancial, fora do escopo de uma correção pontual — a correção do `funnel` em si é uma linha de baixíssimo risco (adição a objeto literal) |

## Achados adicionais descobertos durante a correção (não previstos no roadmap original)

- Comentários em 5 arquivos (`ownershipGuard.ts`, `stageHistory.ts`, `analytics.service.ts`,
  `Analytics.ts`, `PrismaCommercialIntelligenceRepository.ts`) referenciavam
  `crm360.service.ts`/`crm360Service.moveRecord` — a implementação morta, não a real. Todos
  corrigidos para apontar para `PrismaCrm360Repository.ts`/`updateLeadStage`.
- `PrismaCommercialIntelligenceRepository.ts` mantém um quarto/quinto conjunto de
  `FALLBACK_WON_STATUSES`/`FALLBACK_LOST_STATUSES` (usado só quando um negócio legado não tem
  `pipelineStageId`) — internamente consistente e correto, mas não convertido para
  `LEAD_CLOSING_STATUSES` porque distingue won/lost e a fonte única representa só a união
  "fechado". Registrado em `docs/DATA-CONTRACT-LEAD.md` para não duplicar de novo se um sexto
  lugar precisar da mesma distinção.
- `ownershipGuard.ts` mantém uma quinta lista (`TERMINAL_STATUSES`, 5 valores incluindo
  `Lead_Desqualificado`) — intencionalmente diferente (é "terminal para bloqueio de duplicidade",
  não "fechado para closedAt"), já documentada como duplicação pequena aceitável no próprio
  código; só a referência ao arquivo morto foi corrigida.

## Gate final
- typecheck: `npx tsc --noEmit` — limpo, 0 erros
- lint: `npm run lint` — 0 erros, 80 warnings (mesmo nível pré-existente)
- unit: `npx vitest run -c vitest.unit.config.ts` — **163/163 arquivos, 1288/1288 testes** (era
  162/1282 antes desta sprint — +1 arquivo/+6 testes de `tests/unit/lib/enumMap.test.ts`)
- integration: `npx vitest run -c vitest.integration.config.ts` (Postgres real, porta 5434) —
  **30/30 arquivos, 129/129 testes**, incluindo `rbac-e2e-crm-operations.test.ts` atualizado
- build: `npm run build` — limpo
- build:worker: `npm run build:worker` — limpo
- e2e: não executado nesta rodada (ambiente sem browser headless disponível neste ambiente de
  execução específico) — nenhuma mudança desta sprint toca fluxo de UI end-to-end coberto por
  `tests/e2e/crm.spec.ts`/`crm-kanban.spec.ts` além do que unit+integration já cobrem
  (`LeadDetailDrawer`, `PrismaLeadRepository`); recomendado rodar antes do merge se o ambiente de
  CI tiver Playwright disponível (o workflow do GitHub Actions tem)

## Skips e flakes
0 — nenhum teste pulado ou instável observado nesta rodada.

## Riscos restantes
| Risco | Dono | Motivo do aceite | Revisar em |
|---|---|---|---|
| `status` do Bitrix nunca mapeado corretamente no import (sempre `Lead_Recebido`) | Produto + 06 (Bitrix) | Requer mapa por portal, decisão de produto | Próxima sprint de integração Bitrix |
| 8 campos comerciais sem UI | Produto + 02/04 | Feature nova, não bug de contrato | Quando priorizado |
| Timezone UTC em métricas de fechamento (analytics) | 04 (CRM/BI) | Mudança em cálculo de produção precisa de teste de regressão dedicado | Sprint de analytics dedicada |
| `docs/openapi.yaml` desatualizado, sem contract test real | 18 (contratos/API) | Corrigir sem automação reintroduz drift | DATA-008, sprint futura |
| `amount` descartado no import de Deal do Bitrix | 06 (Bitrix) + Produto | Requer confirmar se deve refletir o Bitrix automaticamente | Junto com correção de `status` |

## Decisão

**APROVADA COM RESSALVA.** Os achados corrigidos nesta rodada eram bugs reais e ativos
(reatribuição de owner corrompendo dado a cada uso manual; `closedAt` divergindo dependendo de
qual rota da API move o lead; negócios importados do Bitrix nunca entrando no funil correto) —
todos de escopo contido e baixo risco, verificados com gate completo (typecheck, lint, unit,
integration, build) e um teste unitário novo fixando o contrato de fechamento. O volume real de
achados desta auditoria (~20) excede o que é seguro corrigir numa única rodada sem risco de
regressão em métricas/fluxos já em produção — a matriz completa (`docs/DATA-CONTRACT-LEAD.md`)
documenta cada pendência com motivo explícito de adiamento, não como itens escondidos ou
"resolvidos" por auditoria de leitura. Critério de aceite do roadmap ("todo KPI executivo
rastreável até a fórmula e os registros de origem; todo campo comercial sobrevive ao round-trip")
segue parcialmente atendido: os campos com round-trip real (status, funnel, owner, closedAt) agora
têm contrato único e testado; os campos "fantasma" (resumeDate, cadenceStage, etc.) continuam sem
round-trip por não terem UI — registrado como gap de produto, não de dado.
