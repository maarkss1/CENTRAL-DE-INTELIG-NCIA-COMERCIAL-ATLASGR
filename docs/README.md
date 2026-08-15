# Documentação do PROSPECTOR-ATLASGR

## Contrato de API

- [OpenAPI (docs/openapi.yaml)](openapi.yaml) — servido em `/api-docs` (fora de produção por
  padrão, ou em qualquer ambiente com `EXPOSE_API_DOCS=true`). Verificação automatizada de deriva
  estrutural entre este documento e as rotas reais: `npm run verify:openapi-drift` (ver
  `scripts/verify-openapi-drift.ts`).

## Arquitetura

- [Matriz de arquitetura](architecture/MATRIZ_ARQUITETURA.md)
- [Classificação de features](architecture/FEATURE-CLASSIFICATION.md)
- [Auditoria SDR de Voz e opt-out](architecture/SDR_VOZ_AUDITORIA_E_OPT_OUT.md)
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

- [Guia de produção completo](deploy/producao.md) — Supabase, Render, Cloudflare, CI/CD, checklist e roadmap
- [Deploy no Render](deploy/render.md)
- [Checklist de release](deploy/RELEASE_CHECKLIST.md)
- [Plano Diretor de 100 Passos — encerramento](ROADMAP-100-STEPS-COMPLETE.md) — registro
  histórico de 12/08/2026; leia a partir da seção "Ressalva de 2026-08-15" antes de tratar
  `1.0.0-RELEASE-APPROVED` como status atual. O estado de release vivo é
  `.agents/completion/01-bloqueadores.md`.

## Compliance

- [Matriz de compliance](compliance/COMPLIANCE_MATRIX.md)

## Relatórios

Consulte o [índice de relatórios](reports/README.md) — registros históricos de sessões
passadas, agrupados por tema. A fonte de verdade atual sobre dívida técnica é a
[auditoria de dívida técnica](auditoria-divida-tecnica/).

## Governança desta pasta

- [`docs/AGENTS.md`](AGENTS.md) — dono e regras de edição de `docs/**`.
