# Onda Zero — Inventário e Verdade do Sistema

- Data: 2026-08-13/14
- Executor: Fable Ultracode (Chief Platform Completion Orchestrator) + 5 subagentes read-only
- Método: 5 agentes de inventário (backend, frontend, integrações/IA, testes/infra, segurança/LGPD),
  ~880k tokens, 312 leituras de ferramenta, resultado estruturado por item com evidência arquivo:linha.
- JSON completo: journal do workflow `wf_5136c0e1-909` (sessão), resumo dos bloqueadores abaixo.

## Estado geral encontrado

A plataforma está substancialmente mais madura do que as auditorias anteriores descrevem:

- **RBAC**: unificado numa fonte única (`src/lib/auth/authorization.ts`), consumida por backend E
  frontend. Sem duplicação hoje. Hierarquia ADMIN>GESTOR>VENDEDOR>VISUALIZADOR com fail-closed
  (`UNVERIFIED_ROLE`).
- **Tenancy**: 3 camadas reais — RLS Postgres com FORCE, extensão Prisma (set_config por transação),
  e injeção de organizationId. Exceções pontuais encontradas e corrigidas/encaminhadas (SQL cru fora
  de contexto em vectorStore/whatsappMessage/cold-leads-scanner; webhook voice-result).
- **Autenticação**: Better Auth com cookies seguros, allowlist de domínio corporativo aplicada no
  SERVIDOR (hooks de create/update), role com input:false (anti-autopromoção). Nenhum bypass ativo
  (ALLOW_DEV_AUTH_BYPASS é flag morta, sem consumidor).
- **Frontend**: das 27 rotas declaradas, todas existem e renderizam com dados reais (exceções
  pontuais: sino de notificações cenográfico, aba Tutoriais do guia Bitrix, gamificação efêmera).
- **Bitrix24**: os dois P0 da auditoria BITRIX24-LEAD-FLOW-AUDIT.md (fieldMap morto, paginação)
  já estavam resolvidos no código atual; webhook inbound com token por conexão + timingSafeEqual.
- **Testes**: pirâmide real — 95 arquivos/650 testes unit, 12/43 integração (contra Postgres real
  NOSUPERUSER exercitando RLS), E2E Playwright com specs de auth/CRM/a11y.
- **Workers**: ~14 workers BullMQ + 1 cron rodam DENTRO do processo HTTP (mitigado por
  queuesEnabled/graceful shutdown; separação de runtime é débito arquitetural conhecido, não
  bloqueador imediato).

## Classificação por domínio (resumo)

| Domínio | PRONTO | FUNCIONAL_COM_DEBITO | PARCIAL/QUEBRADO/MOCKADO |
|---|---|---|---|
| Backend/arquitetura | pipeline HTTP, auth, RBAC, rate limits, webhooks birth-voice/bitrix, resiliência sem Redis | tenancy (exceções raras), filas (retry desigual), workers in-process | webhook voice-result (quebrado — corrigido nesta onda) |
| Frontend/produto | 24+ rotas com dados reais, estados loading/empty/error consistentes | RBAC de menu (settings), useActivities deps | sino de notificações, tutoriais Bitrix, gamificação efêmera, crm360 órfão |
| Integrações/IA | fluxo Bitrix moderno, WhatsApp/Baileys, birth-voice webhook | enriquecimento (retry/honestidade), consentimento LGPD p/ IA | RAG vectorStore sem RLS (sempre vazio em prod), cold-email fake-success |
| Testes/CI/infra | ci.yml completo (lint/tsc/unit/integration/e2e/build), suíte real | render.yaml sem migrations no deploy | qualidade-ci/playwright-ci quebrados, GitOps morto, Pages público |
| Segurança/LGPD | criptografia de credenciais em repouso, RLS, auditoria de mutações | /metrics sem auth (flag), LGPD delete sem RBAC | segredos reais versionados (Bland, Bitrix×2), PII em scripts, dump no histórico |

## Bloqueadores priorizados (45 achados, 8 bloqueadores/altos de segurança)

Ver `01-bloqueadores.md`.
