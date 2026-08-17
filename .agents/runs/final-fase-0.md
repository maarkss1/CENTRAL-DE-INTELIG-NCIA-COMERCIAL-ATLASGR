# Fase Final 0 — Segurança e Governança

- Data: 2026-08-16
- Executor: Agente 00 (Coordenador)
- Branch: `claude/security-governance-phase-final-dfdpvk`
- SHA de entrada: `0d55a99bb9f8463c27553c7807281ab611bd9e8b` ("Governança: agentes 19/20 e seis fases
  finais (#137)")
- SHA de saída: ver commit desta entrega nesta mesma branch (só alterações documentais/handoff —
  nenhum código de produto mudou nesta fase).

## 0. Leitura obrigatória, feita antes de qualquer ação

`/AGENTS.md` inteiro; `.agents/prompts/00-coordenador.md`; inventário de `.agents/prompts/`
(confirmado: 21 arquivos numerados `00`–`20` + `01A` + `06A` = 23 perfis, batendo com o roster
declarado em `/AGENTS.md`); prompts `15`, `18`, `19`, `20` (os ativos desta fase); todos os handoffs
em `.agents/handoffs/**` (14 diretórios de onda, ~60 arquivos); `.agents/completion/**`
(`00-inventario.md`, `01-bloqueadores.md`, `02-mapa-plataforma.md`, `03-ondas-de-finalizacao.md`,
`04-prompt-criacao-agentes.md`, `FINAL-REPORT-onda-1.md`); `.agents/runs/**` (`baseline.md` até
`onda-10.md`, `optout-unificado.md`). Working tree limpo na entrada (`git status` sem alterações
pendentes).

## 1. Roster — confirmado

23 perfis de prompt existem em `.agents/prompts/`, batendo exatamente com `/AGENTS.md`: `00`–`20`
numerados, mais `01A` (mesmo slot que `01`) e `06A` (mesmo slot que `06`). Nenhum par roda
simultaneamente por definição — não verificado em execução nesta fase porque nenhum dos dois pares
foi acionado (01/01A não teve trabalho de schema nesta fase; 06/06A não teve trabalho de Bitrix).
Nenhum prompt existente foi removido ou tem sobreposição de domínio não resolvida — os
`.agents/prompts/*.md` seguem descrevendo domínios disjuntos e a propriedade exclusiva de arquivos
de `/AGENTS.md` continua consistente com os escopos declarados em cada prompt.

## 2. Reconciliação documental e de handoffs

Auditados todos os handoffs `Status: aberto` (27 arquivos) e todos endereçados a `00` (5 arquivos).

**Resolvidos nesta fase** (edição permitida: só o campo `Status` + seção `## Resolução`, corpo
original preservado):
- `.agents/handoffs/onda-8/18-para-00-relatorio-conformidade-handoffs.md` — o achado mais
  importante (handoff com `Prioridade: crítico`, fora do vocabulário padrão, que uma varredura
  automática por `Prioridade: bloqueador` não pegaria) foi reverificado: já está `Status: resolvido`
  desde a Onda 9 (correção real em `src/lib/async-context.ts`, `TenantAwareAsyncLocalStorage`), não
  era um bloqueador escondido no momento desta verificação. Os outros 4 handoffs fora do protocolo
  citados têm `Status`/`Prioridade` válidos, só usam cabeçalhos de seção alternativos — não
  escondem bloqueador.
- `.agents/handoffs/onda-8/18-para-00-varredura-duplicacao-contratos.md` — 6 duplicações de tipo
  menores, nenhuma é bug ativo hoje e nenhuma é achado de segurança/governança. Marcado
  `em-andamento`, priorização registrada, distribuição aos donos (04/02/07/13) deferida para Fase
  Final 1 ou onda de manutenção de contratos — não é P0/P1 desta fase.

**Handoff `bloqueador` aberto, fora do escopo desta fase — não resolvido, documentado
explicitamente:**
`.agents/handoffs/onda-8/09-para-08-10-dominio-producao-e-verificacao-deep-link.md`
(`Prioridade: bloqueador`, `Status: aberto`). O app mobile já é funcional hoje (aponta para o
fallback `prospector-atlas.onrender.com`); o bloqueador real é `app.atlasgr.com.br` ainda não
resolver DNS — dependência de infraestrutura (Cloudflare) fora de qualquer repositório, e Android
App Link/iOS Universal Link verificados são trabalho de Fase Final 5 (Go-Live), não de segurança e
governança. **Decisão do Coordenador:** este item não bloqueia a Fase Final 0 — é
matéria de Fase Final 5 — mas segue registrado aqui para não se perder, e a Fase Final 5 não pode
fechar com ele ainda aberto.

**Correção factual encontrada e aplicada** (achado real desta fase, não relatório antigo aceito sem
prova): três documentos (`docs/security/runbooks/DECIDE_GIT_HISTORY_REWRITE.md`,
`.agents/completion/01-bloqueadores.md`, `.agents/prompts/15-seguranca-aplicada.md`) citavam três
commits com o dump exposto — `2e30b2f`, `543c5b0`, `8b1bc38`. Reverificado com
`git log --all --diff-filter=AMD -- '*.dump'` e `git rev-list --objects --all | grep '\.dump'` contra
o SHA de entrada: **existe exatamente um dump em todo o histórico**
(`backups/prospector-20260806-152827.dump`, blob `fbe6d831…`), adicionado em `2e30b2f` e removido do
rastreamento (não do histórico) em `8b1bc38`. `543c5b0` **não existe neste repositório**
(`git cat-file -e 543c5b0` → "Not a valid object name") — erro de transcrição carregado de onda em
onda sem reverificação. Corrigido em `DECIDE_GIT_HISTORY_REWRITE.md` e `01-bloqueadores.md` (ambos
dentro do escopo do Coordenador para esta fase); `.agents/prompts/15-seguranca-aplicada.md` **não**
foi editado — é `.agents/prompts/**`, mudança exclusiva de decisão humana por `/AGENTS.md`, registrado
aqui para quem revisar o prompt depois.

## 3. P0 de segredo/PII no código atual

Nenhum P0 novo encontrado. Reconfirmados remediados no working tree (item 1–6 de
`.agents/completion/01-bloqueadores.md`): chave Bland AI, telefones reais, tokens Bitrix, herança de
credencial cross-org, reset de senha em massa, segredo hardcoded no webhook voice-result — todos sem
achado de regressão nesta verificação.

Superfícies expostas revisadas contra o código atual (não contra relatório antigo):
- Os 4 webhooks montados antes de `express.json` (`birth-voice`, `voiceResult`, `bitrix`, `3cx`) —
  confirmado por leitura de código que os 3 primeiros usam `timingSafeEqual` (via
  `birthVoice.helpers.ts`) e o 3CX reutiliza a mesma função (`isValidSignature`); todos falham
  fechado (503/401) quando a env do segredo está ausente.
- `/admin/queues` — `authenticateToken` + `requireTenant` + `requireRole(['ADMIN'])` confirmados em
  `server.ts:369`. Risco residual já documentado (ADMIN de uma org vê jobs de outra) não é novo, não
  reaberto nesta fase.
- `/metrics` — confirmado em `server.ts:282-292`: só monta sob `EXPOSE_METRICS=true`, sem
  autenticação adicional quando ligado. Débito conhecido e já documentado (mitigação: manter a flag
  desligada ou proteger por rede) — não é regressão, não é P0 novo.
- `/api-docs` — só monta fora de produção ou sob `EXPOSE_API_DOCS=true` explícito.

## 4. Ações externas obrigatórias — decisão humana coletada nesta fase

Três checkpoints humanos, cada um só podendo ser respondido pelo dono do repositório (nenhum agente
tem acesso a portal da Bland AI, ao admin do Bitrix24, ou autoridade para autorizar reescrita de
histórico):

| # | Ação | Resposta do dono do repositório | Estado |
|---|---|---|---|
| 1 | Rotacionar chave Bland AI | **Ainda não feito** | 🔴 Bloqueador aberto |
| 2 | Rotacionar os 2 webhooks Bitrix24 (AtlasGR + TotalTrac) | **Ainda não feito** | 🔴 Bloqueador aberto |
| 3 | Decisão sobre reescrever histórico do git (dump de PII) | **Caminho A** — manter histórico, mitigar daqui pra frente, sem force-push | ✅ Decidido |

Runbooks executáveis já existem para os 3 itens (`docs/security/runbooks/ROTATE_BLAND_AI_KEY.md`,
`ROTATE_BITRIX24_WEBHOOKS.md`, `DECIDE_GIT_HISTORY_REWRITE.md`) — cada um com passo de verificação
que prova a credencial antiga invalidada, não só a nova funcionando. Item 3 foi executado (verificação
de pré-requisito do Caminho A, ver runbook): `backups/*.dump` está no `.gitignore`, nenhum `.dump`
está rastreado no working tree atual. Itens 1 e 2 seguem **abertos**, dependem de ação humana em
portal de terceiro que nenhum agente pode executar.

## 5. Varredura de segredo — CI e local

- **CI:** job `secret-scan` em `.github/workflows/ci.yml` usa `gitleaks/gitleaks-action@v2`, sem
  `continue-on-error`, portanto bloqueia PR/push em achado real. `.gitleaks.toml` estende as regras
  default e só adiciona um allowlist específico (regex exata) para um JWT **sintético** de fixture de
  teste (`bugReport.sanitize.test.ts`) — não amplia para segredo real.
- **Local:** `scripts/security/scan-secrets.sh` executado nesta fase (`gitleaks` binário/docker
  indisponíveis neste sandbox — confirmado, não assumido; script cai no fallback embutido
  documentado). Achados: só senhas de fixture de teste/CI já conhecidas e documentadas como não-
  segredo (`prospector_test_pass`, `ci_app_test_pass`, `E2eTestPassword123!`, etc. em
  `docker-compose.yml`, `.github/workflows/*.yml`, `tests/**`) e o mesmo JWT sintético do allowlist
  do CI. `exit 1` esperado (o script é propositalmente mais amplo que o gitleaks real). Nenhum
  segredo real encontrado.

## 6. Baseline verificado pelo Agente 19 — gate completo, executado de verdade

Ambiente de partida: `node_modules` ausente (`npm ci` executado), Docker instalado mas **sem daemon
disponível** (`docker info` falha) — confirmado por erro real antes de qualquer suposição. Em vez de
aceitar `BLOCKED` para integration/E2E/security:trivy/zap só por isso, provisionei Postgres 16 +
pgvector + Redis **nativos** (sem Docker) neste sandbox, replicando exatamente o bootstrap que
`scripts/db/create-app-role.sql` faz (papel `prospector_app` NOSUPERUSER, extensão `vector`,
ownership transferido para que `FORCE ROW LEVEL SECURITY` valha) — para rodar o gate real, não uma
versão degradada dele.

```text
AGENTE 19 — VERIFICAÇÃO CONTÍNUA
ESTADO VERIFICADO: claude/security-governance-phase-final-dfdpvk @ 0d55a99 (+ alterações documentais desta fase)
TYPECHECK:        PASS  (npx tsc --noEmit — 0 erros)
LINT:              PASS  (0 erros, 73 warnings pré-existentes — jsx-a11y/no-explicit-any, nenhum novo)
UNIT:              PASS  (158 arquivos / 1220 testes)
INTEGRATION:       PASS  (24 arquivos / 114 testes — rodado contra Postgres real, provisionado nativamente neste sandbox, migrations aplicadas do zero: 46/46 OK)
E2E:               PASS_WITH_NON_BLOCKING_WARNINGS (50 testes: 45 passed, 5 skipped — os 5 são só `tests/e2e/visual.spec.ts` (`test.describe.skip`), débito conhecido e já rastreado por `.agents/handoffs/onda-6/14-para-08-baselines-visuais-linux.md`, Status em-andamento/normal, não crítico/bloqueador)
BUILD:             PASS  (vite build + esbuild server.ts, sem erro)
SECURITY/SECRETS:  PASS  (CI gitleaks obrigatório sem continue-on-error; scan local sem achado real — ver §5)
INTEGRATIONS:      BLOCKED — N/A JUSTIFICADO (verify:integrations exige credenciais reais de integração externa não disponíveis neste sandbox; erro real de validação de env mostrado, não assumido)
AI:                BLOCKED — N/A JUSTIFICADO (verify:ai mesma causa acima)
NPM AUDIT (high):  PASS  (0 high/critical; 2 moderate pré-existentes e já documentadas — uuid via exceljs, dev-only via dockerode/testcontainers)
TRIVY/ZAP:         BLOCKED — N/A JUSTIFICADO (exigem Docker daemon, indisponível neste sandbox — mesma limitação já documentada na Onda 6 por outro agente, reconfirmada agora com erro real, não herdada sem prova)
SKIPS/FLAKES BLOQUEADORES: 0
VEREDITO: PASS_WITH_NON_BLOCKING_WARNINGS
PODE INTEGRAR: SIM
```

Nenhum script obrigatório foi tratado como sucesso silencioso: todo `BLOCKED` acima tem a saída de
erro real coletada antes de ser classificado (não "deve passar", não suposição). `verify:prod` e
`setup:db:check` também tentados e mesma causa (env de produção/Docker ausente neste sandbox).

## 7. Agente 20 — smoke real do "Reportar um problema"

Servidor real (`npm run start:e2e`, Express completo, auth Better Auth, Prisma/RLS) subido contra o
Postgres/Redis provisionados nesta fase. Fluxo dirigido via Chromium real (Playwright,
`/opt/pw-browsers/chromium`), não simulado:

1. Cadastro real via formulário de signup (`/login` → "Registrar Novo Acesso") — sessão autenticada
   criada de verdade.
2. Clique no botão global "Reportar um problema".
3. Preenchimento do formulário com um **segredo sintético deliberado** na descrição
   (`token sk-abcdefghijklmnopqrstuvwx1234`), para provar sanitização em produção real do fluxo, não
   só em teste unitário isolado.
4. Envio — `POST /api/bug-reports` retornou `201`, corpo `{"success":true,"data":{"id":"...",
   "status":"OPEN"}}`.
5. Toast de sucesso "Relato enviado. Obrigado por avisar!" confirmado na UI — não é sucesso
   silencioso nem promessa sem confirmação.
6. **Verificação direta no banco** (não confiando só na resposta HTTP): registro `BugReport`
   persistido com:
   - `title`/`description` sanitizados — o segredo sintético virou `[REDACTED_KEY]` na descrição
     persistida, confirmando que `bugReport.sanitize.ts` redige em produção real, não só no teste
     unitário que já passava;
   - `context` completo e automático: `url`, `route`, `brand` (`atlasgr`), `userAgent`, `viewport`
     (`1280x720`), `capturedAt`, `recentLogs` (`[]` — sem warning/erro de console nesta sessão) — os
     campos exigidos por `/AGENTS.md` (URL, rota, marca, user agent, viewport, logs recentes)
     confirmados anexados de verdade, sanitizados, não como promessa de código lido.

```text
AGENTE 20 — SMOKE DIRIGIDO (Reportar um problema)
JORNADA: signup → abrir reporter → preencher (com segredo sintético) → enviar → confirmar persistência sanitizada
RESULTADO: PASS
BUGS ENCONTRADOS: 0
VEREDITO UX: PASS
```

Full sweep completo da Fase Final 4 **não** foi executado aqui — fora do escopo da Fase Final 0, que
só exige o smoke do reporter.

## 8. P0/P1 — estado final desta fase

**P0 de código:** 0 (nenhum encontrado ou reaberto).

**P0/bloqueadores externos, fora do alcance de qualquer agente:**
1. Chave Bland AI não rotacionada — 🔴 aberto.
2. Webhooks Bitrix24 (AtlasGR + TotalTrac) não rotacionados — 🔴 aberto.

**P1:**
- Nenhum P1 novo de código. Débitos pré-existentes e já documentados (4→2 vulnerabilidades moderate
  do npm audit — na prática 2 hoje, a 2ª classificação de `01-bloqueadores.md` estava desatualizada
  em contagem, não em substância; skip de baseline visual Linux; `/metrics` sem auth adicional sob
  flag opt-in; risco residual de `/admin/queues` cross-org) permanecem os mesmos, não pioraram, e já
  têm dono/handoff.

**Handoff `bloqueador` aberto:** 1 (`onda-8/09-para-08-10-dominio-producao-e-verificacao-deep-link.md`),
fora do escopo da Fase Final 0 por conteúdo (domínio de produção mobile/DNS, matéria de Fase Final 5)
— não impede este veredito, mas impede o fechamento da Fase Final 5 enquanto seguir aberto.

## 9. Decisão da Fase Final 0

**REPROVADA.**

Todo requisito técnico do gate de saída foi atendido: P0 de código = 0; secret scan PASS (CI e
local); Agente 19 = PASS_WITH_NON_BLOCKING_WARNINGS com gate completo executado de verdade (incluindo
integration e E2E reais, não apenas os que rodam sem infraestrutura); Agente 20 confirmou o
"Reportar um problema" funcional com prova de persistência sanitizada; a decisão sobre o histórico do
git foi coletada do dono do repositório e está executada (Caminho A, pré-requisitos verificados).

O único bloqueador restante é exatamente o que `/AGENTS.md` e o prompt mestre desta fase definem como
não-negociável: **"credenciais previamente expostas estiverem rotacionadas/revogadas e verificadas"**.
A chave da Bland AI e os 2 webhooks Bitrix24 seguem sem rotação confirmada pelo próprio dono do
repositório nesta fase — enquanto isso não acontecer, qualquer credencial recuperável no histórico
público do git continua potencialmente válida, e nenhuma quantidade de correção de código fecha essa
exposição.

**Bloqueador exato para reabrir e aprovar esta fase:**
1. Rotacionar a chave Bland AI no portal (runbook: `docs/security/runbooks/ROTATE_BLAND_AI_KEY.md`) e
   confirmar que a antiga não funciona mais.
2. Rotacionar os 2 webhooks Bitrix24 — AtlasGR e TotalTrac — (runbook:
   `docs/security/runbooks/ROTATE_BITRIX24_WEBHOOKS.md`) e confirmar que as URLs antigas não
   respondem mais.

Depois de concluídos, rodar o Agente 19 novamente sobre o estado exato (gate completo, não só os
scripts de verificação de integração) e reabrir esta fase para `APROVADA`. Nenhuma outra ação de
código é necessária para esse fechamento.
