# Documentos removidos do controle de versão

> **ITEM-14 (consolidação de documentação), 2026-08-25.** Esta página existe porque vários
> documentos e skills ainda ativos no repositório citavam, por nome, arquivos que já não existem —
> criando referências quebradas. Em vez de restaurar esses arquivos (que saíram do repositório por
> pedido explícito do usuário, não por acidente) ou apagar silenciosamente as citações, este arquivo
> registra **o que foi removido, quando, por quê, e o que — se algo — assumiu o papel de fonte de
> verdade no lugar**. Todo lugar do repositório que ainda cita um dos nomes abaixo deve apontar para
> esta página em vez de fingir que o arquivo existe.

## O commit

`b7e1f7871c9ea29797553afdf0832cca363d6890` — 2026-08-22 — *"chore(docs): remove
auditorias/relatórios de documentação do repositório"*:

> Pedido explícito do usuário: esses arquivos (auditorias técnicas, roadmaps de débito, checklists
> de release, relatórios de UX/segurança/IA) saem do controle de versão e passam a viver na área de
> trabalho local do usuário, fora do repositório.

Os 30 arquivos abaixo foram apagados nesse commit. Nenhum foi restaurado por este item — a decisão
de removê-los do controle de versão é do dono do repositório, não desta consolidação. O que este
item fez foi corrigir as referências que ficaram quebradas depois da remoção (ver seção "O que foi
corrigido" abaixo).

## Os 30 arquivos removidos

| Arquivo removido | O que era | Ainda referenciado em (após este item) | Fonte de verdade equivalente hoje |
| --- | --- | --- | --- |
| `BITRIX24-LEAD-FLOW-AUDIT.md` | Auditoria completa do fluxo de leads Bitrix24 (673 linhas) | Comentários/skills que citam a auditoria como contexto histórico (ex. `.claude/skills/integration-audit/SKILL.md`) | Nenhuma — reauditar do zero se a skill/tarefa exigir; não existe substituto versionado |
| `DESIGN_QA_CENTRAL_ATLASGR.md` | Auditoria de design com scores por categoria e débito visual mapeado (574 linhas) | `.claude/CLAUDE.md`, `.claude/PILOTS.md`, skills de design (`ui-ux`, `visual-qa`, `design-system`, `motion-design`, `release-readiness`), comentários em `eslint.config.mjs`/`src/styles/globals.css`/testes E2E | Nenhuma auditoria de design equivalente versionada hoje. Sinais live parciais que restam no repo: `eslint.config.mjs` (regras `jsx-a11y` com comentário de débito conhecido), `.claude/PILOTS.md` (registro de pilotos reais), `tests/e2e/accessibility.spec.ts` (limiar de severidade aceito) |
| `PLATFORM_COMPLETION_REPORT.md` | Relatório de conclusão de plataforma | `.agents/completion/02-mapa-plataforma.md` (citação histórica) | `.agents/completion/01-bloqueadores.md` e `02-mapa-plataforma.md` (ainda existem, mais recentes) |
| `PRODUCT_VISUAL_TRUTH_MAP.md` | Mapa de verdade visual/produto, base do sistema criativo | `CREATIVE_SYSTEM_01.md`, `FILME_HERO_01_30S.md` (citam como fundação) | Nenhuma — peças criativas que dependiam dele ficam sem a base rastreável; ver nota nesses dois arquivos |
| `TECHNICAL-DEBT-CHECKLIST.html` | Checklist HTML de dívida técnica | — | `docs/auditoria-divida-tecnica/` (diagnóstico atual, escopo mais restrito: arquitetura) |
| `TECHNICAL_DEBT_REMEDIATION_REPORT.md` | Relatório de remediação de dívida técnica | — | idem |
| `TRUST_BLOCKERS_ROADMAP.md` | Roadmap de bloqueadores de confiança | — | `.agents/completion/01-bloqueadores.md` |
| `auditoria-priorizada.html` | Auditoria priorizada (HTML, 4170 linhas) | — | — |
| `docs/AI-SWARM-GOVERNANCE-AUDIT.md` | Auditoria de governança do enxame de agentes de IA | — | `AGENTS.md` (raiz) — roster e regras atuais do enxame de desenvolvimento |
| `docs/AUDITORIA_EXAUSTIVA_PENDENCIAS.html` | Auditoria exaustiva de pendências (HTML, 4881 linhas) | — | — |
| `docs/CADENCE-CYCLE-AUDIT.md` | Auditoria do ciclo de cadência multicanal | — | `.agents/prompts/17-cadencia-ciclo-receita.md` (escopo do agente que trata o domínio) |
| `docs/ROADMAP-100-STEPS-COMPLETE.md` | Registro de encerramento do "Plano Diretor de 100 Passos" | `docs/README.md` (corrigido por este item) | `.agents/completion/01-bloqueadores.md` — estado de release vivo |
| `docs/architecture/SDR_VOZ_AUDITORIA_E_OPT_OUT.md` | Auditoria de SDR de voz e opt-out | `docs/README.md` (corrigido por este item) | `.agents/prompts/12-voz-telefonia.md` (escopo do agente responsável) |
| `docs/auditoria-divida-tecnica/checklist.html` | Checklist HTML da auditoria de dívida técnica | — | `docs/auditoria-divida-tecnica/10-DIAGNOSTICO-ARQUITETURA.md` |
| `docs/deploy/RELEASE_CHECKLIST.md` | Checklist de validação pós-deploy | `docs/README.md`, `docs/security/SECURITY_GUIDE.md`, `docs/architecture/12-REQUISITOS-ARQUITETURA.md`, `infrastructure/observability/RUNBOOK.md`, `.github/workflows/security-trivy.yml` | `docs/deploy/producao.md` §7 (checklist incorporado ali — já corrigido no índice principal via ITEM-12/PR #272; as demais citações continuam apontando para o arquivo removido e ficam registradas como débito derivado, ver rodapé) |
| `docs/reports/EXECUTIVE_MATRIX_ROADMAP.md` | Roadmap executivo/matriz de evolução enterprise | `docs/reports/README.md` (corrigido por este item) | `docs/auditoria-divida-tecnica/` |
| `docs/reports/FINAL_FORENSIC_AUDIT.md` | Auditoria forense completa | `docs/reports/README.md` (corrigido por este item) | idem |
| `docs/reports/RELATORIO_TECHNICAL_DEBT.md` | Inventário pontual de dívida técnica | `docs/reports/README.md` (corrigido por este item) | idem |
| `docs/reports/RELATORIO_UX_USABILIDADE_DIVIDA_TECNICA.md` | Auditoria de dívida técnica de UX/UI | `docs/reports/README.md` (corrigido por este item) | idem |
| `docs/reports/Sprint0-Audit.md` | Auditoria do Sprint 0 do Lead Enrichment Engine | `docs/reports/README.md` (corrigido por este item) | — |
| `docs/reports/TECHNICAL_DEBT_50_50_ANALYSIS.md` | 50 itens de dívida técnica + 50 de roadmap | `docs/reports/README.md` (corrigido por este item) | `docs/auditoria-divida-tecnica/` |
| `documentacao-aplicacao/briefing/roadmap.md` | Roadmap do briefing de produto | — | `documentacao-aplicacao/briefing/atualizacoes-futuras.md` (ainda existe) |
| `documentacao-aplicacao/inventario/inventario-de-telas.csv` | Inventário de telas (CSV) | — | `documentacao-aplicacao/inventario/mapa-de-navegacao.md` (ainda existe) |
| `public/tools/atlas-market-intelligence/AUDITORIA_ESTADO_ATUAL.md` | Auditoria de estado do módulo Atlas Market Intelligence | — | `public/tools/atlas-market-intelligence/README.md` |
| `public/tools/atlas-market-intelligence/METODOLOGIA_ECONOMICA_V1_4_AUDITORIA.md` | Auditoria da metodologia econômica v1.4 | — | `public/tools/atlas-market-intelligence/METODOLOGIA_UNIT_ECONOMICS_V1_2.md` (versão vigente) |
| `public/tools/portal-comercial/AUDITORIA_ESTADO_ATUAL.md` | Auditoria de estado do Portal Comercial | — | `public/tools/portal-comercial/PORTAL.md`, `COCKPIT_COMERCIAL.md` |
| `.agents/completion/00-inventario.md` | Inventário inicial do enxame de agentes | — | `.agents/completion/01-bloqueadores.md`, `02-mapa-plataforma.md` |
| `.agents/handoffs/onda-6/15-para-00-npm-audit-dependencias.md` | Handoff sobre `npm audit` | — | — (handoff presumidamente já endereçado; ver `.agents/handoffs/README.md` para o protocolo) |
| `.agents/handoffs/onda-8/18-para-08-npm-run-docs-dependencia-ausente.md` | Handoff sobre dependência ausente de `npm run docs` | — | — |
| `.agents/runs/ldr-fase-0-auditoria.md` | Log de execução da auditoria da fase 0 (LDR) | — | `.agents/runs/ldr-fase-1-fundacao.md` em diante (ainda existem) |

## O que foi corrigido por este item (ITEM-14)

- `docs/README.md` — links quebrados para `docs/architecture/SDR_VOZ_AUDITORIA_E_OPT_OUT.md` e
  `docs/ROADMAP-100-STEPS-COMPLETE.md` agora apontam para esta página em vez de um arquivo
  inexistente. A seção "Deploy / Produção / Release" (que também tinha um link quebrado para
  `deploy/RELEASE_CHECKLIST.md`) **não foi tocada aqui** porque já está sendo corrigida pelo
  ITEM-12 (PR #272) — ver nota de coordenação no PR deste item.
- `docs/reports/README.md` — removidas as 6 entradas que listavam relatórios já apagados
  (`EXECUTIVE_MATRIX_ROADMAP.md`, `FINAL_FORENSIC_AUDIT.md`, `RELATORIO_TECHNICAL_DEBT.md`,
  `RELATORIO_UX_USABILIDADE_DIVIDA_TECNICA.md`, `Sprint0-Audit.md`,
  `TECHNICAL_DEBT_50_50_ANALYSIS.md`); corrigida a nota "fonte de verdade atual", que citava
  `docs/auditoria-divida-tecnica/00-RESUMO-EXECUTIVO.md`, `03-MATRIZ-DIVIDA-TECNICA.md` e
  `04-ROADMAP-CORRECAO.md` — **esses três arquivos nunca existiram no histórico do git deste
  repositório** (não é uma remoção, é uma referência que nunca foi válida); a nota agora aponta
  para o que de fato existe em `docs/auditoria-divida-tecnica/`.
- `.claude/CLAUDE.md`, `.claude/PILOTS.md` e as skills `ui-ux`, `visual-qa`, `design-system`,
  `motion-design`, `release-readiness` (`.claude/skills/**/SKILL.md`) — referências a
  `DESIGN_QA_CENTRAL_ATLASGR.md` agora apontam para esta página.
- `eslint.config.mjs`, `src/styles/globals.css`, `tests/e2e/contact-company-forms.spec.ts`,
  `tests/e2e/accessibility.spec.ts` — comentários que citavam `DESIGN_QA_CENTRAL_ATLASGR.md` como
  fonte viva agora citam esta página.
- `.agents/completion/02-mapa-plataforma.md` — a linha que listava `00-inventario.md`,
  `PLATFORM_COMPLETION_REPORT.md`, `BITRIX24-LEAD-FLOW-AUDIT.md` e `DESIGN_QA_CENTRAL_ATLASGR.md`
  como leitura complementar agora aponta para esta página.
- `CREATIVE_SYSTEM_01.md` e `FILME_HERO_01_30S.md` — a citação a `PRODUCT_VISUAL_TRUTH_MAP.md`
  como fundação agora nota que o arquivo foi removido, sem tentar reconstruir seu conteúdo.

## O que ficou como débito derivado (fora do escopo deste item)

As citações abaixo continuam quebradas depois deste item porque tocá-las exigiria editar código
fonte (não documentação) ou arquivos de histórico/execução do enxame de agentes (`.agents/runs/`,
`.agents/handoffs/`) que múltiplas sessões paralelas do enxame de dívida técnica podem estar
consumindo neste momento — reescrevê-los está fora do escopo de "consolidar documentação" e do
risco aceitável deste item:

- Comentários de código citando `BITRIX24-LEAD-FLOW-AUDIT.md`: `src/features/prospecting/services/enrichment.service.ts`,
  `src/features/integrations/bitrix/service/customFields.ts`,
  `src/features/integrations/bitrix/bitrixFieldMap.ts`,
  `prisma/migrations/20260810000000_bitrix_full_wiring_sync_status_audit/migration.sql`,
  `infrastructure/observability/RUNBOOK.md`, e as skills `end-to-end-flow-validator`,
  `error-resilience`, `functional-completeness`, `integration-audit`, `release-readiness`.
- Citações a `docs/deploy/RELEASE_CHECKLIST.md` fora do índice principal:
  `docs/security/SECURITY_GUIDE.md`, `docs/architecture/12-REQUISITOS-ARQUITETURA.md`,
  `infrastructure/observability/RUNBOOK.md`, `.github/workflows/security-trivy.yml` (comentário).
- Citações a `docs/ROADMAP-100-STEPS-COMPLETE.md` dentro de `.agents/runs/**` e
  `.agents/prompts/**` — são registros de execução histórica do enxame de agentes, não
  documentação de produto; alterá-los está fora do escopo deste item.
- Links markdown quebrados para `docs/CADENCE-CYCLE-AUDIT.md` (`.agents/runs/onda-18.md`) e
  `docs/AI-SWARM-GOVERNANCE-AUDIT.md` (`.agents/runs/onda-20.md`) — mesmo motivo: são logs de
  execução append-only de ondas já concluídas do enxame de agentes.

Verificação usada para chegar nesta lista: uma varredura de todos os links markdown relativos do
repositório (`*.md`) contra o filesystem real, em 25/08/2026. Fora do que está listado acima, nenhum
outro link relativo quebrado foi encontrado nos documentos tocados por este item.
