# Relatório de Triagem — TODO / FIXME / HACK / XXX

**Onda:** 42 · **Decisão de origem:** dossiê CPI, DEC-22, opção A (autorização de varredura de
levantamento/categorização — sem decisão de prioridade, sem redesenho, sem mudança de
comportamento).
**Escopo:** `src/`, `tests/`, `scripts/`, `prisma/` (busca exaustiva, todas as variações de case e
estilo de comentário — `//`, `/* */`, `#`, `--`, `///`).
**Método:** grep exaustivo (`\b(TODO|FIXME|HACK|XXX)\b`, case-insensitive) + leitura manual de
**cada** ocorrência no contexto real do arquivo (nenhuma foi classificada só pelo grep).
**Data:** 27/08/2026.

---

## Resumo executivo

### Achado principal: a base de "264 ocorrências" citada no brief é, na prática, quase inteiramente
falso positivo de busca — não débito não-triado

Rodando a varredura exaustiva pedida (case-insensitive, `\b(TODO|FIXME|HACK|XXX)\b`) em `src/`,
`tests/`, `scripts/` e `prisma/`, o total bruto encontrado foi **180 ocorrências** (não 264 — a
diferença provavelmente vem de escopo de busca mais amplo, contagem sem `\b`, ou diretórios fora dos
4 pedidos aqui; um grep solto sem filtro nestes 4 diretórios, sem `\b`, retorna 411, e no repositório
inteiro passa de 425 — a ordem de grandeza bate com "centenas", mas por um motivo diferente do
suposto). Depois de ler cada uma das 180 linhas no contexto real do arquivo:

| Categoria | Qtd | % | O que significa |
|---|---:|---:|---|
| **Falso positivo — palavra portuguesa "todo/toda"** (pronome/adjetivo "every/all/whole", não o marcador em inglês) | 149 | 82,8% | Ex.: "todo lead", "todo o resto", "roda todo dia" — português comum, não é comentário de débito |
| **Falso positivo — substring de "método"** (a palavra "método"/"Método" termina em "-todo"; em `grep -i \btodo\b` o acento em "é" quebra o boundary de palavra nesta libc/locale e casa incorretamente) | 27 | 15,0% | Ex.: "por método, rota e status code", "Método `crm.lead.fields`" — a palavra é "método" (method), não tem nada a ver com TODO |
| **Falso positivo — máscara/placeholder de CPF, CNPJ ou rota de exemplo** | 3 | 1,7% | `XXX.XXX.XXX-XX` (CPF), `XX.XXX.XXX/XXXX-XX` (CNPJ), `/api/xxx` (exemplo genérico de rota em comentário) |
| **INTENCIONAL/DOCUMENTADO** (nota histórica válida, não é um TODO vivo) | 1 | 0,6% | `prisma/schema.prisma:1664` — documentação que **cita**, como contexto histórico, um `// TODO: salvar no CRM no futuro` que existia *antes* da tabela `WhatsAppMessage` ser criada. O TODO citado já foi resolvido pela própria tabela; o comentário atual é documentação legítima, não um débito |
| **DÉBITO REAL** | **0** | 0% | — |
| **OBSOLETO (removível com segurança)** | **0** | 0% | — |
| **AMBÍGUO** | **0** | 0% | — |
| **Total** | **180** | 100% | |

**Conclusão central:** depois de ler todas as 180 ocorrências no contexto de cada arquivo, **nenhum
marcador real de débito técnico no formato `TODO`/`FIXME`/`HACK`/`XXX` foi encontrado** em `src/`,
`tests/`, `scripts/` ou `prisma/` hoje. Confirmação por palavra-chave:

- `FIXME` (case-insensitive, `\b\b`): **0 ocorrências** em todo o escopo.
- `HACK` (case-insensitive, `\b\b`): **0 ocorrências** em todo o escopo.
- `XXX` (case-insensitive, `\b\b`): **3 ocorrências**, todas máscaras de documento (CPF/CNPJ) ou
  exemplo de rota — nenhuma é um marcador de débito.
- `TODO` (case-insensitive, `\b\b`): **177 ocorrências**, das quais 176 são a palavra portuguesa
  "todo/toda" (ou a substring de "método") e 1 é uma nota histórica documentada (não um TODO vivo).

Isto **não significa que o produto não tem débito técnico** — significa que esse débito, se existir,
não está marcado com a convenção `TODO`/`FIXME`/`HACK`/`XXX` neste código hoje. O padrão real deste
repositório (visível em praticamente todo arquivo lido durante esta varredura) é documentar decisão,
contexto e "por que isto existe" em comentários JSDoc/`///` de prosa longa — não com marcadores de
uma palavra. Rastrear débito técnico real neste projeto provavelmente exige outro método (busca por
`@ts-ignore`, `eslint-disable`, issues abertas, ou os débitos já mapeados em
`eslint.config.mjs`/`.claude/PILOTS.md` citados no `CLAUDE.md`), não a convenção TODO/FIXME/HACK/XXX.

### Ação tomada

Nenhuma remoção de comentário foi feita. O único item fora de "falso positivo puro"
(`prisma/schema.prisma:1664`) é documentação institucional válida — explica por que a tabela
`WhatsAppMessage` existe (histórico: antes dela, mensagens recebidas eram descartadas com só um
comentário `// TODO: salvar no CRM no futuro` no handler, nunca implementado) — e não deve ser
removido; é conteúdo/regra de negócio preservável pela seção 6 da constituição deste repositório, não
um comentário obsoleto. Como não havia nada de alta confiança para remover com segurança, **não foi
necessário rodar `npx tsc --noEmit`/`npm run lint` nem criar commit** — não houve mudança de código.

### Módulos com mais ocorrências (todas falso positivo, não débito)

| Módulo | Ocorrências | Categoria dominante |
|---|---:|---|
| `src/features/integrations` (Bitrix, Google, Birth Voice) | 28 | "método" (Bitrix REST) + "todo/toda" |
| `src/features/intelligence` (agentes/IA) | 22 | "todo/toda" |
| `src/features/commercial-intelligence` | 18 | "todo/toda" |
| `tests/*` (integration + unit + e2e) | 20 | "todo/toda" |
| `src/lib` (gateway de IA, auth, prisma) | 13 | "todo/toda" |
| `scripts/*` | 14 | "método" (verify-openapi-drift.ts) + "todo/toda" |
| `src/shared` | 7 | "método" + "todo/toda" |
| `prisma/*` (schema + migrations) | 10 | "todo/toda" (1 nota histórica) |
| Demais módulos (crm, cadence, prospecting, analytics, automations, calendar, mesa-tratamento, bug-reports, billing, knowledge, team, companies, market-intelligence, config, hooks, bootstrap, components, App raiz) | 48 | "todo/toda" |

Nenhum módulo concentra débito real — a distribuição acima só reflete onde a palavra portuguesa
"todo" e "método" aparecem mais em prosa técnica (documentação de contrato de API, RBAC,
agendamento "roda todo dia", "todo tenant", etc.), não onde há trabalho pendente.

---

## Tabela completa (180/180 ocorrências, lidas uma a uma)

Legenda de categoria:
- **FP-todo** = Falso positivo, palavra portuguesa "todo/toda" (every/all/whole)
- **FP-método** = Falso positivo, substring de "método" (method) — quirk de word-boundary com acento
- **FP-máscara** = Falso positivo, placeholder de CPF/CNPJ/rota de exemplo
- **INTENCIONAL** = Documentação legítima que cita, como histórico, um TODO já resolvido

### prisma/

| Local | Trecho | Categoria |
|---|---|---|
| `prisma/schema.prisma:1664` | `/// comentário "// TODO: salvar no CRM no futuro". contactId/leadId ficam nulos quando o...` | **INTENCIONAL** — nota histórica: documenta por que a tabela `WhatsAppMessage` foi criada (antes dela, o handler só tinha esse TODO nunca implementado e descartava mensagens). O TODO citado já foi resolvido pela própria tabela; não é débito vivo. |
| `prisma/schema.prisma:1999` | `/// Nullable: nem todo PABX exige API key/secret...` | FP-todo |
| `prisma/migrations/20260731170000_knowledge_base_tenant_scope/migration.sql:44` | `-- Condicional de propósito: nem todo Postgres...` | FP-todo |
| `prisma/migrations/20260809100000_crm360_soft_delete_columns/migration.sql:5` | `-- Prisma injeta incondicionalmente deletedAt: null em todo SELECT...` | FP-todo |
| `prisma/migrations/20260810130000_remove_knowledge_document/migration.sql:3` | `-- Prisma (prisma.knowledgeDocument.*) em todo o código...` | FP-todo |
| `prisma/migrations/20260815120000_opt_out_record/migration.sql:48` | `-- Backfill: todo bloqueio de voz já registrado...` | FP-todo |
| `prisma/migrations/20260816120000_cadence_scheduling_signature/migration.sql:146` | `-- preserva a leitura de todo sinal histórico...` | FP-todo |
| `prisma/migrations/20260820100000_agent_memory_status_and_unique/migration.sql:39` | `-- confirma para todo outro campo @updatedAt...` | FP-todo |

### scripts/

| Local | Trecho | Categoria |
|---|---|---|
| `scripts/reset-passwords.core.ts:85` | `// para acontecer por engano. Para atingir todo mundo...` | FP-todo |
| `scripts/verify-openapi-drift.ts:10` | `* (Passe 2, ver abaixo) endpoint concreto (path + método HTTP)...` | FP-método |
| `scripts/verify-openapi-drift.ts:15` | `* não valida método/parâmetro/corpo/status code...` | FP-método |
| `scripts/verify-openapi-drift.ts:16` | `* router de cada feature — só o app.use('/api/xxx', ...) de topo.` | FP-máscara (exemplo de rota) |
| `scripts/verify-openapi-drift.ts:24` | `* router.use() aninhado ... cruza path+método exatos...` | FP-método |
| `scripts/verify-openapi-drift.ts:141` | `* topo e cruza path+método exatos contra docs/openapi.yaml...` | FP-método |
| `scripts/verify-openapi-drift.ts:235` | `console.error('❌ Endpoints reais (path + método)...` | FP-método |
| `scripts/verify-openapi-drift.ts:244` | `console.error('❌ Path documentado ... SEM o método HTTP...` | FP-método |
| `scripts/verify-openapi-drift.ts:256` | `'comentário de topo deste arquivo (Passe 2, path+método...` | FP-método |
| `scripts/architecture/check-hotspots.ts:75` | `continue; // worker.ts pode não existir em todo checkout...` | FP-todo |
| `scripts/db/create-app-role.sql:41` | `-- plpgsql, instalada automaticamente em todo banco novo)...` | FP-todo |
| `scripts/security/check-audit-waivers.ts:11` | `//   2. extrai os advisory IDs (GHSA-...) de todo achado HIGH/CRITICAL;` | FP-todo |
| `scripts/security/check-audit-waivers.ts:16` | `//   5. passa (exit 0) só quando todo achado HIGH/CRITICAL...` | FP-todo |
| `scripts/security/dependency-inventory.ts:14` | `// npm ci/npm install já imprime em stderr para todo pacote deprecated...` | FP-todo |

### src/ (raiz, bootstrap, components, config, hooks, shared, lib)

| Local | Trecho | Categoria |
|---|---|---|
| `src/App.tsx:100` | `CommandPalette navegam para /app/${tab} para TODO TabType...` | FP-todo |
| `src/bootstrap/security.ts:8` | `// mas só aceitando as origens de localhost... — todo tráfego do frontend real...` | FP-todo |
| `src/bootstrap/security.ts:18` | `* a aplicação subir "saudável" enquanto rejeita todo tráfego real por CORS.` | FP-todo |
| `src/components/CrmBoard.tsx:84` | `// /api/users nunca existiu como rota (404 silencioso todo carregamento...` | FP-todo |
| `src/components/ui/Dialog.tsx:63` | `// (todo formulário em Dialog — ContactForm, CompanyForm...` | FP-todo |
| `src/config/env.ts:196` | `// SDROutboundDraftAgent ... fluxo padrão de qualificação de todo lead...` | FP-todo |
| `src/config/env.ts:233` | `// corretos (number, boolean) em todo lugar que consome env...` | FP-todo |
| `src/hooks/useBrandAccent.ts:18` | `// bg/solidBg usam a versão -active ... todo consumidor que as usa...` | FP-todo |
| `src/shared/contracts/openapiRouteInventory.ts:12` | `* ... Ela NÃO valida método/parâmetro/corpo/status code...` | FP-método |
| `src/shared/contracts/openapiRouteInventory.ts:18` | `* Como funciona: extrai do código-fonte todo mount HTTP...` | FP-todo |
| `src/shared/contracts/openapiRouteInventory.ts:33` | `* server.ts com todo src/bootstrap/*.ts, via collectCompositionRootSource.` | FP-todo |
| `src/shared/contracts/openapiRouteInventory.ts:40` | `* Concatena server.ts com todo src/bootstrap/*.ts...` | FP-todo |
| `src/shared/contracts/openapiRouteInventory.ts:108` | `/** Extrai todo mount HTTP de path literal em server.ts...` | FP-todo |
| `src/shared/middlewares/httpMetrics.ts:21` | `help: 'Duração de requisições HTTP em milissegundos, por método, rota...'` | FP-método |
| `src/shared/services/dataSubjectErasure.service.ts:30` | `* destruído é todo campo que identifica a pessoa...` | FP-todo |
| `src/lib/ai/gateway.ts:16` | `* gateway/http-client.ts — transporte HTTP comum a todo adapter...` | FP-todo |
| `src/lib/ai/gateway/__tests__/providers.golden.test.ts:75` | `// Forma golden: todo adapter devolve exatamente estes 3 campos...` | FP-todo |
| `src/lib/ai/gateway/circuit-breaker.ts:85` | `* ... só volta a tentar depois do resfriamento. Ponto único que todo...` | FP-todo |
| `src/lib/ai/gateway/http-client.ts:31` | `* AI_FALLBACK_TIMEOUT_MS. Único ponto ... todo adapter recebe o valor...` | FP-todo |
| `src/lib/ai/gateway/prompt-registry.ts:2` | `* Catálogo central dos promptId ... em todo o...` | FP-todo |
| `src/lib/ai/gateway/providers/types.ts:2` | `* Contrato uniforme que todo adapter de provedor...` | FP-todo |
| `src/lib/async-context.ts:28` | `// quando o método .create()/.findMany() é invocado).` | FP-método |
| `src/lib/auth/authorization.ts:21` | `* usado, para todo o resto do código importar...` | FP-todo |
| `src/lib/auth/authorization.ts:79` | `* hasRequiredRole é a MESMA função usada por todo o resto do RBAC...` | FP-todo |
| `src/lib/enrichment/providerFetch.ts:54` | `/** Todo outro 4xx (400, 401, 403, 404, 422...) é definitivo...` | FP-todo |
| `src/lib/prisma.ts:21` | `// todo o resto do código (services continuam lendo texto puro...` | FP-todo |
| `src/lib/prisma.ts:125` | `// organizationId de cada run, todo o resto do ciclo...` | FP-todo |
| `src/lib/tenant-prisma.ts:5` | `// de mantido à mão ... já quebrou antes: todo` | FP-todo |

### src/features/analytics

| Local | Trecho | Categoria |
|---|---|---|
| `src/features/analytics/domain/Analytics.ts:25` | `/** Todo status que representa fechamento, ganho ou sem venda...` | FP-todo |
| `src/features/analytics/domain/Analytics.ts:127` | `* Repository<T>/CrudRepository<T> ... cada método espelha uma...` | FP-método |
| `src/features/analytics/infra/PrismaAnalyticsRepository.ts:179` | `// legada deste método (analytics.service.ts) filtrava por type: 'call'...` | FP-método |
| `src/features/analytics/presentation/AnalyticsController.ts:53` | `* um número inventado idêntico teria vazado para todo tenant.` | FP-todo |
| `src/features/analytics/presentation/AnalyticsController.ts:68` | `* PDF válido — todo download produzia um arquivo corrompido...` | FP-todo |

### src/features/automations

| Local | Trecho | Categoria |
|---|---|---|
| `src/features/automations/application/cold-leads-scanner.service.ts:163` | `// Roda todo dia as 02:00` | FP-todo |
| `src/features/automations/application/stagnation-scanner.service.ts:75` | `* ... Isso evita reavisar todo dia` | FP-todo |
| `src/features/automations/application/stagnation-scanner.service.ts:258` | `// Roda todo dia as 03:17` | FP-todo |
| `src/features/automations/components/Automations.tsx:165` | `Reavaliar todo dia se ficar parado por (dias)` | FP-todo |

### src/features/billing, bug-reports, knowledge, team, companies, market-intelligence, mesa-tratamento

| Local | Trecho | Categoria |
|---|---|---|
| `src/features/billing/usage.service.ts:32` | `/** Custo do mês corrente, para comparação com o período todo. */` | FP-todo |
| `src/features/bug-reports/bugReport.api.ts:21` | `*  todo relato, por isso vive aqui e não em cada chamador do botão. */` | FP-todo |
| `src/features/bug-reports/bugReport.routes.ts:41` | `// relata não precisa ... enxergar todos os relatos de todo mundo...` | FP-todo |
| `src/features/knowledge/vector-support.ts:9` | `* DocumentChunk.vector é criada como TEXT e todo cast ::vector estoura...` | FP-todo |
| `src/features/team/services/team.service.ts:135` | `// Conta que só tinha login social ... ganha um método de...` | FP-método |
| `src/features/companies/components/CompanyList.tsx:200` | `preservando a hierarquia secundária. Mesmo tratamento em todo o arquivo` | FP-todo |
| `src/features/market-intelligence/components/MarketIntelligenceApp.tsx:88` | `// a janela real do cron, que roda todo dia 10)...` | FP-todo |
| `src/features/mesa-tratamento/AGENTS.md:13` | `(ou, para ADMIN/GESTOR, a fila do time todo).` | FP-todo |
| `src/features/mesa-tratamento/components/MesaTratamento.tsx:12` | `*  entrega (ADMIN/GESTOR sem filtro de dono = fila do time todo)...` | FP-todo |
| `src/features/mesa-tratamento/routes/mesaTratamento.routes.ts:114` | `// (ADMIN/GESTOR: sem filtro — importa novidades do time todo...` | FP-todo |

### src/features/cadence e calendar

| Local | Trecho | Categoria |
|---|---|---|
| `src/features/cadence/application/cadenceService.ts:144` | `// Trava todo o ciclo (leitura já feita → decisão...` | FP-todo |
| `src/features/cadence/cadence.routes.ts:24` | `* Mesmo padrão de autenticação/tenant isolation de todo router...` | FP-todo |
| `src/features/cadence/domain/cadence.ts:6` | `* implícito (todo "agora" entra como parâmetro)...` | FP-todo |
| `src/features/cadence/domain/cadence.ts:14` | `* - janela comercial vale para todo contato externo...` | FP-todo |
| `src/features/cadence/domain/cadence.ts:334` | `// CPF exige a pontuação (XXX.XXX.XXX-XX) para não colidir...` | FP-máscara (CPF) |
| `src/features/cadence/jobs/cadenceRun.worker.ts:26` | `* hoje por todo job em lote que precisa enxergar...` | FP-todo |
| `src/features/calendar/routes/booking.routes.ts:102` | `* ou seja, TODO agendamento público (GET e POST) devolvia erro 500...` | FP-todo |
| `src/features/calendar/routes/booking.routes.ts:181` | `// Todo o restante roda dentro do tenant real do link...` | FP-todo |

### src/features/commercial-intelligence

| Local | Trecho | Categoria |
|---|---|---|
| `.../__tests__/CommercialIntelligenceUseCases.unit.test.ts:145` | `it('Pipeline Total inclui todo negócio aberto...` | FP-todo |
| `.../application/CommercialIntelligenceUseCases.ts:6` | `* ..., delegando cada método a um módulo...` | FP-método |
| `.../application/CommercialIntelligenceUseCases.ts:10` | `*   Explicável a cada um (ScoredDeal), a base comum de todo relatório.` | FP-todo |
| `.../application/dataReadiness.ts:92` | `* "Motivo da perda" é avaliado sobre negócios perdidos (todo o histórico...` | FP-todo |
| `.../application/goalCommands.ts:4` | `* são a única parte deste módulo que ESCREVE dado (todo o restante...` | FP-todo |
| `.../application/metricsDictionary.ts:98` | `description: 'Todo valor aberto no funil Negócio...'` | FP-todo |
| `.../application/metricsDictionary.ts:271` | `period: 'Todo o histórico disponível no escopo do filtro...'` | FP-todo |
| `.../application/predictiveForecast.ts:27` | `*   pipeline ponderado ... inclui uma fração de TODO negócio aberto...` | FP-todo |
| `.../application/predictiveForecast.ts:29` | `* - Otimista: Fechado + Pipeline Total (valor cheio de TODO negócio aberto...` | FP-todo |
| `.../application/predictiveForecast.ts:34` | `*   (todo o funil aberto, não o "elegível"...` | FP-todo |
| `.../application/scoring/dealScoring.ts:7` | `* idêntica em todo o módulo.` | FP-todo |
| `.../application/scoring/dealScoring.ts:62` | `* Filtro comum a quase todo relatório: só o funil "Negócio"...` | FP-todo |
| `.../application/shared/period.ts:2` | `* Granularidade mensal ... — todo relatório "do mês" ancora...` | FP-todo |
| `.../domain/CommercialIntelligence.ts:6` | `* ... Todo número` | FP-todo |
| `.../domain/CommercialIntelligence.ts:15` | `/** Mês de referência ("YYYY-MM"). Todo cálculo "do mês"...` | FP-todo |
| `.../domain/CommercialIntelligence.ts:759` | `/** Todos os negócios (funil "Negócio"...) ... quase todo cálculo...` | FP-todo |
| `.../presentation/CommercialIntelligenceController.ts:22` | `* ...; sem este fallback, todo endpoint de IA ignorava...` | FP-todo |
| `.../routes/commercialIntelligence.routes.ts:13` | `// aplicados no mount de server.ts, igual a todo outro módulo)...` | FP-todo |

### src/features/crm

| Local | Trecho | Categoria |
|---|---|---|
| `src/features/crm/application/dealClosureGate.ts:15` | `* evidência bloquearia todo fechamento manual...` | FP-todo |
| `src/features/crm/components/LeadDetailDrawer.tsx:136` | `// /api/users nunca existiu como rota (404 silencioso todo carregamento)...` | FP-todo |
| `src/features/crm/components/LeadDetailDrawer.tsx:194` | `// requireLeadOwnership.ts). Todo o resto da aplicação...` | FP-todo |
| `src/features/crm/infra/PrismaLeadRepository.ts:139` | `// Mesma lógica de closedAt de updateStatus ... este método também...` | FP-método |
| `src/features/crm/jobs/autoAnonymizeDisqualified.worker.ts:124` | `{ pattern: '0 3 * * *' }, // Roda todo dia às 3h da manhã` | FP-todo |
| `src/features/crm/jobs/dailyExecutiveSummary.worker.ts:94` | `// Roda todo dia as 18:00.` | FP-todo |
| `src/features/crm/jobs/followUp.worker.ts:117` | `// Roda todo dia as 09:00.` | FP-todo |

### src/features/integrations (bitrix, birth-voice, google, componentes)

| Local | Trecho | Categoria |
|---|---|---|
| `.../birth-voice/__tests__/callSuppression.service.test.ts:181` | `// Ponto 2 ... todo bloqueio de voz novo também vira um OptOutRecord` | FP-todo |
| `.../birth-voice/__tests__/coldCall.service.test.ts:6` | `// próprio arquivo) — sem isto, todo teste abaixo pararia...` | FP-todo |
| `.../birth-voice/birthVoice.helpers.ts:164` | `* ... por isso todo sinal explícito acima tem prioridade.` | FP-todo |
| `.../birth-voice/birthVoice.helpers.ts:210` | `/** Só este estado representa uma conversa real ... todo o resto é honestamente "não". */` | FP-todo |
| `.../birth-voice/callSuppression.service.ts:14` | `* Todo número entra e sai daqui normalizado em E.164...` | FP-todo |
| `.../bitrix/bitrix.routes.ts:42` | `// ... é o papel só-leitura em todo o resto do produto.` | FP-todo |
| `.../bitrix/bitrix.routes.ts:489` | `// Restrito a ADMIN/GESTOR ... uma extração pode trazer TODO o dado` | FP-todo |
| `.../bitrix/service/__tests__/deals.test.ts:55,88` | ``método Bitrix inesperado neste teste: ${method}`` | FP-método (×2) |
| `.../bitrix/service/__tests__/extractionPeriod.test.ts:4` | `// "now" fixo para todo o arquivo: 15/08/2026 14:30 UTC...` | FP-todo |
| `.../bitrix/service/__tests__/leads.test.ts:72` | `// Todo página devolve registros já importados...` | FP-todo |
| `.../bitrix/service/__tests__/leads.test.ts:152,185` | ``método Bitrix inesperado neste teste: ${method}`` | FP-método (×2) |
| `.../bitrix/service/__tests__/outboundSync.test.ts:107` | `throw new Error('Método não suportado por este webhook');` | FP-método |
| `.../bitrix/service/client.ts:129` | `/** Amarra todas as tentativas ... se o chamador propagar, todo o...` | FP-todo |
| `.../bitrix/service/connections.ts:111` | `* de todo evento recebido em bitrix.webhook.ts...` | FP-todo |
| `.../bitrix/service/customFields.ts:53` | `* Resolve os mapas ID↔texto de todo campo enumeration/boolean_sim_nao...` | FP-todo |
| `.../bitrix/service/customFields.ts:84` | `* ... Mesmo método (crm.lead.fields/...` | FP-método |
| `.../bitrix/service/deals.ts:354` | `// funnel=Negocio para todo negócio real).` | FP-todo |
| `.../bitrix/service/extractionEntities.ts:2,15,17` | `Mapeamento de entidade Bitrix → método REST...` / `Método crm.<entidade>.list/.fields` | FP-método (×3) |
| `.../bitrix/service/metrics.ts:17` | `* agendamento como um todo, não de uma regra/lead específico.` | FP-todo |
| `.../bitrix/service/outboundSync.ts:139` | `// falhar por qualquer razão (portal antigo sem o método...` | FP-método |
| `.../components/BitrixExtractionPanel.tsx:215` | `Extrações em massa ... de todo o portal exigem permissão...` | FP-todo |
| `.../components/Integrations.tsx:358` | `title="Todo lead novo é enviado automaticamente para o Bitrix24"` | FP-todo |
| `.../components/WebhookMonitor.tsx:16` | `// partir de Date.now() ... Todo usuário que abrisse esta aba...` | FP-todo |
| `.../google/google.service.ts:115` | `// método sobrecarregado (getToken tem overloads)...` | FP-método |

### src/features/intelligence (agentes de IA)

| Local | Trecho | Categoria |
|---|---|---|
| `.../agents/__tests__/closer.no-win-path.test.ts:11` | `* updateLeadQualificationTool ... é a ÚNICA ferramenta de todo o enxame...` | FP-todo |
| `.../agents/__tests__/learning.agent.consent.test.ts:54` | `// Sem ações recentes, o método retorna null...` | FP-método |
| `.../agents/learning.agent.ts:49` | `* permite calcular ... sem reprocessar todo o histórico. */` | FP-todo |
| `.../agents/supervisor.agent.ts:148` | `// para usar como instrução de contingência — antes disto, todo fallback...` | FP-todo |
| `.../agents/supervisor.agent.ts:552` | `// ... já que o checkpointer deste grafo é compartilhado por todo o processo.` | FP-todo |
| `.../agents/swarm.constants.ts:2` | `* Identidade de marca ... compartilhados por todo o Enxame (Swarm)...` | FP-todo |
| `.../agents/swarm.constants.ts:31` | `* Reforço de confiança de conteúdo, compartilhado por todo o enxame...` | FP-todo |
| `.../components/BitrixGuideHub.tsx:39,43` | `exigindo que todo Lead criado contenha o CNPJ/placa...` | FP-todo (×2) |
| `.../evaluation/goldenDataset.service.ts:80` | `* ... que não fazem sentido carregar em todo lugar que só lê...` | FP-todo |
| `.../jobs/agentMemoryCleanup.worker.ts:39` | `* para todo agente do enxame (SDR/BDR/CLOSER/CRM/OPS/LearningAgent)...` | FP-todo |
| `.../jobs/agentMemoryCleanup.worker.ts:121` | `// Roda todo dia às 4h da manhã...` | FP-todo |
| `.../routes/agent.routes.ts:50` | `// Retorna a última mensagem ou todo o contexto...` | FP-todo |
| `.../routes/prompt.routes.ts:35` | `// req.user.organizationId) — todo prompt criado por qualquer tenant...` | FP-todo |
| `.../services/__tests__/ai.service.qualifyLead.test.ts:3` | `// AI-007 ... qualifyLead() é o fluxo PADRÃO de qualificação de todo lead` | FP-todo |
| `.../services/ai.service.ts:334` | `// AI-007 ... este é o fluxo PADRÃO de qualificação de todo lead...` | FP-todo |
| `.../services/vector.service.ts:14` | `* ... ingestDocument nunca teve nenhum chamador em todo o app...` | FP-todo |
| `.../services/vector.service.ts:15` | `* ficava sempre vazia na prática — então todo consumidor de searchSimilar...` | FP-todo |
| `.../tools/__tests__/marketResearchTool.test.ts:23,41` | `title: 'Loggi - Entregas para todo o Brasil'` | FP-todo (×2) |
| `.../tools/marketResearchTool.ts:232` | `// Monta relatório executivo ... Todo texto vindo do motor de busca...` | FP-todo |
| `.../tools/playbookTool.ts:12` | `* Proveniência ponta a ponta (Onda 7): todo trecho devolvido cita...` | FP-todo |

### src/features/prospecting

| Local | Trecho | Categoria |
|---|---|---|
| `.../schemas/discoverCriteria.schema.ts:7` | `* ... Todo campo é livre-texto/número solto de propósito...` | FP-todo |
| `.../services/apollo.service.ts:3` | `// busca de organizações (com todo o mapeamento de ICP/região/keyword)...` | FP-todo |
| `.../services/apollo/organizationSearch.ts:49` | `* nicho fora do ICP logístico padrão ... Antes, todo` | FP-todo |
| `.../services/enrichment.service.ts:73` | `* ...: antes deste guard, TODO chamador de` | FP-todo |
| `.../services/enrichment.service.ts:137` | `* hoje todo chamador real já valida a posse do registro...` | FP-todo |
| `.../services/enrichment/domainGuess.ts:26` | `* realmente exista — hoje todo contato virava "guessed"...` | FP-todo |
| `.../services/enrichment/domainGuess.ts:61` | `* Heurística de descoberta ... (SDR manual faz isso o tempo todo):` | FP-todo |
| `.../services/enrichmentCascade.service.ts:41` | `* "rodamos tudo e não achamos nada novo": todo *Enriched em false...` | FP-todo |

### tests/

| Local | Trecho | Categoria |
|---|---|---|
| `tests/AGENTS.md:64` | `propósito, para todo script de bootstrap sempre achar o mesmo nome...` | FP-todo |
| `tests/e2e/cadence.spec.ts:60` | `// O filtro padrão da tela mostra só Ativa+Pausada (evita listar todo o histórico...` | FP-todo |
| `tests/e2e/helpers.ts:78` | `* timeout. Nas demais telas ... consumir quase todo o` | FP-todo |
| `tests/integration/ai-budget.test.ts:11` | `* e cada teste sobrescreve o campo ... (mesma referência em todo import).` | FP-todo |
| `tests/integration/lead-export-audit.test.ts:25` | `// (fire-and-forget, mesmo padrão de todo outro chamador de AuditService.log...` | FP-todo |
| `tests/integration/lgpd-erasure-cross-tenant.test.ts:31` | `// (o padrão já usado em todo o resto de tests/integration/) resolve — por isso todo withTenant/` | FP-todo |
| `tests/integration/prospecting-rls.test.ts:29` | `// Orgs dedicadas (não a 'test-org-id' compartilhada por todo o resto...` | FP-todo |
| `tests/integration/rbac-e2e-feature-flags.test.ts:42` | `// não existiria em FeatureFlag e todo PUT/GET voltaria vazio/404...` | FP-todo |
| `tests/integration/sec001-bullboard-access.test.ts:22` | `// ... o valor vem de .env.test (mesma fonte que todo o resto da...` | FP-todo |
| `tests/integration/swarm-autonomous-mission-e2e.test.ts:11` | `* logAiUsage (grava AILog de verdade) e todo o resto do pipeline...` | FP-todo |
| `tests/unit/components/ui/Toaster.test.tsx:4` | `* praticamente todo fluxo de erro/sucesso do produto...` | FP-todo |
| `tests/unit/features/automation-sdr-voz.test.ts:3` | `* sozinha para todo lead novo.` | FP-todo |
| `tests/unit/features/automation-sdr-voz.test.ts:68` | `name: 'Ligar para todo lead novo',` | FP-todo |
| `tests/unit/features/automations-ui.test.tsx:160` | `await user.type(screen.getByLabelText(/Reavaliar todo dia/), '3');` | FP-todo |
| `tests/unit/features/integrations/whatsapp/whatsapp.routes.test.ts:48` | `// ... era o único caller de produção desse flag em todo o repositório...` | FP-todo |
| `tests/unit/features/intelligence/jobs/agentMemoryCleanup.worker.test.ts:5` | `* organizationId) para todo agente de IA do enxame...` | FP-todo |
| `tests/unit/features/intelligence/routes/intelligence.routes.test.ts:183` | `* legal LGPD, ao contrário de todo outro caminho que envia dado pessoal...` | FP-todo |
| `tests/unit/features/intelligence/routes/intelligence.routes.tenant-forgery.test.ts:3` | `* onda-40): organizationId de todo request autenticado vem sempre...` | FP-todo |
| `tests/unit/features/prospecting/services/cnpj.util.test.ts:37` | `it('formata dígitos crus no padrão XX.XXX.XXX/XXXX-XX', () => {` | FP-máscara (CNPJ) |
| `tests/unit/shared/diWiringConsistency.test.ts:14` | `it('todo Controller de presentation/ é resolvido por pelo menos uma rota...` | FP-todo |

---

## Nota metodológica (por que 180, e por que 264 provavelmente estava errado)

Este repositório é majoritariamente comentado em português técnico de prosa longa (JSDoc/`///`
explicando "por que isto existe", não marcadores de uma palavra). Duas armadilhas tornam qualquer
grep ingênuo de `TODO`/`XXX` sem leitura manual enganoso neste código especificamente:

1. **"todo/toda" é uma palavra portuguesa comum** (every/all/whole) — "todo lead", "todo tenant",
   "roda todo dia", "todo o resto do código". Qualquer contagem que não distinga isso do marcador em
   inglês vai inflar o número real de débito por uma ordem de grandeza. 149 das 180 ocorrências
   encontradas (82,8%) são esse caso.
2. **"método" (method, em português) termina com as 4 letras "todo"** — e, nesta libc/locale, o
   acento em "é" quebra o *word boundary* do regex antes de "t", fazendo `\btodo\b` casar
   incorretamente dentro de "método". 27 ocorrências (15%) são esse artefato de regex, não têm
   nenhuma relação com a palavra TODO.

Estas duas armadilhas somadas explicam ~98% do total bruto. Isso é relevante para o próximo passo do
usuário: se a estimativa de "264 ocorrências de débito para triar" veio de uma contagem automatizada
(ex.: um linter de TODO, um script de CI, ou um grep solto), ela **superestimou o débito real por não
filtrar estas duas armadilhas**. Recomenda-se, para qualquer levantamento futuro de débito neste
repositório, uma das duas abordagens:
- restringir a busca a formas de marcador reais (`// TODO:`, `# TODO`, `/* TODO */`, `@todo`,
  `TODO(nome):`) em vez de `\bTODO\b` solto; ou
- rodar em locale que trate corretamente boundaries com acento (`LC_ALL=C.UTF-8` ou
  `grep -P '(?<![\p{L}])todo(?![\p{L}])'` com PCRE Unicode) para não confundir "método" com "todo".

Mesmo com marcadores reais restritos (`// TODO:`, `/** TODO`, etc.), o resultado neste escopo é
**zero** — nenhum comentário no formato de marcador de débito de uma linha (`// TODO: fazer X`)
existe hoje em `src/`, `tests/`, `scripts/` ou `prisma/`.

## O que não foi feito (e por quê)

- **Nenhuma remoção de comentário.** O único candidato fora de falso-positivo-puro
  (`prisma/schema.prisma:1664`) é documentação institucional válida (explica a origem da tabela
  `WhatsAppMessage`), não um comentário obsoleto — preservado pela seção 6 da constituição deste
  repositório (conteúdo/regra de negócio > remoção por estética).
- **Nenhum `npx tsc --noEmit`/`npm run lint` rodado.** Não houve alteração de código-fonte; rodar
  verificação de build/lint sem mudança correspondente não agregaria sinal.
- **Nenhum commit criado.** Sem mudança de arquivo rastreado, não há o que commitar.
- **Nenhuma priorização de débito.** Por decisão explícita do escopo (DEC-22, opção A), este
  relatório categoriza; não prioriza. Como não houve nenhum item DÉBITO REAL, a tabela de
  risco/impacto pedida no item 3 do escopo fica vazia — não há itens para classificar.
