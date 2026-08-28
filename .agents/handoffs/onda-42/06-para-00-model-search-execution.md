- De: 06
- Para: 00
- Onda: 42
- Status: aguardando aplicação (schema/migration são arquivos de dono único — não editados por mim)
- Prioridade: médio

## Problema

Dossiê CPI, DEC-13 (opção A): hoje não existe um identificador de EXECUÇÃO de busca que amarre
critério de busca → resultados retornados → custo gasto, de ponta a ponta, para auditoria/replay.
`SavedSearch` (`prisma/schema.prisma`) só guarda o FILTRO salvo (para reexecutar depois via
`POST /saved-searches/:id/run`) — nenhum registro individual de "esta execução específica, neste
timestamp, com estes providers, devolveu N resultados e custou X" existe hoje. `leadsDiscovered` em
`SavedSearch` é só um contador cumulativo incrementado a cada execução; a execução em si não deixa
rastro.

Esta onda implementou o lado de aplicação inteiro (geração do Search-ID, instrumentação da cadeia
real de busca, rota de leitura, testes) já assumindo o model abaixo — só falta a migration real.

## Model proposto: `ProspectingSearchExecution`

```prisma
model ProspectingSearchExecution {
  /// Search-ID — cuid gerado em aplicação (SearchExecutionTracker, ver
  /// searchExecution.service.ts) no INÍCIO de cada execução real de busca, não pelo
  /// @default(cuid()) do Prisma — precisa existir ANTES do INSERT para propagar nos logs
  /// estruturados da execução inteira, inclusive quando ela falha antes de qualquer persistência.
  id              String       @id
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  /// Onda 40 (auditoria CPI — "funil quebra no primeiro elo, busca→lead") já ligou Lead.savedSearchId
  /// a SavedSearch; esta é a relação irmã do lado da EXECUÇÃO — quando a busca veio de
  /// `POST /saved-searches/:id/run`, não de `/discover` direto.
  savedSearchId   String?
  savedSearch     SavedSearch? @relation(fields: [savedSearchId], references: [id], onDelete: SetNull)

  /// Mesmo formato de SavedSearch.criteria — ProspectCriteria serializado (segmento, localização,
  /// quantidade, filtros de porte/faturamento/tecnologia etc.). JSON livre de propósito, igual ao
  /// campo irmão em SavedSearch.
  criteria        Json

  /// 'free' | 'hybrid' — snapshot de getProspectingProviderMode() no momento da execução (o modo
  /// pode mudar entre execuções via env, e a execução passada precisa continuar dizendo qual modo
  /// rodou de fato).
  providerMode    String

  /// Array ordenado de chamadas reais a provider dentro desta execução:
  /// [{ provider: 'apollo'|'hunter'|'google_places'|'nominatim'|'receita_federal'|'news_search',
  ///    order: number, resultCount: number, costUsd: number, status: 'ok'|'error',
  ///    errorMessage?: string }, ...]
  /// `order` reflete ordem de CONCLUSÃO (não de disparo) para chamadas paralelas — ver
  /// searchExecution.service.ts para o shape exato (`SearchExecutionProviderCall`).
  providersCalled Json

  totalResults    Int          @default(0)

  /// Custo estimado acumulado desta execução (USD), soma de providersCalled[].costUsd — reaproveita
  /// a MESMA estimativa conservadora por chamada de providerCostMetrics.ts (getCostPerCallUsd).
  /// Decimal(10,4) para não perder centavos de estimativa em execuções com muitas chamadas.
  costUsd         Decimal      @default(0) @db.Decimal(10, 4)

  /// 'success' | 'partial' | 'error' — 'partial' quando algum provider falhou mas a execução ainda
  /// devolveu >= 1 resultado; 'error' quando não devolveu nenhum (por falha de provider ou exceção
  /// não tratada). Texto livre (não enum) de propósito — mesmo padrão já usado em outros campos de
  /// status "narrativo" deste schema (ex.: CrmCommercialDocument.status).
  status          String
  errorMessage    String?

  startedAt       DateTime     @default(now())
  finishedAt      DateTime?
  /// finishedAt - startedAt em ms — redundante com os dois campos acima, mas evita todo consumidor
  /// de auditoria/replay precisar recalcular a mesma subtração.
  durationMs      Int?

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@index([organizationId, startedAt])
  @@index([savedSearchId])
}
```

Duas alterações em models já existentes (adicionar a ponta inversa da relação — sem isso `prisma
validate` rejeita o schema acima por relação sem back-reference):

```prisma
model Organization {
  // ... campos existentes ...
  prospectingSearchExecutions ProspectingSearchExecution[]
}

model SavedSearch {
  // ... campos existentes ...
  searchExecutions ProspectingSearchExecution[]
}
```

### Por que `criteria`/`providersCalled` como `Json` livre (não normalizado em colunas/tabelas filhas)

Mesma decisão já tomada em `SavedSearch.criteria` — `ProspectCriteria` (`prospecting.service.ts`)
tem >20 campos opcionais que mudam com frequência (ver comentários "Onda X" espalhados na própria
interface); normalizar em colunas exigiria migration toda vez que um campo de filtro novo
aparecesse. `providersCalled` é uma lista de eventos por execução (0-N por execução, N variável) —
uma tabela filha (`ProspectingSearchExecutionProviderCall`) seria "mais normalizada", mas para o
caso de uso real (ler o payload inteiro de uma execução por Search-ID, nunca agregar/filtrar por
provider individual entre execuções) o JSON denormalizado é a escolha mais simples que ainda
resolve o problema — mesmo raciocínio já usado para `CadenceSequence.touches` neste schema.

## Migration necessária (dono do schema deve aplicar)

**A migration da tabela nova PRECISA incluir `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL
SECURITY` + a `tenant_isolation_policy`, no MESMO padrão de toda tabela nova recente deste schema**
(ver `prisma/migrations/20260816120000_cadence_scheduling_signature/migration.sql`, tabelas
`CadenceSequence`/`CadenceRun`/`CadenceTouchAttempt`/`EmailMessage`/etc. — todas seguem o padrão
abaixo). Sem isso, a tabela fica alcançável por qualquer sessão Postgres sem
`app.current_tenant_id` setado — o mesmo bug de RLS fail-closed/aberto já documentado em outras
ondas deste repositório (ver `tests/integration/prospecting-rls.test.ts`, header do arquivo).

```sql
CREATE TABLE "ProspectingSearchExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "savedSearchId" TEXT,
    "criteria" JSONB NOT NULL,
    "providerMode" TEXT NOT NULL,
    "providersCalled" JSONB NOT NULL,
    "totalResults" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectingSearchExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProspectingSearchExecution_organizationId_startedAt_idx" ON "ProspectingSearchExecution"("organizationId", "startedAt");
CREATE INDEX "ProspectingSearchExecution_savedSearchId_idx" ON "ProspectingSearchExecution"("savedSearchId");

ALTER TABLE "ProspectingSearchExecution" ADD CONSTRAINT "ProspectingSearchExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProspectingSearchExecution" ADD CONSTRAINT "ProspectingSearchExecution_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: mesmo padrão tenant_isolation_policy de toda tabela nova deste schema (ver
-- 20260816120000_cadence_scheduling_signature/migration.sql). WITH CHECK(true) pelo mesmo motivo
-- documentado nas migrations anteriores: a defesa real contra INSERT cross-tenant é a aplicação
-- sempre gravar organizationId a partir do tenant autenticado (nunca de payload externo) — ver
-- SearchExecutionTracker.finish() em searchExecution.service.ts, que só recebe organizationId do
-- `req.user` autenticado (authenticateToken.ts), nunca do corpo da request.
ALTER TABLE "ProspectingSearchExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectingSearchExecution" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "ProspectingSearchExecution" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
```

Depois de aplicar (schema + migration + `prisma generate`), um passo de limpeza no código de
aplicação (não requer nova migration, só edição de TS):

1. Em `src/features/prospecting/services/searchExecution.service.ts`: apagar
   `ProspectingSearchExecutionRecord`/`ProspectingSearchExecutionCreateData`/
   `ProspectingSearchExecutionDelegate`/`searchExecutionDelegate()` (o comentário "IMPORTANTE" no
   topo do arquivo marca exatamente o que remover) e trocar toda chamada por
   `prisma.prospectingSearchExecution` direto (tipos gerados pela Prisma Client real).
2. Rodar `npm run test:unit` de novo — os testes de `searchExecution.service.test.ts` e
   `prospecting.service.searchExecution.test.ts` continuam válidos (mockam `prisma.
   prospectingSearchExecution` do mesmo jeito que já mockam `prisma.company`/`prisma.lead` hoje),
   sem precisar reescrever nada neles.
3. Escrever um teste de integração real contra Postgres (`tests/integration/
   prospecting-search-execution-rls.test.ts`), no mesmo padrão de
   `tests/integration/prospecting-rls.test.ts` (dois tenants dedicados, `asTenant`/`asBypass`,
   confirma que uma execução de um tenant nunca aparece em `findSearchExecution` de outro tenant, e
   que a policy de RLS bloqueia leitura sem `app.current_tenant_id`/`app.bypass_rls` setados). Não
   escrevi esse teste nesta onda porque a tabela ainda não existe em nenhum banco real — rodá-lo
   hoje quebraria `test:integration` (`relation "ProspectingSearchExecution" does not exist"`).

## Arquivos já escritos nesta onda (assumindo o model acima)

- `src/features/prospecting/services/searchExecution.service.ts` (novo) — `SearchExecutionTracker`
  (gera o Search-ID, acumula chamadas de provider + custo, persiste ao final) e
  `findSearchExecution` (leitura escopada por tenant). Cast controlado documentado no topo do
  arquivo — ver seção "Depois de aplicar" acima.
- `src/features/prospecting/services/prospecting.service.ts` — `discoverCandidates` agora gera o
  Search-ID no início, instrumenta Apollo/Google Places/Nominatim (fase de descoberta) e
  Apollo/Hunter/Receita Federal/busca de notícias (fase de enriquecimento, via
  `enrichCandidatesWithQualityData(candidates, tracker)`), persiste o registro final em
  sucesso/erro (`try/catch` + `tracker.finish()`), e devolve `searchId` em `DiscoverResult`.
  Assinatura ganhou um terceiro parâmetro opcional `savedSearchId`.
- `src/features/prospecting/routes/prospecting.routes.ts` — `POST /saved-searches/:id/run` agora
  passa o `id` da busca salva como `savedSearchId` e devolve `searchId` no payload; nova rota
  `GET /searches/:searchId` (escopada por tenant via `findSearchExecution`).
- `package.json` — nova dependência direta `@paralleldrive/cuid2` (já era transitiva via
  `formidable`, mesma versão `2.3.1` já resolvida no lockfile) para gerar o Search-ID em código de
  aplicação, já que o Prisma não expõe seu gerador interno de `cuid()` fora de um `@default()` de
  schema.
- Testes: `tests/unit/features/prospecting/services/searchExecution.service.test.ts` e
  `tests/unit/features/prospecting/services/prospecting.service.searchExecution.test.ts`.

## Escopo consciente que ficou de fora (não é lacuna descoberta depois, é decisão desta rodada)

- Chamadas Apollo/Hunter que acontecem DENTRO de `fetchApolloCandidates`
  (`apollo/organizationSearch.ts` pré-busca decisores via `enrichCandidatesWithDecisionMakers`
  durante a própria busca de organizações) não são individualmente contadas no `providersCalled`
  desta execução — só a chamada de Organization Search em si é. Instrumentar esse nível exigiria
  passar o tracker através de `apollo/organizationSearch.ts` → `apollo/people.ts` →
  `hunter.service.ts`, tocando os mesmos pontos onde `recordProviderCallCost` (métrica Prometheus
  global) já roda hoje — maior superfície de mudança em código de rede real e testado, para um
  ganho de precisão que não muda a resposta às perguntas de auditoria que motivaram o DEC-13
  ("que critério gerou este resultado, quanto custou aproximadamente, quando rodou"). Documentado
  aqui para não ser "descoberto" de novo como lacuna nova numa auditoria futura.
- `costUsd` continua sendo a MESMA estimativa conservadora de `providerCostMetrics.ts` (não um
  valor de fatura real) — herda a ressalva já documentada lá.
