# Índice de Relatórios (docs/reports/)

> **Nota (DOC-003, auditoria de dívida técnica):** os documentos listados abaixo são
> **registros históricos de sessões de trabalho passadas** (auditorias, migrações,
> relatórios de fase, QA pontual etc.), escritos em momentos diferentes do projeto e
> **não são atualizados retroativamente**. Vários já estão desatualizados em relação ao
> estado real do código. Eles não foram apagados porque preservam contexto histórico útil,
> mas **não devem ser tratados como fonte de verdade**.
>
> A fonte de verdade **atual** sobre dívida técnica de arquitetura é
> **[`docs/auditoria-divida-tecnica/`](../auditoria-divida-tecnica/)**, em especial
> [`10-DIAGNOSTICO-ARQUITETURA.md`](../auditoria-divida-tecnica/10-DIAGNOSTICO-ARQUITETURA.md).
> Esta nota citava anteriormente `00-RESUMO-EXECUTIVO.md`, `03-MATRIZ-DIVIDA-TECNICA.md` e
> `04-ROADMAP-CORRECAO.md` como os documentos centrais dessa pasta — **esses três arquivos nunca
> existiram no histórico do git deste repositório** (corrigido em 25/08/2026, ITEM-14; não é uma
> remoção, a referência nunca foi válida). Ver [`docs/REMOVED-DOCS.md`](../REMOVED-DOCS.md) para o
> inventário completo do que foi de fato removido do controle de versão.
>
> Este README apenas indexa e agrupa os relatórios abaixo por tema para facilitar a
> navegação — não é uma consolidação de conteúdo nem uma reavaliação do que ainda é válido.

Este diretório reúne relatórios produzidos em diferentes ciclos de trabalho do
projeto (auditorias, migrações de arquitetura, QA, segurança, etc.). Abaixo eles estão
agrupados por tema — só os que ainda existem neste diretório; seis relatórios que apareciam
aqui (`EXECUTIVE_MATRIX_ROADMAP.md`, `FINAL_FORENSIC_AUDIT.md`, `RELATORIO_TECHNICAL_DEBT.md`,
`RELATORIO_UX_USABILIDADE_DIVIDA_TECNICA.md`, `Sprint0-Audit.md`,
`TECHNICAL_DEBT_50_50_ANALYSIS.md`) foram removidos do controle de versão em 22/08/2026 por
pedido explícito do usuário — ver [`docs/REMOVED-DOCS.md`](../REMOVED-DOCS.md). Mais seis
(`RELATORIO_TESTES.md`, `TEST_RESOLUTION_REPORT.md`, `PENTEST_REPORT.md`, `HARDENING_REPORT.md`,
`RELATORIO_SEGURANCA.md`, `SECURITY_IMPLEMENTATION_REPORT.md`) foram removidos pelo mesmo motivo
em 30/08/2026 (Onda 43) — todos placeholders rasos ou já descrevendo uma arquitetura de
autenticação (JWT/refresh token) que não é mais real desde a migração para Better Auth; ver
`docs/REMOVED-DOCS.md`.

## Auditorias gerais e roadmap enterprise

- [`AUDIT_REPORT.md`](AUDIT_REPORT.md) — Auditoria enterprise por pilares (banco de dados, performance) visando evolução para SaaS B2B Enterprise.

## CRM e migração SDR/BDR

- [`RELATORIO_FINAL.md`](RELATORIO_FINAL.md) — Relatório final da integração do módulo SDR/BDR ao PROSPECTOR-ATLAS (estatísticas de arquivos reutilizados/descartados).
- [`RELATORIO_FINAL_FASE2.md`](RELATORIO_FINAL_FASE2.md) — Fase 2: implementação do CRM Core (Empresas, Contatos, Leads, Pipeline, Atividades, Dashboard).
- [`RELATORIO_CRM_CONSOLIDADO.md`](RELATORIO_CRM_CONSOLIDADO.md) — Consolidação da segunda fase de migração do CRM (dashboard, timeline, pipeline drag-and-drop, validação Zod).
- [`RELATORIO_CRM_QA.md`](RELATORIO_CRM_QA.md) — Matriz de testes e validação (cobertura por módulo) do CRM.
- [`RELATORIO_MIGRACAO_ARQUITETURA.md`](RELATORIO_MIGRACAO_ARQUITETURA.md) — Migração dos módulos Notes/Activities/Contacts/Companies/CRM para Clean Architecture (2024-07-19).
- [`RELATORIO_SALES_INTELLIGENCE.md`](RELATORIO_SALES_INTELLIGENCE.md) — Fase 3: Sales Intelligence — expansão do schema Prisma (ICPProfile, Persona, Objection, Cadence, Playbook, Recommendation).

## IA e agentes

- [`AI_ENGINE_EVOLUTION_REPORT.md`](AI_ENGINE_EVOLUTION_REPORT.md) — Evolução do AI Engine: unificação dos agentes SDR, remoção de mocks (`setTimeout`) no frontend.
- [`FINAL_REVIEW_AI.md`](FINAL_REVIEW_AI.md) — Correções de implementação nos agentes de IA (typings, tratamento de `BaseMessage`, access policy).

## QA e testes

- [`RELATORIO_QA.md`](RELATORIO_QA.md) — Status de lint/typecheck/build e pendências de suíte de testes (Vitest, Playwright, MSW).
- [`RELATORIO_FINAL_QA.md`](RELATORIO_FINAL_QA.md) — Infraestrutura de testes enterprise: configs separadas de unit/integration, factories, E2E Playwright, CI.

## Segurança e compliance

- [`COMPLIANCE_REPORT.md`](COMPLIANCE_REPORT.md) — LGPD, SOC2 readiness e OWASP ASVS.

## Infraestrutura, performance e produção

- [`RELATORIO_INFRAESTRUTURA.md`](RELATORIO_INFRAESTRUTURA.md) — Arquitetura de infraestrutura enterprise (Docker, Kubernetes/Helm, Redis, object storage).
- [`RELATORIO_PERFORMANCE.md`](RELATORIO_PERFORMANCE.md) — Relatório placeholder sobre tempo de build do Vite.
- [`RELATORIO_PRODUCTION_READINESS.md`](RELATORIO_PRODUCTION_READINESS.md) — Relatório placeholder confirmando compilação bem-sucedida em Node.js.

## UX e organização do repositório

- [`REPOSITORY_CLEANUP_REPORT.md`](REPOSITORY_CLEANUP_REPORT.md) — Reorganização e limpeza do repositório (remoção de scripts corrompidos e duplicatas na raiz).

## Product Adoption & Commercial Intelligence

- [`PRODUCT_ADOPTION_INTELLIGENCE_ATLASGR.md`](PRODUCT_ADOPTION_INTELLIGENCE_ATLASGR.md) —
  diagnóstico de maturidade de produto e blueprint de instrumentação de adoção (07/08/2026);
  movido para cá em 25/08/2026 (ITEM-14) — vivia solto na raiz do repositório, sem nenhuma
  referência de outros documentos, com o mesmo perfil (auditoria pontual e não atualizada
  retroativamente) dos demais relatórios listados aqui.
