# Onda 12 — GOV-006: Inventário completo de handoffs

Anexo de `.agents/runs/onda-12.md`. Cobertura: todos os 83 arquivos em `.agents/handoffs/**`
(exclui `README.md`), verificados contra o código atual em 2026-08-18. 9 handoffs tinham
`Status` desatualizado (correção já no código, campo nunca fechado) — corrigidos nesta onda, cada
um com uma seção `## Resolução` nova no próprio arquivo (ver GOV-006 no relatório principal).

| arquivo | de | para | prioridade | status_declarado (pós-correção) | ainda_valido | evidência breve | sprint_destino |
|---|---|---|---|---|---|---|---|
| onda-1/00-para-01-legacy-services-repo-migration.md | Coordenador(00) | 01 | normal | aberto | sim | `usage.service.ts`/`crm360.service.ts` ainda usam `prisma.*` direto, sem repositório DI | backlog pós-freeze |
| onda-1/01-para-04-role-gates-crm.md | 01 | 04 | normal | resolvido | não (resolvido) | RBAC confirmado, revisado de novo na Onda 7 | fechado |
| onda-1/01-para-06-role-gates-integracoes.md | 01 | 06 | normal | resolvido | não (resolvido) | opt-out liberado a VENDEDOR+, confirmado em código | fechado |
| onda-1/01-para-06-teste-integrations-ambiguo.md | 01 | 06 | alto | resolvido | não (resolvido) | teste ambíguo corrigido com `within(nav)` | fechado |
| onda-1/01-para-07-role-gates-intelligence.md | 01 | 07 | alto | resolvido | não (resolvido) | `ai-settings` com `requireRole(['ADMIN'])` e testes | fechado |
| onda-1/02-para-06-contrato-navegacao-voz.md | 02 | 06 | bloqueador | resolvido | não (resolvido) | `navigationBus.requestNavigation` implementado com testes | fechado |
| onda-1/06-para-01-persistencia-3cx.md | 06 | 01 | alto | resolvido | não (resolvido) | `ThreeCXConnection` no schema, validado onda 5/7 | fechado |
| onda-1/06-para-01-schema-extracoes-bitrix-historico.md | 06A | 01 | normal | **resolvido (corrigido nesta onda)** | não (superado) | `BitrixExtractionRun` já existe em `prisma/schema.prisma`, implementado via onda-6/01A | fechado |
| onda-1/06-para-01-schema-extracoes-bitrix.md | 06 | 01 | normal | resolvido | não (resolvido) | `BitrixSyncRule.lastError` confirmado no schema/código | fechado |
| onda-2/00-para-01-ailog-rls-violation.md | 00 | 01 | alto | resolvido | não (resolvido) | 3 reaberturas, fechado com execução real de testes (5/5) | fechado |
| onda-2/04-para-05-whatsapp-duplicado.md | 04 | 05 | alto | resolvido | não (resolvido) | wrapper fino confirmado, sem `whatsapp-web.js` | fechado |
| onda-2/05-para-04-whatsapp-consolidado.md | 05 | 04 | bloqueador | resolvido | não (resolvido) | arquivo órfão removido, integração real Baileys em uso | fechado |
| onda-2/07-para-01-automation-execution-history.md | 07 | 01 | alto | resolvido | não (resolvido) | histórico via `AuditLog`, `automation-history.service.ts` confirmado | fechado |
| onda-2.5/00-para-08-pin-github-actions-sha.md | 00 | 08 | alto | resolvido | não (resolvido) | todas Actions pinadas por SHA, validado | fechado |
| onda-3/07-para-11-lgpd-service-fix.md | 07 | 11 | bloqueador | resolvido | não (resolvido) | `lgpd.service.ts` compila, campos existem | fechado |
| onda-4/10-para-01-metricas-http-otel.md | 10 | 01 | normal | em-andamento | sim (parcial) | `metricReader` adicionado, métrica HTTP por status não confirmada | backlog pós-freeze |
| onda-4/10-para-02-tsc-quebrado-tab-route-set-crm360.md | 10 | 02 | alto | resolvido | não (resolvido) | `crm360: true` confirmado em `navigationBus.ts` | fechado |
| onda-4/10-para-06-metricas-sync-bitrix.md | 10 | 06 | normal | resolvido | não (resolvido) | `bitrix_sync_failures_total` implementado e testado | fechado |
| onda-4/10-para-07-metricas-fila-orcamento-ia.md | 10 | 07 | normal | resolvido | não (resolvido) | métricas de fila/IA implementadas, validado via smoke test | fechado |
| onda-4/10-para-08-lint-quebrado-eslint-config.md | 10 | 08 | alto | resolvido | não (resolvido) | regra `set-state-in-effect` removida de `eslint.config.mjs` | fechado |
| onda-4/10-para-08-prisma-cli-imagem-producao.md | 10 | 08 | alto | resolvido | não (resolvido) | Dockerfile reinstala CLI prisma, validado com build real | fechado |
| onda-4/11-para-00-videos-institucionais-duplicados.md | 11 | 00 | normal | resolvido | não (resolvido) | vídeo duplicado removido na Onda 8 | fechado |
| onda-4/11-para-02-crm360-rota-ausente.md | 11 | 02 | bloqueador | resolvido | não (resolvido) | rota `/app/crm360` confirmada em App.tsx | fechado |
| onda-5/01-para-06-persistencia-3cx-implementada.md | 01 | 06 | normal | resolvido | não (resolvido) | revisado 2x (06 e 12), RLS/criptografia confirmados | fechado |
| onda-6/01A-para-00-raw-sql-fora-de-rls-fail-closed.md | 01A | 00→05 | alto | resolvido | não (resolvido) | 3 chamadas envolvidas em `withRlsContext`, testes 5/5 | fechado |
| onda-6/01A-para-06-bitrix-extraction-run-schema.md | 01A | 06/06A | normal | **resolvido (corrigido nesta onda)** | não (já implementado) | `BitrixExtractionRun` confirmado no schema atual | fechado |
| onda-6/01A-para-07-agentmemory-sem-vinculo-titular.md | 01A | 07 | normal | resolvido | sim (parcial) | migração `AgentMemory.leadId` proposta **nunca aplicada** — schema atual não tem o campo | onda-13 |
| onda-6/01A-para-14-lgpd-erasure-cross-tenant-test.md | 01A | 14 | alto | resolvido | não (resolvido) | teste criado e passando 3x contra Postgres real | fechado |
| onda-6/14-para-08-baselines-visuais-linux.md | 14 | 08 | normal | em-andamento | sim | `describe.skip` ainda ativo — depende de execução manual real no GH Actions | backlog pós-freeze |
| onda-6/15-para-00-npm-audit-dependencias.md | 15 | 00 | normal | resolvido | não (resolvido) | `testcontainers`/`exceljs` endereçados, risco residual documentado | fechado |
| onda-6/15-para-01-bland-api-key-env-example.md | 15 | 01 | normal | resolvido | não (resolvido) | `BLAND_API_KEY` presente em `.env.example` | fechado |
| onda-6/15-para-08-zap-trivy-gate.md | 15 | 08 | normal | resolvido | não (resolvido) | workflow `security-trivy.yml` criado, zap no release checklist | fechado |
| onda-6/16-para-00-remover-workers-de-server-ts.md | 16 | 00 | bloqueador (escopado) | **resolvido (corrigido nesta onda)** | não (resolvido de outra forma) | duplicação evitada via flag `ENABLE_EMBEDDED_WORKERS` (default false) | fechado |
| onda-6/16-para-06-plano-migracao-baileys.md | 16 | 06 | alto | resolvido | não (resolvido) | levantamento respondido, nada movido conforme pedido | fechado |
| onda-6/16-para-07-cron-cold-leads-scanner-confirmacao.md | 16 | 07 | normal | resolvido | não (resolvido) | handoff de confirmação, sem mudança necessária | fechado |
| onda-6/16-para-08-deploy-worker-service.md | 16 | 08 | alto | em-andamento | sim | confirmado via API Render: serviço `prospector-atlas-worker` nunca foi criado em produção | backlog pós-freeze |
| onda-6/16-para-10-observabilidade-worker.md | 16 | 10 | normal | em-andamento | sim | depende do item anterior (deploy do worker) não concluído | backlog pós-freeze |
| onda-7/04-para-06-owner-bitrix-nome-nao-id.md | 04 | 06 | alto | resolvido | não (resolvido) | `resolveAtlasUserIdByEmail` implementado | fechado |
| onda-7/04-para-07-owner-fabricado-follow-up-ia.md | 04 | 07 | alto | resolvido | não (resolvido) | seção Resolução completa | fechado |
| onda-7/05-para-01-enrichmentlog-provenance-fields.md | 05 | 01/01A | normal | aberto | sim | `EnrichmentLog` no schema sem coluna estruturada confirmado/inferido | onda-13 |
| onda-7/05-para-02-rotulagem-confirmado-inferido.md | 05 | 02 | normal | aberto | sim | proposta de UI para badge confirmado/inferido não implementada | backlog pós-freeze |
| onda-7/06-para-04-voice-trigger.md | 06 | 04 | normal | resolvido | não (resolvido) | seção Resolução | fechado |
| onda-7/06-para-12-3cx-webhook-persistencia.md | 06 | 12 | normal | aberto | sim | `process3CXWebhook` confirmado só loga payload, não persiste | onda-13 |
| onda-7/07-para-00-wire-stagnation-scanner-boot.md | 07 | 00 | normal | **resolvido (corrigido nesta onda)** | não (já implementado) | `scheduleStagnationScannerJob()` confirmado em `server.ts` | fechado |
| onda-7/07-para-01-flaky-org-creation-mid-integration-test.md | 07 | 01 | alto | resolvido | não (resolvido) | corrigido na Onda 9, commit `2616a4d1` | fechado |
| onda-7/12-para-00-test-db-contencao-cross-agente.md | 12 | 00/08 | crítico | resolvido | não (resolvido) | corrigido na Onda 9, mesmo commit acima | fechado |
| onda-7/12-para-01-3cx-call-event-persistence.md | 12 | 01/01A | normal | aberto | sim | mesmo achado do 06-para-12 (schema de evento 3CX nunca implementado) | onda-13 |
| onda-7/12-para-06-fallback-whatsapp-informativo.md | 12 | 06 | normal | **resolvido (corrigido nesta onda)** | não (informativo) | handoff de aviso, nenhuma ação pendente | fechado |
| onda-7/12-para-07-gatilho-ligar-via-sdr-voz.md | 12 | 07 | alto | aberto | sim | decisão de produto pendente sobre travas de horário no gatilho de automação | onda-13 |
| onda-7/12-para-17-optout-unificado-voz.md | 12 | 17 | normal | aberto | incerto | módulo `cadence/optOut` existe hoje; não verificado se unifica voz+WhatsApp+e-mail de fato | onda-13 |
| onda-7/13-para-01-anomalia-visibilidade-entre-requestcontext-run.md | 13 | 01 | normal | resolvido | não (resolvido) | corrigido na Onda 9, commit `2616a4d1` | fechado |
| onda-7/13-para-01-consentimento-lgpd-por-titular.md | 13 | 01 | normal | aberto | sim | confirmado: nenhum campo de "consent"/base legal por titular no schema | onda-13 |
| onda-7/13-para-07-rota-slo-swarm.md | 13 | 07 | normal | aberto | sim | confirmado: rota `GET /api/agent/swarm/slo` ausente | onda-13 |
| onda-7/17-para-01-schema-cadencia-optout-proposta.md | 17 | 01/01A | alto | resolvido | não (resolvido) | schema aplicado na Onda 10 | fechado |
| onda-7/17-para-02-rota-cadencia.md | 17 | 02 | alto | resolvido | não (resolvido) | seção Resolução | fechado |
| onda-7/17-para-05-06-12-contrato-optout.md | 17 | 05,06,12 | bloqueador | resolvido | não (resolvido) | seção Resolução | fechado |
| onda-7/17-para-13-evento-fechamento.md | 17 | 13 | alto | **resolvido (corrigido nesta onda)** | não (já implementado) | `DealClosureEvent`/enum `DealClosureEventType` confirmados no schema atual | fechado |
| onda-8/02-para-00-decisao-gamificacao-xp.md | 02 | 00 | normal | resolvido | não (resolvido) | handoff de decisão de produto, registrado | fechado |
| onda-8/09-para-02-downloads-blob-nao-funcionam-no-app.md | 09 | 02 | alto | aberto | sim | limitação real de WebView Capacitor (`blob:` + `<a download>`), sem plugin nativo | onda-13 |
| onda-8/09-para-02-navigationbus-rotas-ausentes.md | 09 | 02 | normal | resolvido | não (resolvido) | seção Resolução | fechado |
| onda-8/09-para-02-offline-stale-state-ausente.md | 09 | 02 | alto | resolvido | não (resolvido) | seção Resolução | fechado |
| onda-8/09-para-02-voice-command-nao-funciona-no-app.md | 09 | 02 | alto | aberto | sim | limitação real: Web Speech API não existe em WebView Android/iOS | onda-13 |
| **onda-8/09-para-08-10-dominio-producao-e-verificacao-deep-link.md** | 09 | 08/10 | **bloqueador** | **aberto** | **sim (parcial)** | `capacitor.config.ts` já corrigido; `assetlinks.json`/AASA para domínio de produção **ausentes do repo** | **onda-13** |
| onda-8/18-para-00-relatorio-conformidade-handoffs.md | 18 | 00 | alto | resolvido | não (resolvido) | marcado resolvido na Fase Final 0 | fechado |
| onda-8/18-para-00-varredura-duplicacao-contratos.md | 18 | 00 | normal | em-andamento | sim (informativo) | handoff de triagem, já gerou os filhos `18-para-04-*` | fechado |
| onda-8/18-para-02-unificar-overviewmetrics-frontend.md | 18 | 02 | normal | resolvido | não (resolvido) | seção Resolução | fechado |
| onda-8/18-para-04-as-any-crm360-prisma-aggregate.md | 18 | 04 | alto | resolvido | não (resolvido) | seção Resolução | fechado |
| onda-8/18-para-04-duplicacao-commercial-intelligence-contract.md | 18 | 04 | normal | aberto | sim | 18 interfaces duplicadas entre domínio e API, sem import compartilhado | onda-13 |
| onda-8/18-para-04-unificar-overviewmetrics.md | 18 | 04 | normal | resolvido | não (resolvido) | seção Resolução | fechado |
| onda-8/18-para-08-ci-openapi-drift.md | 18 | 08 | alto | aberto | sim | `scripts/verify-openapi-drift.ts` existe mas não ligado a `package.json`/CI | onda-13 |
| onda-8/18-para-08-npm-run-docs-dependencia-ausente.md | 18 | 08 | normal | aberto | sim | `typedoc` ainda ausente de `devDependencies`, script `docs` quebrado | onda-13 |
| onda-8/18-para-12-as-any-birthvoice-webhook-response.md | 18 | 12 | alto | aberto | sim | `as any` confirmado em `birthVoice.service.ts:157` | onda-13 |
| onda-8/18-para-13-as-any-base-agent-langgraph.md | 18 | 13 | normal | aberto | sim | `as any` confirmado em `base.agent.ts:133` | onda-13 |
| onda-8/18-para-15-as-any-auditlog-reqattr.md | 18 | 15 | alto | aberto | sim | `as any` confirmado em `auditLog.middleware.ts` (linhas 6, 11) | onda-13 |
| onda-10/06-para-01-backfill-lead-owner.md | 06 | 01 | alto | aberto | sim | nenhum script de backfill encontrado; decisão sobre dado real de produção pendente | onda-13 |
| onda-11/02-para-00-server-ts-env.md | 02 | 00 | alto | **resolvido (corrigido nesta onda)** | não (já implementado) | `ENABLE_EMBEDDED_WORKERS` confirmado tipado em `src/config/env.ts:66` | fechado |
| onda-11/02-para-04-commercial-intelligence-types.md | 02 | 04 | alto | aberto | não (já implementado) | campos confirmados no domínio atual | fechado |
| onda-11/09-para-00-server-ts-tsc-error.md | 09 | 00 | alto | **resolvido (corrigido nesta onda)** | não (duplicado, já implementado) | mesmo achado do 02-para-00-server-ts-env, já corrigido | fechado |
| onda-11/09-para-04-commercial-intelligence-tsc-error.md | 09 | 04 | alto | **resolvido (corrigido nesta onda)** | não (duplicado, já implementado) | mesmo achado do 02-para-04, já corrigido | fechado |
| onda-D/08-para-00-qa-package-json.md | 08 | 00 | normal | resolvido | não (resolvido) | marcado resolvido, aprovação simples | fechado |
| onda-E/10-para-08-refatorar-dockerfile.md | 10 | 08 | alto | resolvido | não (resolvido) | seção Resolução | fechado |
| onda-G/05-para-04-whatsapp.md | 05 | 04 | alto | resolvido | não (resolvido) | superseded por `onda-2/05-para-04-whatsapp-consolidado.md` | fechado |
| onda-G/07-para-00-server-cron.md | 07 | 00 | alto | resolvido | não (resolvido) | seção Resolução | fechado |

## Resumo

- **Total**: 83 handoffs.
- **Bloqueador aberto e ainda válido**: 1 — `onda-8/09-para-08-10-dominio-producao-e-verificacao-deep-link.md`.
- **Corrigidos nesta onda** (status desatualizado → `resolvido`, com seção `## Resolução` própria
  citando a evidência): 9.
- **Válidos, sem bloqueador, destino onda-13**: 16.
- **Backlog pós-freeze** (válidos, não urgentes, não prometidos): 6.
- **Fechados** (resolvido/superado/informativo, nenhuma ação pendente): 58.
