# Documentação do PROSPECTOR-ATLASGR

Este é o índice único de documentação canônica deste repositório. Se um documento em qualquer
outro lugar do repositório contradizer o que está listado aqui, este arquivo vence — corrija o
outro documento (ou registre-o como histórico) em vez de tratá-lo como fonte de verdade paralela.

**Dono e revisão:** Agente 08 — QA e Release (`docs/AGENTS.md`), como todo o restante de `docs/`.
Última revisão de todos os links deste índice: **2026-08-25** (ITEM-14 da auditoria de dívida
técnica) — nessa revisão, dois links quebrados foram corrigidos (apontavam para arquivos removidos
do controle de versão em 22/08/2026; ver [`docs/REMOVED-DOCS.md`](REMOVED-DOCS.md)) e a seção
"Relatórios" abaixo foi corrigida para não listar relatórios que não existem mais.

## Contrato de API

- [OpenAPI (docs/openapi.yaml)](openapi.yaml) — servido em `/api-docs` (fora de produção por
  padrão, ou em qualquer ambiente com `EXPOSE_API_DOCS=true`). Verificação automatizada de deriva
  estrutural entre este documento e as rotas reais: `npm run verify:openapi-drift` (ver
  `scripts/verify-openapi-drift.ts`).

## Arquitetura

- [Matriz de arquitetura](architecture/MATRIZ_ARQUITETURA.md)
- [Classificação de features](architecture/FEATURE-CLASSIFICATION.md)
- ~~Auditoria SDR de Voz e opt-out~~ — `docs/architecture/SDR_VOZ_AUDITORIA_E_OPT_OUT.md` foi
  removido do controle de versão em 22/08/2026 (ver [`docs/REMOVED-DOCS.md`](REMOVED-DOCS.md)); o
  escopo de SDR de voz é mantido em `.agents/prompts/12-voz-telefonia.md`
- [Mapa da plataforma](../.agents/completion/02-mapa-plataforma.md) — inventário estrutural vivo
  (módulos, motores, rotas, agentes), mais atualizado que os relatórios estáticos abaixo.

## Decisões arquiteturais (ADRs)

- [ADR-001: Vulnerabilidades aceitas do better-auth](ADR/ADR-001-BetterAuth-Vulnerability.md)
- [ADR-002: Clean Architecture](ADR/ADR-002-Clean-Architecture.md)
- [ADR-003: Decisões estruturais das Ondas 6-8](ADR/ADR-003-Decisoes-Estruturais-Onda-6-8.md) —
  separação de runtime de workers, regra de concorrência ampliada de agentes, opt-out unificado

## Segurança

- [Guia de segurança](security/SECURITY_GUIDE.md)
- [Modelo de ameaças](security/THREAT_MODEL.md)
- [Resposta a incidentes](security/runbooks/INCIDENT_RESPONSE.md)
- [Runbook: rotacionar webhooks Bitrix24](security/runbooks/ROTATE_BITRIX24_WEBHOOKS.md)
- [Runbook: rotacionar chave Bland AI](security/runbooks/ROTATE_BLAND_AI_KEY.md)
- [Runbook: decidir reescrita de histórico do git](security/runbooks/DECIDE_GIT_HISTORY_REWRITE.md)
- [Registro de risco — RISK-001 (better-auth)](RiskRegister/RISK-001-BetterAuth.md) e
  [issue de acompanhamento](RiskRegister/tracking-issue.md)

## LGPD

- [Base legal por finalidade de tratamento](lgpd-base-legal.md)

## Deploy / Produção / Release

- [Índice operacional de infraestrutura/deploy](deploy/README.md) — **leia primeiro**: qual
  caminho é canônico por ambiente hoje, e o status real (ativo/congelado/aspiracional) de cada um
  dos quatro caminhos documentados
- [Modo local-first](development/LOCAL_FIRST.md) — ambiente ativo hoje (única fase em execução)
- [Guia de produção completo](deploy/producao.md) — Supabase, Render, Cloudflare, CI/CD e
  checklist da arquitetura de produção **congelada** durante a fase local-first (ver índice acima)
- [Deploy no Render](deploy/render.md)
- Checklist de validação pós-deploy: `deploy/producao.md` §7 (`deploy/RELEASE_CHECKLIST.md`
  referenciado anteriormente aqui nunca existiu neste repositório — link corrigido)
- ~~Plano Diretor de 100 Passos — encerramento~~ — `docs/ROADMAP-100-STEPS-COMPLETE.md` (registro
  histórico de 12/08/2026 que declarava `1.0.0-RELEASE-APPROVED`) foi removido do controle de
  versão em 22/08/2026 (ver [`docs/REMOVED-DOCS.md`](REMOVED-DOCS.md)). O estado de release vivo
  continua sendo `.agents/completion/01-bloqueadores.md`.

## Desenvolvimento

- [Política de assets públicos e datasets](development/PUBLIC_ASSETS_AND_DATASETS.md) — o que
  pertence a `public/` vs. `data/` vs. object storage, e o budget de tamanho que impede
  reincidência (ITEM-05).
- [Local-first](development/LOCAL_FIRST.md)

## Desenvolvimento

- [Política de assets públicos e datasets](development/PUBLIC_ASSETS_AND_DATASETS.md) — o que
  pertence a `public/` vs. `data/` vs. object storage, e o budget de tamanho que impede
  reincidência (ITEM-05).
- [Local-first](development/LOCAL_FIRST.md)

## Compliance

- [Matriz de compliance](compliance/COMPLIANCE_MATRIX.md)

## Performance

- [Budgets de performance — bundle, tamanho e latência](development/PERFORMANCE_BUDGETS.md) —
  limites mensuráveis de tamanho de bundle frontend e latência de endpoints críticos, e como o CI
  os verifica (`npm run check:bundle-budget`, `tests/load/k6-api.js`).

## Relatórios

Consulte o [índice de relatórios](reports/README.md) — registros históricos de sessões
passadas, agrupados por tema. A fonte de verdade atual sobre dívida técnica é a
[auditoria de dívida técnica](auditoria-divida-tecnica/).

## Documentos históricos e removidos

- [`docs/REMOVED-DOCS.md`](REMOVED-DOCS.md) — ledger dos 30 documentos (auditorias, roadmaps,
  checklists) que saíram do controle de versão em 22/08/2026 por pedido explícito do usuário, com
  o que (se algo) assumiu o papel de cada um. Consulte antes de tratar um link quebrado para um
  desses nomes como bug novo — ele já está registrado.

## Governança desta pasta

- [`docs/AGENTS.md`](AGENTS.md) — dono e regras de edição de `docs/**`.
