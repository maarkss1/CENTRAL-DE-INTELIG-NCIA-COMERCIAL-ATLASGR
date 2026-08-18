# Onda 13 — Sprint 01: Segurança, Tenancy e Superfícies Administrativas

## Identificação
- Sprint: 01
- Onda: 13
- SHA de entrada: `26e29b5` (main pós-merge PR #146, Sprint 00/Onda 12)
- SHA de saída (deste relatório): `a92a0c7`
- Branch de trabalho: `claude/sprint-01-seguranca-tenancy-51974`
- Prioridade: **P0**
- Agentes: liderança **15 (Segurança Aplicada)**; sequenciais no mesmo slot **01 depois 01A**; apoio **08, 10, 14**; `server.ts`/`package.json` aprovados por **00**.

## Origem
Pacote `ATLASGR_ROADMAP_FINALIZACAO_SPRINTS` (fornecido pelo usuário), `SPRINT-01-SEGURANCA-TENANCY.md`.
7 pacotes: SEC-001 a SEC-007.

---

## SEC-001 — BullBoard: ADMIN de tenant ≠ operador de infraestrutura

**Status: RESOLVIDO.**

Estado anterior (confirmado por investigação): `/admin/queues` já exigia `authenticateToken +
requireTenant + requireRole(['ADMIN'])`, mas nenhuma segunda trava separava "ADMIN de uma
organização" de "operador de infraestrutura compartilhada" — qualquer ADMIN de qualquer tenant via
todos os jobs de todas as organizações. A fila `search-indexing` carrega `Company` completo
(telefone, e-mail, CNPJ, endereço) em `job.data`, visível no painel.

Correção: novo middleware `src/shared/middlewares/requirePlatformOperator.ts` — exige um segundo
segredo, `PLATFORM_OPERATOR_TOKEN` (env, sem default, **fail-closed** se ausente), via header
`x-platform-operator-token`, query `?operator_token=` ou cookie de conveniência (setado
automaticamente, `httpOnly`/`sameSite=strict`/`secure` em produção). Composto em `server.ts`:
`authenticateToken, requireTenant, requireRole(['ADMIN']), requirePlatformOperator`.

Risco residual **não** eliminado por esta correção, documentado explicitamente em
`docs/security/SECURITY_GUIDE.md`: um operador de plataforma que também seja ADMIN de uma
organização ainda enxerga jobs de **outras** organizações dentro do BullBoard (a ferramenta não
segmenta por tenant). Corrigir isso de verdade exigiria segmentar filas por tenant ou um adaptador
BullBoard com filtro por viewer — fora do escopo desta sprint, registrado como débito real, não
escondido.

Evidência: `tests/integration/sec001-bullboard-access.test.ts` (6 casos, sessão real do Better
Auth, RBAC real, Postgres real) — sem sessão (401), papel insuficiente (403), ADMIN sem token
(403), ADMIN com token errado (403), ADMIN com token correto (200), ADMIN de outro tenant com
token correto também passa (200, documentando o risco residual, não uma falha do teste).

## SEC-002 — Proteger `/metrics`

**Status: RESOLVIDO.** Mesmo middleware `requirePlatformOperator` (SEC-001) aplicado a `GET
/metrics` (só existe quando `EXPOSE_METRICS=true`, opt-in já existente). `/metrics` não tem
conceito de sessão de usuário — só a trava de token, pensada para configuração de scraper
Prometheus (header ou query). Testado dentro do mesmo middleware unitário
(`tests/unit/shared/middlewares/requirePlatformOperator.test.ts`, 7 casos).

Labels `tenant`/`organizationId` em métricas de custo de IA e sync Bitrix continuam presentes —
não é PII de pessoa física, identifica tenant; risco residual aceito e documentado, mitigado pela
mesma trava de token.

## SEC-003 — Comprovar revogação Bland/Bitrix antigos

**Status: RESOLVIDO — fechamento formal do bloqueador.**

Histórico: Fase Final 0 (16/08) reprovou por rotação não confirmada. `final-fase-3.md` (17/08)
registrou confirmação **informal** do dono do produto, mas nunca reabriu/reverificou formalmente o
gate (nenhum relatório posterior — `final-fase-4.md`, `onda-12.md` — tratou disso). Nesta sprint, o
dono do repositório foi consultado diretamente (`AskUserQuestion`) e **confirmou explicitamente**
que a chave Bland AI e os 2 webhooks Bitrix24 (AtlasGR + TotalTrac) já foram rotacionados.

Fechado em: `.agents/completion/01-bloqueadores.md` (itens 1 e 2), `docs/security/runbooks/
ROTATE_BLAND_AI_KEY.md` e `ROTATE_BITRIX24_WEBHOOKS.md` (seção "Status" adicionada no topo de
cada). Nenhum código foi alterado — não há como validar formato/uso dessas credenciais no código
(elas nunca são versionadas nem validadas por schema), então o fechamento é 100% baseado na
confirmação humana, exatamente como o próprio processo exige para fatos externos.

## SEC-004 — Risco de PII no histórico Git

**Status: DECISÃO REAFIRMADA (Caminho A), drift factual corrigido.**

Nenhuma ação de código nova: a decisão de manter o histórico (Caminho A, sem `git filter-repo`/BFG)
já havia sido tomada formalmente na Fase Final 0 (16/08) e continua em vigor — reafirmada nesta
sprint, não reaberta.

Achado real desta sprint: os hashes de commit citados em `.agents/completion/01-bloqueadores.md` e
`docs/security/runbooks/DECIDE_GIT_HISTORY_REWRITE.md` (`2e30b2f` para adição, `8b1bc38` para
remoção do rastreamento) **não existem neste repositório** (`git cat-file -e` falha para ambos) —
mesmo padrão de erro já encontrado uma vez antes para um terceiro hash (`543c5b0`). Reverificação
completa via `git rev-list --objects --all`/`git cat-file -s`/`git log --all`: existe exatamente
**um** dump (`backups/prospector-20260806-152827.dump`, blob `fbe6d831…`, 166075 bytes), adicionado
em duas linhas de branch paralelas (`9a9c9506` e `40dd9478`, ambos 2026-08-07), unidas no merge
`5467e2a8` (2026-08-11), desaparecendo dentro de uma resolução de merge posterior (`3731ce04`), não
por um commit `git rm` dedicado. Hashes corrigidos nos dois documentos.

**Drift residual não corrigido, por regra de processo:** `.agents/prompts/15-seguranca-aplicada.md`
linha 48 ainda cita os hashes errados (`2e30b2f`, `543c5b0`, `8b1bc38`). `.agents/prompts/**` não é
editado por nenhum agente durante execução (`AGENTS.md`: "mudança de prompt é decisão humana, fora
do ciclo de ondas") — deixado para correção humana fora desta onda.

## SEC-005 — Waiver de `npm audit` específico por advisory

**Status: RESOLVIDO.**

Dois problemas reais encontrados e corrigidos:

1. **`package.json` tinha `overrides.uuid: "^10.0.0"` conflitando com a dependência direta
   `uuid@^14.0.1`** (adicionado sem reconciliar em `41d5d98`, remediação automática do GitGuard).
   Isso fazia `npm audit`/`npm install` falharem com `EOVERRIDE` **antes** de produzir qualquer
   relatório — o `continue-on-error: true` do CI mascarava esse erro estrutural junto com o achado
   real de vulnerabilidade, então ninguém percebia que o audit nem rodava de verdade. Override
   alinhado para `^14.0.1`.
2. **O waiver documentado em `docs/security/AUDIT_WAIVERS.md` nunca teve enforcement automático**
   — `continue-on-error: true` suprimia falha do step inteiro em `ci.yml`/`cd-homolog.yml`/
   `production.yaml`, não só do advisory citado no comentário. Um HIGH/CRITICAL novo e não
   relacionado passaria despercebido com o mesmo "verde".

Correção: novo script `scripts/security/check-audit-waivers.ts` (`npm run
security:audit-waivers`) — roda `npm audit --audit-level=high --json`, atravessa a cadeia de
dependência de cada achado até o advisory real (`npm audit` representa indireta como cadeia de
nomes de pacote, só a folha tem a URL do advisory), e falha o gate para qualquer advisory
HIGH/CRITICAL fora da seção "## Waivers ativos" de `AUDIT_WAIVERS.md`. `continue-on-error: true`
removido dos 3 workflows, substituído por este script. Testado positivo (waiver cobre, passa) e
negativo (arquivo de waiver ausente, falha) manualmente contra o estado real do repositório.

## SEC-006 — Auth/session (Better Auth)

**Status: RESOLVIDO — 3 correções concretas, resto já estava sólido.**

Investigação prévia mostrou a configuração já robusta na maior parte: cookies `httpOnly`/
`sameSite`/`secure` corretos e condicionais a produção, `trustedOrigins` configurado, sessão de
7 dias com renovação a cada 24h e revogação real no logout (`deleteSession` no servidor), reset de
senha com token único de 1h e mitigação de enumeração de e-mail por timing, rate limit real em
`/api/auth` (20/15min por IP, Redis em produção). 3 gaps reais corrigidos:

1. **`revokeSessionsOnPasswordReset: true`** adicionado ao `emailAndPassword` do Better Auth
   (`src/lib/auth.ts`) — antes, resetar senha por e-mail (o cenário típico de conta comprometida)
   não invalidava sessões antigas em outros dispositivos.
2. **`ChangePasswordGate.tsx`** (fluxo de troca de senha temporária/padrão obrigatória) agora passa
   `revokeOtherSessions: true` ao `authClient.changePassword(...)`. Comportamento real do Better
   Auth (verificado lendo o código da lib, não documentação): a flag não poupa a sessão chamadora —
   apaga TODAS as sessões e emite uma nova, cujo cookie o browser aceita automaticamente. O usuário
   que troca a senha não é deslogado; qualquer sessão antiga (própria ou de terceiro que conhecesse
   a senha temporária) morre.
3. **Origem de dev hardcoded (`https://atlasgr-dev-server.loca.lt`) em `trustedOrigins`** agora só
   é adicionada fora de produção — antes valia incondicionalmente, inclusive em produção, sem
   necessidade.

Evidência: `tests/integration/sec006-session-revocation.test.ts` (contra Better Auth real — signup
real, segundo login real simulando "outro dispositivo", changePassword real, confirma sessão do
"outro dispositivo" morta e a nova sessão da troca funcionando).

## SEC-007 — RLS + erase/anonymize cross-tenant

**Status: RESOLVIDO — 3 lacunas de teste fechadas, e um bug real de produção encontrado e corrigido no processo.**

Investigação prévia mostrou RLS/tenancy já bem coberto (6 arquivos de teste de integração
dedicados, isolamento cross-tenant com ID manipulado testado em vários modelos, erase de titular
com cobertura completa e idempotência da função de erase já comprovada) — 3 lacunas reais
fechadas:

1. **`ConversationSignal`** — `tests/integration/conversation-signal-tenant-isolation.test.ts` (3
   casos: isolamento básico de leitura, ID manipulado, INSERT cross-tenant bloqueado). Achado
   registrado no teste: a policy RLS deste modelo usa `WITH CHECK (true)` (diferente de `AILog`) —
   um INSERT cross-tenant "puro" via SQL cru passaria pela policy, mas todo código de produção usa
   `prisma.create()` (sempre `INSERT ... RETURNING *`), e a policy de SELECT sobre a linha
   retornada é o que efetivamente bloqueia a escrita na prática. Documentado, não é uma brecha
   nova — é como a proteção real funciona hoje.
2. **`WhatsAppMessage`** — `tests/integration/whatsapp-message-tenant-isolation.test.ts` (2 casos:
   isolamento básico, ID manipulado).
3. **Idempotência da varredura automática de anonimização** —
   `tests/integration/auto-anonymize-sweep-idempotency.test.ts` (1 caso, cobrindo setup, 1ª rodada,
   2ª rodada e cleanup).

**Bug real de produção encontrado e corrigido ao escrever o teste #3, fora do escopo original mas
diretamente dentro do escopo do SEC-007 (RLS/LGPD):** `runAutoAnonymizeSweep()` (extraído do
processor do Worker para ser testável) fazia `prisma.lead.findMany(...)` sem nenhum
`requestContext.run(...)` próprio. O processor do BullMQ chama essa função fora de qualquer
requisição HTTP — sem `tenantId`/`bypassRls` no `AsyncLocalStorage`, a RLS de `Lead` nega toda
linha **silenciosamente** (`findMany` sempre devolvia `[]`, sem lançar erro, "sucesso" nos logs).
**Resultado real em produção: a varredura diária de anonimização de leads desqualificados há mais
de 90 dias sempre processava zero leads, todos os dias, desde sempre — nenhuma anonimização
automática por LGPD realmente acontecia.**

Corrigido com o mesmo padrão já usado por `runBitrixSyncTick`
(`src/features/integrations/bitrix/service/syncRules.ts`, precedente real já existente no repo):
`runAutoAnonymizeSweep()` agora abre `requestContext.run({ bypassRls: true }, ...)` em volta da
descoberta cross-tenant (por natureza precisa varrer leads de qualquer organização), enquanto
`eraseDataSubject` continua escopando cada anonimização ao tenant real dela
(`requestContext.run({ tenantId: organizationId })`). O teste chama `runAutoAnonymizeSweep()`
direto, sem nenhum wrapper — exatamente como o processor do BullMQ chama em produção — provando
que a correção funciona standalone, sem exigir que quem chama a função saiba que precisa embrulhar
a chamada.

Suíte completa de integração (29 arquivos) rodada 2x consecutivas após todas as adições desta onda:
`Test Files 29 passed (29)` / `Tests 127 passed (127)` em ambas — sem vazamento de estado entre os
novos testes.

---

## Gate final

Executado nesta sessão, contra Postgres 16 + pgvector + Redis nativos (sem Docker no sandbox, mesmo
setup da Sprint 00), branch `claude/sprint-01-seguranca-tenancy-51974`.

```
typecheck:            PASS — 0 erros
lint:                  PASS — 0 erros (84 warnings pré-existentes, mesmo baseline da Sprint 00)
unit:                  PASS — 162 arquivos / 1273 testes
integration:           PASS — 29 arquivos / 127 testes (Postgres real, migrations do zero)
build:                 PASS
security:audit-waivers: PASS (novo gate SEC-005, substitui continue-on-error)
```

`test:e2e` não foi re-executado localmente nesta onda (já validado PASS_WITH_NON_BLOCKING_WARNINGS
na Sprint 00 com o mesmo ambiente; nenhuma mudança desta sprint toca rota/fluxo coberto por E2E de
forma que justificasse suspeitar de regressão) — **checkpoint**: CI real do PR #148 roda a suíte
completa (`build-and-test`, `Build & Test Code`, `secret-scan`, `e2e-tests`, `quality`) e será
conferido antes do merge.

## Achados

| ID | Severidade | Dono | Status | Evidência |
|---|---|---|---|---|
| SEC-BUG-001 | **Crítico (LGPD)** | 01A | Corrigido | Worker de anonimização automática nunca executava de fato em produção (RLS negava silenciosamente) — ver SEC-007 acima. Commit `a92a0c7`. |
| SEC-001-residual | Médio, aceito | 15 | Documentado, não corrigido | ADMIN de uma organização com token de operador ainda enxerga jobs de fila de outras organizações no BullBoard — ferramenta não segmenta por tenant. `docs/security/SECURITY_GUIDE.md`. |
| SEC-004-drift | Baixo | 15 | Parcialmente corrigido | `.agents/prompts/15-seguranca-aplicada.md` ainda cita hashes de commit incorretos (`2e30b2f`/`543c5b0`/`8b1bc38`) — não corrigido por regra (`.agents/prompts/**` é edição humana, fora do ciclo de onda). |

## Decisão

### **APROVADA**

Todos os 7 pacotes (SEC-001 a SEC-007) entregues com evidência real de execução — nenhum teste
marcado como aprovado sem ter rodado. Três correções concretas de código (`requirePlatformOperator`,
`check-audit-waivers.ts`, hardening do Better Auth) mais um bug real de produção (worker LGPD
silenciosamente inerte) encontrado e corrigido durante o próprio trabalho de teste, não deixado
para depois. Dois itens residuais aceitos e documentados explicitamente (não escondidos): a
segmentação por tenant do BullBoard permanece um débito real, e um documento de prompt (fora do
escopo de edição de agente) ainda carrega hashes de commit desatualizados.

Nenhum handoff bloqueador aberto ao final desta onda.
