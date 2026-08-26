# Roadmap v2 — Onda 1 — Fundação (execução real, substitui o relatório órfão de 22/08)

- **SHA base:** `599668b2de111758faa620fc6eb64a1de2787ca6` (`origin/main`)
- **Data/hora (UTC):** 2026-08-26
- **Branch de integração:** `integracao/roadmap-v2-onda-1`
- **Decisão:** disparada **em paralelo às Ondas 2 e 3**, a pedido explícito do usuário, completando o
  roster original de "Onda 1 — Fundação" (`/AGENTS.md`) que nunca chegou a rodar de verdade neste
  repositório (o `roadmap-v2-onda-1.md` de 22/08/2026 foi produzido num sandbox isolado cujos
  commits nunca chegaram ao GitHub — ver reavaliação completa em
  `.agents/runs/roadmap-v2-onda-2.md`, seção 1). Este arquivo é a execução real, não uma correção
  daquele.

## 1. Escopo (Freeze de escopo em vigor)

Mesmo regime das Ondas 2 e 3: auditoria fail-closed com correção no próprio escopo, sem feature
nova, conforme "Freeze de escopo (Sprint 00 → Sprint 13)".

## 2. Especialistas e matriz de propriedade (publicada antes do disparo)

| Agente | Missão | Pastas/arquivos de propriedade |
|---|---|---|
| 01 — Plataforma, Segurança e Dados | Auditar autenticação, RBAC, RLS multi-tenant, credenciais e schema contra os bloqueadores prioritários de segurança/dados de `/AGENTS.md`. | `prisma/schema.prisma`, `prisma/migrations/**` (dono exclusivo), `src/lib/auth/`, `src/shared/` |
| 02 — Produto e UX | Auditar navegação principal, configurações e onboarding quanto a drift entre o que o produto promete e o que o código faz, e estados vazio/erro/loading ausentes. | `src/App.tsx`, `src/components/layout/`, `src/features/settings/`, `src/features/dashboard/`, `src/features/onboarding/` |
| 06 — Integrações e Bitrix | Auditar sincronizações Bitrix quanto a falha silenciosa (bloqueador prioritário nº 11) e extrações incompletas tratadas como finais (nº 12). | `src/features/integrations/` |

Propriedade disjunta entre si e em relação às Ondas 2 e 3 já em execução (04, 05, 07, 03, 08 — ver
`.agents/runs/roadmap-v2-onda-2.md` e `roadmap-v2-onda-3.md`). `server.ts` e `package.json`/lockfile
permanecem fora do escopo de qualquer um dos três sem aprovação explícita do Coordenador (00),
mesmo o 01 tendo aprovação limitada para o schema.

## 3. Nota de capacidade real do ambiente

Este ambiente de execução tem **4 vCPUs**. Com esta onda, sobem para **8 especialistas simultâneos**
no total (04, 05, 07, 03, 08, 01, 02, 06) — o teto documentado em `/AGENTS.md` → "Regra de
concorrência". Acima de 3 simultâneos a regra exige isolamento por worktree (garantido), propriedade
disjunta verificada antes do disparo (feito acima), gate por leva, ausência de bloqueador mútuo
(nenhum identificado) e capacidade real da ferramenta. Com 4 vCPUs, 8 processos concorrentes de
`tsc`/`eslint`/`vitest` vão competir por CPU e rodar mais devagar em wall-clock do que em paralelismo
real — isso é aceitável (não há corrida de dados, só contenção de CPU), mas é a razão registrada
para não somar mais especialistas além destes 8 nesta rodada.

## 4. Gate mínimo da W1 (execução real)

Igual ao gate mínimo já descrito em `.agents/runs/roadmap-v2-onda-2.md`, seção 4.

## 5. Status

Onda disparada nesta data, em paralelo às Ondas 2 e 3. Relatório final de integração será
registrado em atualização deste mesmo arquivo.
