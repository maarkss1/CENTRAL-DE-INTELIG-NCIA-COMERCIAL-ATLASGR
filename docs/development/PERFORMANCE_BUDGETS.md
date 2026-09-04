# Budgets de performance — bundle, tamanho e latência

**Contexto:** ITEM-15 da remediação de dívida técnica ("Budgets de performance, bundle e
tamanho"). Este documento fixa os limites mensuráveis que existem hoje para impedir regressão
silenciosa de tamanho de bundle, latência de endpoints críticos e consumo, e explica a relação
com os itens vizinhos que já tocaram este espaço.

## Relação com ITEM-05 e ITEM-07

- **ITEM-05** (`scripts/ci/check-public-budget.mjs`, `.github/workflows/public-assets-budget.yml`)
  cobre o que fica em `public/` e é copiado **verbatim** para `dist/` pelo Vite — datasets,
  assets estáticos servidos sem passar pelo bundler. Ver
  `docs/development/PUBLIC_ASSETS_AND_DATASETS.md` (nessa branch/PR).
- **Este item (ITEM-15)** cobre o eixo complementar: o JS/CSS que o Vite **processa e faz
  code-split** em `dist/assets/` — o que o navegador de fato baixa e executa para carregar a
  aplicação React — mais latência de endpoints críticos do backend. Não há sobreposição de
  escopo: um script mede `public/` (cópia bruta), o outro mede `dist/assets/*.{js,css}` (saída do
  bundler).
- **ITEM-07** modularizou `server.ts` em `src/bootstrap/`. Isso não muda o comportamento medido
  aqui (os endpoints de health check e o Express seguem os mesmos), mas o workflow de latência
  (`endpoint-latency-budget.yml`) já lista `src/bootstrap/**` nos paths que disparam o gate, para
  que uma futura mudança de bootstrap do servidor seja medida.

## 1. Budget de bundle de frontend (`scripts/ci/check-bundle-budget.mjs`)

Mede `dist/assets/*.{js,css}` depois de `npm run build` (ou só `vite build`). Dois eixos, no
mesmo espírito do `check-public-budget.mjs` do ITEM-05:

1. **Total agregado (gzip)** — pega crescimento silencioso de muitas dependências pequenas ao
   longo do tempo.
2. **Por arquivo (gzip)** — pega um chunk novo e pesado (ex.: lib grande importada sem
   code-splitting).

### Baseline real (medido em 2026-08-25, build limpo de `origin/main`)

| Métrica | Valor |
|---|---|
| Arquivos em `dist/assets/` | 74 |
| Total bruto | ~4.53 MB |
| Total gzip | ~1.21 MB |
| Maior chunk "de rota" genérico (recharts/`CartesianChart`) | ~100 KB gzip |
| Chunk mais pesado do bundle | `exceljs.min-*.js`, ~268 KB gzip (lazy, só no fluxo de exportação de planilha) |

### Budgets atuais

| Limite | Valor | Override |
|---|---|---|
| Total (gzip) | 1.7 MB | `BUNDLE_BUDGET_MAX_TOTAL_GZIP_BYTES` |
| Por arquivo, genérico (gzip) | 160 KB | `BUNDLE_BUDGET_MAX_FILE_GZIP_BYTES` |

### Exceções documentadas (chunks legitimamente pesados)

Alguns chunks já excedem o teto genérico por motivo real e já isolado via `React.lazy` +
carregamento condicional (nunca entram no caminho crítico do primeiro load). Cada um tem teto
próprio em `DOCUMENTED_LARGE_CHUNKS` (`scripts/ci/check-bundle-budget.mjs`):

| Chunk | Teto (gzip) | Motivo |
|---|---|---|
| `exceljs.min-*.js` | 290 KB | Geração de planilha (`.xlsx`) real — só no fluxo de exportação (Billing/relatórios), nunca no load inicial. |
| `OnboardingTour-*.js` | 260 KB | Importa `AtlasOrb` (`@react-three/fiber`/`three`) para o widget 3D do tour de boas-vindas. `App.tsx` já isola isso com `React.lazy()` **e** um gate condicional (`showOnboardingTour`) — o import só roda quando o tour aparece de verdade. |
| `CartesianChart-*.js` | 110 KB | `recharts`, compartilhado entre várias telas de analytics/relatórios, sempre via import dinâmico por feature. |

Adicionar uma exceção nova exige justificativa escrita no próprio array (padrão já usado pelo
ITEM-05 em `public/`) — não é uma válvula de escape silenciosa.

### Gate de CI

`.github/workflows/frontend-bundle-budget.yml` roda em todo push/PR para `main` que toca
`src/**`, `index.html`, `vite.config.ts`, `package.json`/`package-lock.json` ou o próprio script:
builda o frontend e roda `npm run check:bundle-budget`. Falha o job (mas não é o required check
`build` de `ci.yml` — mesmo padrão do `public-assets-budget.yml` do ITEM-05) e publica o relatório
JSON (`bundle-budget-report.json`, com os 10 maiores chunks) como artefato de 90 dias — a
tendência fica no histórico de Actions run a run.

### Teste

`tests/unit/check-bundle-budget.test.ts` cobre a lógica pura (`evaluateBudget`): passa dentro do
budget, falha por total agregado, falha por chunk genérico não documentado, aceita chunk
documentado dentro do próprio teto, falha chunk documentado que cresceu além do próprio teto, e
garante que toda exceção tem justificativa escrita não-vazia.

## 2. Latência de endpoints críticos (`tests/load/k6-api.js` + `tests/load/k6-crm-authenticated.js`)

`docs/SRE.md` (seção 1) já documenta os SLOs de disponibilidade e latência da plataforma — este
item os transforma em algo que falha um comando/CI, em vez de ficar só em prosa.

### O que é medido hoje

| Endpoint | O que toca | Threshold (p95) | Origem do número |
|---|---|---|---|
| `GET /health/live` | Só o event loop do Node (sem I/O) | < 100ms | Endpoint síncrono e trivial — não deveria nunca chegar perto do teto transacional. |
| `GET /health/ready` | Postgres (`SELECT 1`) + Redis (`PING`, quando filas habilitadas) — ver `server.ts` | < 500ms | `docs/SRE.md` 1.2 (latência transacional, P95 < 500ms), aplicado de forma conservadora ao endpoint mais próximo de dependência externa real que pode ser exercitado sem autenticação. |
| `GET /api/leads` (pipeline, paginado/filtrado) | `authenticateToken` → `getSession()` → `requireTenant` → RLS Postgres → listagem paginada | p50<200ms / p95<500ms / p99<800ms | `docs/SRE.md` 1.2 (P95<500ms transacional) + teto de "Aviso" do mesmo documento (P95>800ms) usado como teto de p99. Onda 42, ver relatório abaixo. |
| `GET /api/companies` (busca) | Mesma cadeia de middleware + busca por `q` | p50<200ms / p95<500ms / p99<800ms | Idem. |
| `POST /api/activities` (escrita) | Mesma cadeia + `validateRequest` + INSERT | p50<200ms / p95<500ms / p99<800ms | Idem. |

`http_req_failed` tem threshold global de `rate<0.01` (falha se mais de 1% das requisições
falharem) nos dois scripts.

### Gate de CI

`.github/workflows/endpoint-latency-budget.yml`:
1. Sobe Postgres + Redis (mesmos service containers de `ci.yml`).
2. Instala dependências, gera Prisma Client, roda migrations, monta `.env.test` (com
   `API_RATE_LIMIT_MAX` elevado — ver comentário no próprio workflow: o cenário autenticado sozinho
   já gera centenas de requisições de seed da mesma máquina/IP do runner).
3. Sobe a aplicação real com `npx tsx server.ts` (mesmo processo que `tests/e2e` usa via
   `npm run start:e2e`) e espera `/health/live` responder.
4. Instala o binário oficial do k6 (versão pinada, sem Docker) e roda, em sequência,
   `k6 run tests/load/k6-api.js` e `k6 run tests/load/k6-crm-authenticated.js` contra a app local,
   exportando o resumo de cada um (`k6-latency-report.json` / `k6-crm-latency-report.json`) como
   artefatos de 90 dias.

Dispara em PR que toca `server.ts`, `src/bootstrap/**`, `tests/load/**`, as rotas/middlewares de
autenticação e RBAC, ou os módulos de CRM/Companies/Activities cobertos pelo cenário autenticado
(lista completa no próprio workflow), mais diariamente (`schedule`, 06:00 UTC) para publicar a
tendência mesmo sem PR, e sob demanda (`workflow_dispatch`). **Não é o required check `build`** do
repositório — mesma decisão de `public-assets-budget.yml` do ITEM-05: falha visível no PR, sem
arriscar quebrar o gate de release por um teste de carga instável.

### Uso local (fora do CI)

```
npx dotenv-cli -o -e .env.load-test -- npx tsx server.ts   # sobe a app real
k6 run tests/load/k6-crm-authenticated.js --env BASE_URL=http://localhost:3000
```

`.env.load-test` não é versionado (mesmo padrão de `.env.test`) — copie `.env.test.example` e
suba `API_RATE_LIMIT_MAX` bem acima do default de produção (600/15min por IP), pelo mesmo motivo
do CI acima. Ver o cabeçalho de `tests/load/k6-crm-authenticated.js` para o detalhe completo.
Alternativa via Docker: `npm run load:k6:crm` (monta o serviço `k6-crm` de
`docker-compose.opensource.yml`, precisa da app já rodando em `BASE_URL`).

### Débito anterior — resolvido na Onda 42

Até 2026-08-27 esta seção registrava como débito real que nenhuma rota autenticada tinha latência
medida sob carga (`docs/SRE.md` 1.2 cita "leitura de CRM, listagem de contatos" como exemplo real
de rota transacional, mas essas rotas exigem sessão Better Auth e não eram exercitadas por
`k6-api.js`). Isso foi corrigido com `tests/load/k6-crm-authenticated.js`: login real via
`POST /api/auth/sign-up/email` (não um bypass/mock) em `setup()`, reusado como cookie de sessão
pelo resto da carga — cobre o caminho completo `authenticateToken → getSession() → requireTenant →
requireRole → RLS do Postgres → controller/repositório`. Números medidos e ressalvas sobre o
ambiente de medição: `.agents/handoffs/onda-42/10-relatorio-latencia-p50-p95-p99.md`.

## 3. Lazy loading, code splitting, compressão — estado confirmado (não é gap)

Auditado como parte deste item, para não redigitar o que já existe:

- **Code splitting por rota já é o padrão real**: `src/App.tsx` usa `React.lazy()` para todas as
  ~35 telas/módulos do app (dashboard, CRM, prospecção, roleplay, analytics, etc.) — confirma a
  regra 11 do `CLAUDE.md` ("lazy loading por rota/tab já é o padrão").
- **`vite.config.ts`** já separa `vendor-react`, `vendor-motion`, `vendor-icons` e `vendor-dnd` em
  chunks próprios via `manualChunks`, evitando que essas libs infladas o chunk de entrada.
- **Carregamento condicional além do lazy**: `OnboardingTour` (que carrega `three.js` via
  `AtlasOrb`) é `React.lazy()` **e** só renderiza atrás de um gate de estado
  (`showOnboardingTour`) — o import só dispara quando o tour realmente aparece, não a cada load da
  app. Comentário already existente em `src/App.tsx` linhas 79-84 documenta essa decisão.
- **Compressão HTTP**: `server.ts` já registra `compression()` globalmente (`app.use(compression())`)
  — respostas são comprimidas antes de sair do processo Node.

Nenhuma mudança foi necessária nesses três pontos; documentados aqui como estado confirmado, não
como trabalho novo.

## 4. N+1 e queries lentas — auditoria superficial, débito derivado

Uma varredura heurística (loop síncrono + chamada Prisma dentro do loop) encontrou casos apenas em
`src/features/integrations/bitrix/service/{leads,deals,syncRules}.ts` — sincronização sequencial
contra a API externa do Bitrix24 (BITRIX24-LEAD-FLOW-AUDIT.md já audita essa integração
separadamente), não N+1 clássico de uma rota HTTP do próprio produto. Uma auditoria completa de
N+1 em todas as queries Prisma do CRM (rotas de listagem de contatos/empresas/leads) está fora do
escopo temporal deste item — registrado aqui como débito derivado para um item dedicado, em vez de
alterar consultas às cegas sem medição antes/depois (o que violaria o critério de aceite "otimizações
são justificadas por medição antes/depois").
