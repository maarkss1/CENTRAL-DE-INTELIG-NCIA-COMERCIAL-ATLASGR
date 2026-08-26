# Roadmap v2 — Onda 3 — Acabamento (Design/Acessibilidade, QA/Release)

- **SHA base:** `599668b2de111758faa620fc6eb64a1de2787ca6` (`origin/main`)
- **Data/hora (UTC):** 2026-08-26
- **Branch de integração:** `integracao/roadmap-v2-onda-3`
- **Decisão:** disparada **em paralelo à Onda 2** por pedido explícito do usuário, não na sequência
  estrita de `EXECUCAO-ONDAS.md` (que previa Onda 3 só após Onda 2 aprovada). Isso é seguro porque a
  propriedade de arquivo dos dois rosters é disjunta — ver seção 2 — então não há risco de conflito
  de merge/semântico entre as duas ondas até a integração final em `main`. A reavaliação do
  bloqueio de W1 (motivo pelo qual esta onda pode rodar) está documentada em
  `.agents/runs/roadmap-v2-onda-2.md`, seção 1 — não repetida aqui.

## 1. Escopo (Freeze de escopo em vigor)

Mesmo regime de `.agents/runs/roadmap-v2-onda-2.md`: auditoria fail-closed com correção no próprio
escopo ("Proibição de auditoria sem correção" em `/AGENTS.md`), sem feature nova, conforme o
"Freeze de escopo (Sprint 00 → Sprint 13)".

## 2. Especialistas e matriz de propriedade (publicada antes do disparo)

| Agente | Missão | Pastas/arquivos de propriedade |
|---|---|---|
| 03 — Design e Acessibilidade | Auditar primitivos de UI e tokens globais contra os requisitos mínimos de acessibilidade do `.claude/CLAUDE.md` (seção 10) e o débito conhecido (`eslint.config.mjs` com regras `jsx-a11y` comentadas, `.claude/PILOTS.md`) — foco em contraste AA, navegação por teclado, foco visível, semântica HTML antes de `role`/`aria-*`, labels associados. Corrigir sem redesenhar (constituição não autoriza redesenho amplo). | `src/components/ui/`, `src/styles/` |
| 08 — QA e Release | Reconciliar checklist de release e workflows de deploy contra bloqueadores prioritários de `/AGENTS.md`, em especial nº 5 "Deploy capaz de iniciar sem aplicar migrações". Verificar `cd-homolog.yml`/`production.yaml`/`android-build.yml`/`ios-build.yml` quanto a esse risco e quanto a paridade com o gate canônico (`ci.yml`) já endurecido pela campanha de dívida técnica (ITEM-01/06/10). Não reabrir o que a campanha já corrigiu — focar em deploy/release, não em lint/CI de PR. | `.github/workflows/**`, `Dockerfile`, `docker-compose.yml` (raiz), checklists de release em `docs/` |

Propriedade disjunta entre si e em relação à Onda 2 (04 CRM/BI, 05 Prospecção, 07 IA/Automações —
ver `.agents/runs/roadmap-v2-onda-2.md`): nenhuma pasta acima é tocada pelos agentes daquela onda.
Ambos evitam `prisma/schema.prisma`, migrações, `server.ts`, `package.json`/lockfile,
`src/App.tsx`/Sidebar, `k8s/**`/`argocd/**`/`charts/**`/`infrastructure/**`, `android/**`,
`identidade-visual/**` — exceto onde a própria propriedade exclusiva já autoriza (08 em
workflows/Dockerfile/compose).

Isolamento: cada agente roda em `git worktree` + branch própria (`agente/03-design-a11y`,
`agente/08-qa-release`), a partir de `integracao/roadmap-v2-onda-3`.

## 3. Gate mínimo da W3

Igual ao gate mínimo da W2 (ver `.agents/runs/roadmap-v2-onda-2.md`, seção 4).

## 4. Status

Onda disparada nesta data, em paralelo à Onda 2. Relatório final de integração será registrado em
atualização deste mesmo arquivo.
