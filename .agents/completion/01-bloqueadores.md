# Bloqueadores — status de remediação

- Fonte: inventário Onda Zero (5 agentes) + baseline executável.
- Branch de trabalho: `fable/finalizacao-plataforma`.
- Última atualização: 2026-08-18 (Sprint 01/Onda 13 — SEC-003/SEC-004: rotação Bland/Bitrix
  fechada, hashes de commit do dump corrigidos).

## P0 — Segredos e PII versionados (TODOS remediados no working tree)

| # | Achado | Ação | Status |
|---|---|---|---|
| 1 | Chave real da Bland AI em `scripts/call_bland_juliana.py` (fallback de env) | Script removido | ✅ commit `40a99c31` |
| 2 | Telefone pessoal real (titular "Juliana"/"Rodrigo") em 7 scripts | 6 scripts one-off removidos; mock sanitizado | ✅ commit `40a99c31` |
| 3 | Tokens reais de webhook Bitrix24 (AtlasGR + TotalTrac) em `connections.ts`, `useBitrixIntegration.ts`, `public/tools/extrator-bitrix.html` (servido publicamente!) e `extrator_bitrix (1).html` | Fallbacks removidos (env-only), input vazio, HTML sanitizado, cópia solta apagada | ✅ commit `40a99c31` |
| 4 | Org nova herdava credencial Bitrix da AtlasGR (cross-tenant) | Autoconnect exige env + nome de marca conhecida | ✅ commit `40a99c31` |
| 5 | `reset-passwords.ts` sem argumento resetava TODAS as senhas p/ `00000000` | Alvo explícito obrigatório (`email` ou `--all`) | ✅ commit `40a99c31` |
| 6 | Segredo default hardcoded no webhook voice-result (`server.ts`) | Fail-closed (503 sem env), tempo constante | ✅ commit `55bde4c` |

**⚠️ AÇÃO EXTERNA (fora do alcance do código):**
1. **Chave Bland AI** (dispara ligações pagas) — estava versionada com remote no GitHub.
   Reprovado na Fase Final 0 (2026-08-16) por rotação não confirmada; `final-fase-3.md` (17/08)
   registrou uma confirmação informal do dono do produto, mas a reabertura formal do gate nunca
   aconteceu (nenhum relatório posterior — `final-fase-4.md`, `onda-12.md` — reverificou o item).
   **Fechado formalmente na Sprint 01/Onda 13 (2026-08-18, SEC-003):** dono do repositório
   confirmou diretamente nesta sessão que a chave já foi rotacionada. ✅ Runbook usado:
   `docs/security/runbooks/ROTATE_BLAND_AI_KEY.md`.
2. **2 webhooks Bitrix24** (AtlasGR `/rest/450/…` e TotalTrac `/rest/2486/…`) — a URL é a
   credencial. Mesmo histórico do item 1 (reprovado 16/08, confirmação informal 17/08 nunca
   formalizada). **Fechado formalmente na Sprint 01/Onda 13 (2026-08-18, SEC-003):** dono do
   repositório confirmou diretamente nesta sessão que os dois webhooks já foram rotacionados.
   ✅ Runbook usado: `docs/security/runbooks/ROTATE_BITRIX24_WEBHOOKS.md`.
3. **Dump `backups/prospector-*.dump` segue recuperável no HISTÓRICO git.** **Correção de fato
   (Sprint 01/Onda 13, SEC-004):** os hashes `2e30b2f` (adição) e `8b1bc38` (remoção do
   rastreamento) citados aqui não existem neste repositório — mesmo padrão de erro de transcrição
   já encontrado uma vez antes para `543c5b0` (ver nota anterior desta linha). Hashes reais,
   reverificados via `git cat-file`/`git rev-list --objects --all`: o blob (166075 bytes) foi
   adicionado em duas linhas de branch paralelas — `9a9c9506` e `40dd9478` (ambos 2026-08-07),
   unidas no merge `5467e2a8` (2026-08-11) — e desaparece dentro de uma resolução de merge
   (`3731ce04`), não por um commit `git rm` dedicado. Nenhum destes hashes muda a conclusão já
   registrada: o dump ainda existe, com PII real, recuperável por quem tiver acesso ao histórico.
   Remoção definitiva exige `git filter-repo`/BFG — reescreve hashes, decisão humana (ver
   AGENTS.md → Segurança e higiene).
   **Decidido na Fase Final 0 (2026-08-16), reafirmado na Sprint 01/Onda 13 (2026-08-18):** dono
   do repositório escolheu o Caminho A (manter histórico, mitigar daqui pra frente) — sem
   force-push. Risco residual aceito e registrado, ver runbook
   `docs/security/runbooks/DECIDE_GIT_HISTORY_REWRITE.md`.

## P0 — Plataforma quebrada no main (remediados)

| # | Achado | Status |
|---|---|---|
| 7 | `npm install` falhava (eslint 10 × jsx-a11y) — instalação limpa e CI quebrados | ✅ `c906e17` |
| 8 | Typecheck quebrado: JSX inválido em OcrCapturePanel (patch #99) | ✅ `c6d3e1b` |
| 9 | BullMQ 6 sem migração: 8 agendadores recorrentes não compilavam (nenhum job recorrente agendaria) | ✅ `7cd3854` |
| 10 | bull-board api/express dessincronizados (TS2322) | ✅ `c906e17` |
| 11 | Módulo Market Intelligence mergeado sem PageHeader/registro de aba | ✅ `7f32a77` |
| 12 | Tools de IA gravando campos inexistentes no schema (copywriter/summarize) | ✅ `e0cf226` |
| 13 | Webhook voice-result: body nunca parseado + lookup cross-tenant sem RLS + sem idempotência | ✅ `55bde4c` (7 testes novos) |
| 14 | `/admin/queues` sem autorização por papel (jobs de todos os tenants) | ✅ `55bde4c` (ADMIN) — risco residual: ADMIN de uma org vê jobs de outra (documentado) |
| 15 | react-hooks v7 sem migração: 60 erros de lint | ✅ `dabb7fb` (revert p/ v5) |
| 16 | test:integration não subia a stack (stub no prepare script) + corrida com initdb | ✅ `f089dee` + `26444355` — 43/43 verdes |
| 17 | npm audit high (sharp/libvips CVEs via cópia aninhada + nanoid) | ✅ `d6d30ce0` — 0 high |

## Altos — Onda 1 concluída e integrada (16 commits cherry-picked)

_Nota de execução: a primeira tentativa (via Workflow) falhou nos 3 agentes por limite de sessão da
conta; relançada via Agent tool com isolamento de worktree individual. Os 3 worktrees nasceram, por
uma condição de corrida com outra sessão que manipulava o checkout compartilhado, a partir de `main`
em vez de `fable/finalizacao-plataforma` — em vez de merge de branch (que arrastaria ~15 commits
alheios), cada um dos 16 commits foi cherry-picked individualmente após confirmar escopo de arquivo
por commit. Gate pós-integração: TSC ✅ / Lint ✅ (0 erros) / Unit 672/672 ✅ / Integration 43/43 ✅ /
Build ✅._

| # | Achado | Dono | Commit |
|---|---|---|---|
| 18 | render.yaml sem migrations no deploy — corrigido via startCommand (free tier sem preDeployCommand) | 08 | `99abf23d` |
| 19 | qualidade-ci.yml + playwright-ci.yml quebrados/redundantes — removidos (confirmado: `npm install --legacy-peer-deps` e DB/porta incompatíveis com docker-compose.yml) | 08 | `9aa934c9` |
| 20 | GitOps (charts/argocd) apontando p/ repositório antigo — corrigido + README declarando status (deploy ativo é Render+Vercel) | 08 | `9c3c3fe8` |
| 21 | Sem secret scan no CI — gitleaks adicionado | 08 | `65e90487` |
| 22 | Pages publica versão pública não-funcional a cada push — gatilho manual | 08 | `0f000c3e` |
| 23 | vectorStore RAG com SQL cru sem RLS — `withRlsContext` + filtro organizationId defesa em profundidade | 01 | `695e2a7a` |
| 24 | whatsappMessage vínculo com SQL cru sem RLS — `withRlsContext` | 01 | `74dcb448` |
| 25 | Enfileiramento de enriquecimento reporta sucesso sem Redis — retorna `{enqueued:0, enfileirado:false, motivo}` | 01 | `9f216006` |
| 26 | cold-leads-scanner query fora de contexto RLS — `requestContext.run` por organização | 01 | `9723e261` |
| 27 | LGPD: tenant via header do cliente + exclusão sem RBAC — header removido, `requireRole(['ADMIN','GESTOR'])` na exclusão | 01 | `18eeac1b` |
| 28 | cold-email fake-success + PII em log — envia de verdade via mailer real, loga só domínio | 01 | `2e42a557` |
| 29 | Sino de notificações cenográfico — navega + contagem real | 02 | `099507ee` |
| 30 | Tutoriais Bitrix com botões falsos — estado honesto "em breve" | 02 | `566aa08a` |
| 31 | useActivities não refaz fetch em mudança de intervalo — deps corrigidas | 02 | `e8115ee5` |
| 32 | LoginScreen signup gate — **não_aplicável**: servidor já bloqueia via `isAuthorizedLoginEmail` em 3 hooks do Better Auth (`src/lib/auth.ts`) | 02 | — |
| 33 | Settings sem entrada p/ não-admins vs rota aberta — aberto a todos (conteúdo é só preferências pessoais) | 02 | `e99313b1` |
| 34 | crm360 com backend completo e tela órfã — rota + menu ligados ("Cockpit CRM"); 2 de 4 quick-actions viraram cards informativos (sem UI de destino construída) | 02 | `3f6e336e` |

### Gate E2E (Playwright) — investigado e corrigido após a integração

Baseline pré-onda: 20/45 passando (44%) — 25 falhas, quase todas por `AUTH_RATE_LIMIT_MAX=20`
(default de produção) esgotado por 23 specs sequenciais de `signUp()`; local nunca reproduzia o
`AUTH_RATE_LIMIT_MAX=500` que só o CI define. Corrigido e investigado até a causa raiz de cada
falha real restante:

| Achado | Causa raiz | Correção | Commit |
|---|---|---|---|
| 23 specs falhando em `signUp()` | `.env.test.example` sem `AUTH_RATE_LIMIT_MAX` (herda 20/15min de prod) | Adicionado `AUTH_RATE_LIMIT_MAX=500`, igual ao CI | `489d6ab6` |
| `crm-board.spec.ts` sempre falha | Harness temporário de pilotos de design, nunca autentica (`assume auth bypass` no comentário), confirmado substituído por `crm-kanban.spec.ts` | Removido (teste morto) | `489d6ab6` |
| Botão X do drawer não encontrado | Ícone puro sem `aria-label` — sem nome acessível para leitor de tela | `aria-label="Fechar detalhes do lead"` | `489d6ab6` |
| `aria-pressed` nunca aparecia no card | `useSortable().isDragging` nunca era exposto via ARIA | Adicionado `aria-pressed={isDragging}` | `489d6ab6` |
| **Drag por teclado 100% inoperável** (3 specs) | **Bug real**: `onKeyDown` customizado do `KanbanCard` sobrescrevia por completo o `onKeyDown` de `{...listeners}` do dnd-kit (mesma prop, spread antes — última declaração vence). O `KeyboardSensor` nunca recebia o Espaço de pickup — nenhum atributo ARIA (mesmo corretos) ajudava, porque a ativação em si nunca disparava. Usuário de teclado/leitor de tela não conseguia mover nenhum card. | `CrmBoard.tsx`: `KeyboardSensor` restrito a Space (Enter livre p/ abrir drawer, sem colisão). `KanbanCard.tsx`: `onKeyDown` agora encaminha pro dnd-kit primeiro | `92aec6cd` |
| Select "Estágio do lead" nunca encontrado | Rótulo real do componente é "Status do Funil" — teste nunca bateu com a UI real | Teste corrigido para o rótulo real | `92aec6cd` |
| `color-contrast` intermitente em "Pipeline CRM" | Flake de timing: `transition-all` do botão da Sidebar capturado mid-transição pelo axe-core (sem relação com nenhuma mudança da Onda 1) | Confirmado flaky: 3/3 passou em repetição isolada — não é regressão, registrado como débito de teste (usar `waitForLoadState` de transição, não investigado a fundo) | — |

**Resultado final: 42/43 passando (97,7%)** — o único "failed" restante em runs completos é o flake de
color-contrast acima, não reprodutível isoladamente.

### Achado adicional durante a integração (fora do escopo original, corrigido direto em `main`)
Regressão de segurança ativa encontrada em `main` (linha de trabalho paralela nunca recebeu a
remediação P0 acima): tokens reais dos webhooks Bitrix24 (AtlasGR + TotalTrac) e telefone pessoal
real seguiam versionados em `connections.ts`, `useBitrixIntegration.ts`,
`public/tools/extrator-bitrix.html` e `extrator_bitrix (1).html`/`scripts/call_rodrigo.{js,ts}`.
Corrigido e enviado diretamente a `main` (commit `0c6a6dfd`), aprovado explicitamente pelo usuário.

## Débitos arquiteturais documentados (não bloqueiam release; Onda 3+)

- Workers BullMQ + sessões Baileys dentro do processo HTTP (`server.ts`) — separação de runtime
  planejada, exige entrypoint próprio + mudança de deploy (Render worker service).
- `process-guards.ts` engole unhandledRejection globalmente (proteção contra BullMQ sem Redis) —
  estreitar exige classificação de origem das rejeições.
- Graceful shutdown não fecha servidor HTTP/SSE/conexões Redis explicitamente.
- `/metrics` sem auth quando EXPOSE_METRICS=true (mitigação: manter flag off ou proteger por rede).
- piiSanitizer é código morto; consentimento LGPD antes de enviar PII a provedores de IA não é
  verificado em conversation-intelligence/birth-voice (registrado para Onda 2 de IA).
- 4 vulnerabilidades moderate (uuid via exceljs; dockerode/testcontainers dev-only).
- Gamificação da prospecção é estado local puro (XP some no reload) — decidir produto antes de
  persistir.
