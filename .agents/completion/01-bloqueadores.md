# Bloqueadores — status de remediação

- Fonte: inventário Onda Zero (5 agentes) + baseline executável.
- Branch de trabalho: `fable/finalizacao-plataforma`.
- Última atualização: 2026-08-14 (Onda 1 em execução).

## P0 — Segredos e PII versionados (TODOS remediados no working tree)

| # | Achado | Ação | Status |
|---|---|---|---|
| 1 | Chave real da Bland AI em `scripts/call_bland_juliana.py` (fallback de env) | Script removido | ✅ commit `40a99c31` |
| 2 | Telefone pessoal real (titular "Juliana"/"Rodrigo") em 7 scripts | 6 scripts one-off removidos; mock sanitizado | ✅ commit `40a99c31` |
| 3 | Tokens reais de webhook Bitrix24 (AtlasGR + TotalTrac) em `connections.ts`, `useBitrixIntegration.ts`, `public/tools/extrator-bitrix.html` (servido publicamente!) e `extrator_bitrix (1).html` | Fallbacks removidos (env-only), input vazio, HTML sanitizado, cópia solta apagada | ✅ commit `40a99c31` |
| 4 | Org nova herdava credencial Bitrix da AtlasGR (cross-tenant) | Autoconnect exige env + nome de marca conhecida | ✅ commit `40a99c31` |
| 5 | `reset-passwords.ts` sem argumento resetava TODAS as senhas p/ `00000000` | Alvo explícito obrigatório (`email` ou `--all`) | ✅ commit `40a99c31` |
| 6 | Segredo default hardcoded no webhook voice-result (`server.ts`) | Fail-closed (503 sem env), tempo constante | ✅ commit `55bde4c` |

**⚠️ AÇÃO EXTERNA OBRIGATÓRIA (fora do alcance do código):**
1. **Rotacionar a chave Bland AI** (dispara ligações pagas) — estava versionada com remote no GitHub.
2. **Rotacionar os 2 webhooks Bitrix24** (AtlasGR `/rest/450/…` e TotalTrac `/rest/2486/…`) — a URL é a credencial.
3. **Dump `backups/prospector-*.dump` segue recuperável no HISTÓRICO git** (commits 2e30b2f, 543c5b0, 8b1bc38). Remoção definitiva exige `git filter-repo`/BFG — reescreve hashes, decisão humana (ver AGENTS.md → Segurança e higiene).

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

## Altos — em remediação na Onda 1 (3 especialistas em worktrees)

| # | Achado | Dono |
|---|---|---|
| 18 | render.yaml sem migrations no deploy (docs divergem) | 08 |
| 19 | qualidade-ci.yml + playwright-ci.yml quebrados/redundantes | 08 |
| 20 | GitOps (charts/argocd) apontando p/ repositório antigo, sem aviso de status | 08 |
| 21 | Sem secret scan no CI | 08 |
| 22 | Pages publica versão pública não-funcional a cada push | 08 |
| 23 | vectorStore RAG com SQL cru sem RLS (busca sempre vazia/cross-tenant) | 01 |
| 24 | whatsappMessage vínculo com SQL cru sem RLS | 01 |
| 25 | Enfileiramento de enriquecimento reporta sucesso sem Redis | 01 |
| 26 | cold-leads-scanner query fora de contexto RLS | 01 |
| 27 | LGPD: tenant via header do cliente + exclusão sem RBAC | 01 |
| 28 | cold-email fake-success + PII em log | 01 |
| 29 | Sino de notificações cenográfico | 02 |
| 30 | Tutoriais Bitrix com botões falsos | 02 |
| 31 | useActivities não refaz fetch em mudança de intervalo | 02 |
| 32 | LoginScreen signup gate (verificar se servidor já bloqueia) | 02 |
| 33 | Settings sem entrada p/ não-admins vs rota aberta | 02 |
| 34 | crm360 com backend completo e tela órfã | 02 |

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
