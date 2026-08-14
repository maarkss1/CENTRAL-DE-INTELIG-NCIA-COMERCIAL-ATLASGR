# Onda 5 — Rodada de remediação pontual (pós Onda 4)

- Data: 2026-08-14
- Branch de integração: `integracao/onda-5`, criada a partir de `main` (commit `7a44ad0a`)
- Executor: Coordenador (00), via Agent tool com isolamento de worktree

## Contexto

Depois da Onda 4 (infraestrutura + marca institucional), restavam vários handoffs técnicos abertos
de ondas anteriores (1, 2, 2.5, 4), todos prioridade `alto`/`normal` (nenhum `bloqueador`). Esta não
é uma onda do plano oficial (`EXECUCAO-ONDAS.md` define só 0-4) — é uma rodada de remediação pontual
para fechar dívida técnica real acumulada, seguindo o mesmo protocolo de isolamento por
worktree/branch e revisão de escopo.

Antes de disparar os especialistas, fechei 5 handoffs que já estavam resolvidos em código mas nunca
tinham sido marcados: AILog RLS (**depois reaberto, ver seção "Achado da integração" abaixo — esse
fechamento foi um erro meu**), histórico de automação, wrapper de WhatsApp da prospecção, e os dois
achados duplicados do Agente 10 (tsc/lint) já corrigidos na Onda 4.

Ficaram deliberadamente fora do escopo desta rodada:
- Refatoração de Clean Architecture para `billing`/`crm360`/`intelligence agents` (débito
  arquitetural grande, prioridade normal — não cabe numa rodada pontual).
- Schema `BitrixExtractionRun` (módulo Extrações Bitrix) — depende de decisão de retenção de dado
  pessoal (quantos dias) que só o usuário pode tomar; não gerado.
- `01-para-04-role-gates-crm.md` — nota informativa do Agente 01 sobre limiares de RBAC já
  aplicados, sem ação obrigatória; deixado para quando o Agente 04 mexer nesses arquivos de novo.

## Especialistas executados

Quatro especialistas, respeitando o limite de 3 simultâneos (01/06/07 em paralelo; 08 entrou assim
que 06 terminou), cada um em worktree isolado a partir de `integracao/onda-5`:

| Agente | Branch | Item(ns) resolvido(s) |
|---|---|---|
| 01 — Plataforma/Dados | `worktree-agent-ad652b9145e66fc10` | Persistência real de conexões 3CX (schema+migração+troca de `Map`→Prisma); confirmação de que `BitrixSyncRule.lastError` já existia; métricas HTTP via OTel (parcial — ver riscos) |
| 06 — Integrações/Bitrix | `worktree-agent-a21f807a5af2d9bae` | Counter Prometheus `bitrix_sync_failures_total` |
| 07 — IA/Automações | `worktree-agent-ad261e8e833c3f930` | Métricas Prometheus de fila BullMQ (`bullmq_queue_*`) e custo/orçamento de IA (`ai_usage_cost_usd_total`, `ai_usage_budget_usd_total`) |
| 08 — QA/Release | `worktree-agent-a6d009098fcbf11e8` | GitHub Actions pinadas por SHA completo (incl. `production.yaml`, fora da lista original); CLI do prisma restaurada na imagem de produção (build Docker real validado); handoff antigo de Dockerfile confirmado stale |

Todas as branches revisadas (`git diff main...<branch> --stat`) antes do merge: nenhum arquivo fora
da propriedade de cada agente foi tocado, exceto as 2 exceções mecânicas pré-autorizadas do Agente
01 em `threecx.service.ts`/`package.json` (documentadas no prompt do agente).

## Conflito de merge

`src/lib/queue/bitrixSync.worker.ts` foi tocado tanto pelo Agente 06 (contador de falha) quanto pelo
Agente 07 (métricas de fila) — os dois trechos eram aditivos e não conflitantes em lógica, só a
linha de import colidiu. Resolvido manualmente pelo Coordenador combinando os dois imports; nenhuma
lógica de nenhum dos dois agentes foi descartada.

## Achado da integração — correção de registro (AILog RLS)

Ao rodar o gate completo na branch de integração, `tests/integration/ailog-rls.test.ts` falhou em
2 dos 5 testes (`DriverAdapterError: new row violates row-level security policy for table "AILog"`).
Eu tinha marcado esse handoff (`onda-2/00-para-01-ailog-rls-violation.md`) como resolvido durante a
integração da Onda 4 só por confirmar que a migration e o teste existiam no código — **sem rodar o
teste de fato**. Rodei agora, e confirmei via checkout limpo de `main` (sem nenhuma mudança desta
sessão) que a falha é pré-existente, não uma regressão desta rodada. Reabri o handoff com o
diagnóstico real (ver `## Reabertura` no próprio arquivo) e hipóteses não confirmadas de causa raiz
(possível vazamento de `SET` entre conexões pooled em vez de `SET LOCAL` escopado à transação).
Prioridade `alto`, não `bloqueador` — não impede a aprovação desta rodada, mas fica como pendência
real para a próxima.

## Testes (rodados na branch de integração, após merge dos quatro agentes)

| Gate | Resultado |
|---|---|
| `npx prisma validate` / `generate` | ✅ PASSOU |
| `npx tsc --noEmit` | ✅ PASSOU — 0 erros |
| `npm run lint` | ✅ PASSOU — 0 erros, 101 warnings (mesmo débito pré-existente, nenhum novo) |
| `npm run build` | ✅ PASSOU |
| `npm run test:unit` | ✅ PASSOU — 109 arquivos, 706 testes, 0 falhas |
| `npm run test:integration` | ⚠️ 12/13 arquivos, 46/48 testes — falha isolada em `ailog-rls.test.ts` (2 testes), confirmada pré-existente em `main`, não regressão |
| `npm run verify:integrations` | ⚠️ 1 falha (`googlePlaces` — "nenhum resultado; confira ativação, faturamento e restrições da chave"), ambiental/credencial externa, não código; 7 integrações opcionais não configuradas (esperado neste ambiente) |
| `npm run verify:ai` | Não aplicável — nenhum provider de IA configurado neste ambiente local |

Varredura manual de segredo sobre o diff acumulado — nenhum achado.

## Handoffs (abertos e resolvidos nesta rodada)
- Resolvidos: `06-para-01-persistencia-3cx.md`, `06-para-01-schema-extracoes-bitrix.md`,
  `10-para-01-metricas-http-otel.md` (01); `10-para-06-metricas-sync-bitrix.md`,
  `01-para-06-role-gates-integracoes.md` (06); `10-para-07-metricas-fila-orcamento-ia.md` (07);
  `00-para-08-pin-github-actions-sha.md`, `10-para-08-prisma-cli-imagem-producao.md`,
  `onda-E/10-para-08-refatorar-dockerfile.md` (08).
- Reaberto (correção de registro): `onda-2/00-para-01-ailog-rls-violation.md`.
- Criado, ainda aberto: `onda-5/01-para-06-persistencia-3cx-implementada.md` (normal — aviso para 06
  revisar a troca de storage), e o próprio `10-para-01-metricas-http-otel.md` foi deixado
  `em-andamento` pelo Agente 01 (métrica HTTP específica do OTel auto-instrumentation não apareceu
  mesmo com o exporter ligado — diagnóstico registrado no handoff para quem continuar).
- Ainda abertos, não bloqueadores, fora do escopo desta rodada: `00-para-01-legacy-services-repo-migration.md`
  (normal, refactor grande), `06-para-01-schema-extracoes-bitrix-historico.md` (normal, aguardando
  decisão de retenção do usuário), `01-para-04-role-gates-crm.md` (normal, informativo).
- Nenhum handoff `Prioridade: bloqueador` permanece `Status: aberto`.

## Riscos restantes
- **AILog RLS ainda quebrado** (ver seção acima) — custo/uso de IA continua não sendo registrado de
  forma confiável em cenários sem tenant ativo/entre conexões pooled. Recomendo priorizar numa
  próxima rodada.
- Métrica HTTP `http_server_duration_milliseconds_*` do OTel auto-instrumentation não confirmada
  funcionando (`HighErrorRate5xx` do Agente 10 continua `unknown` no Prometheus).
- `googlePlaces` falhando neste ambiente por credencial/faturamento — verificar fora do código.
- Persistência 3CX: migração foi escrita à mão (não via `prisma migrate dev`) por um problema de
  ambiente no shadow database — aplicada e validada com sucesso contra Postgres real, mas vale
  confirmar consistência num pipeline de CI limpo antes de considerar 100% equivalente ao fluxo
  normal de geração de migração.

## Decisão da Onda 5
**APROVADA na branch de integração**, com ressalvas documentadas (AILog RLS pré-existente,
`googlePlaces` ambiental). Todos os gates obrigatórios que fazem sentido neste ambiente passaram.
Nenhum handoff bloqueador aberto. Nenhum segredo exposto.

**Ainda não mesclada em `main`** — aguardando revisão e aprovação explícita do usuário.
