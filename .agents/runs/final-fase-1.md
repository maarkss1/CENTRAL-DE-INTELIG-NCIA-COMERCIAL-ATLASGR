# Fase Final 1 — Gate Único de Release

- Data: 2026-08-16
- Executor: Agente 00 (Coordenador)
- SHA de entrada: `0d55a99b` (main), com Fase Final 0 ainda REPROVADA em paralelo (PR #139, ver
  `.agents/runs/final-fase-0.md` na branch `claude/security-governance-phase-final-dfdpvk`) — decisão
  explícita do dono do repositório de avançar a Fase 1 sem esperar a rotação de credenciais, risco
  residual aceito e registrado.
- Status desta entrega: **PASSO 1-2 concluídos (inventário + comparação). Remediação ainda NÃO
  aplicada** — aguardando confirmação do dono antes de editar `.github/workflows/**` (mudança de
  infraestrutura de CI/CD compartilhada, alto raio de impacto).

## 0. Leitura obrigatória — feita

`/AGENTS.md` inteiro; `.agents/prompts/00-coordenador.md`; prompts `08-qa-release.md`,
`14-ambiente-execucao-harness.md`, `15-seguranca-aplicada.md`, `18-contratos-api-docs.md`,
`19-verificacao-continua.md`; todos os 14 arquivos em `.github/workflows/`; handoffs
`Status: aberto`/`em-andamento` relacionados a CI/CD/release/deploy/gate; `.agents/completion/**`
(confirmado: nenhum mapa de workflows prévio existe para reaproveitar); `package.json` (scripts de
verificação).

## 1. Mapa de workflows — ANTES (estado real, não suposição)

14 workflows em `.github/workflows/` (a missão original citava "15" — recontagem confirma 14).
Nenhum workflow declara dependência (`needs:`/`workflow_call`) sobre outro workflow — GitHub Actions
trata cada arquivo como pipeline independente por padrão.

### Caminhos que efetivamente PUBLICAM artefato (os que importam para o gate de release)

| Workflow | Dispara em | Testes/gates antes de publicar | Publica |
|---|---|---|---|
| `production.yaml` (job `publish`) | `push main` | Job interno `build-and-test` **próprio e mais fraco** que `ci.yml`: lint, typecheck, unit, migrations, integration — **sem E2E**; `npm audit --audit-level=high` com `continue-on-error: true` (`production.yaml:84`) | Imagem Docker no GHCR (`:latest` + `:sha`) |
| `cd-homolog.yml` | `push develop` | **NENHUM** — checkout → build imagem → push → edita `charts/prospector-atlas/values.yaml` → commit direto | Imagem Docker no GHCR + config Helm |
| `deploy-pages.yml` | manual (`workflow_dispatch`) | **NENHUM** | GitHub Pages |
| `android-build.yml` / `ios-build.yml` | `push main` | **NENHUM** (não roda lint/typecheck/test antes do build) | Artifact de app (APK debug / xcarchive) |

### Caminhos que só VALIDAM (não publicam)

`ci.yml` (o mais completo: secret-scan, lint, typecheck, unit+coverage, migrations, integration+coverage,
**E2E**, build — mas `npm audit continue-on-error: true` em `ci.yml:107`), `qualidade-ci.yml`
(lint+typecheck+unit, node 20, redundante com parte de `ci.yml`), `playwright-ci.yml` (E2E, redundante
com o E2E já dentro de `ci.yml`), `sonarqube.yml` (análise estática, scan pulado silenciosamente sem
`SONAR_TOKEN`), `security-trivy.yml` (só `schedule` semanal, `continue-on-error: true` deliberado, não
roda em push/PR), `onda-2.5-validation.yml` (só PR para branch histórica `validation/onda-2.5-base`,
fora do caminho de `main`), `market-intelligence-*.yml` (escopo restrito a feature branch específica).

## 2. Achado central — DEVOPS-001 confirmado como real e sem handoff registrado

O caminho que efetivamente decide o que roda em produção (`production.yaml`, publica em `push main`)
**não depende de `ci.yml` passar**. O próprio arquivo já documenta isso
(`production.yaml:20-23`, comentário `DEVOPS-001`): *"este job é o gate real de quem decide publicar
em produção; workflows são independentes entre si, então o `ci.yml` passar não impede este arquivo de
publicar uma imagem com teste quebrado se este job não rodar os testes."* O problema é conhecido pelo
autor do arquivo, mas **nunca foi corrigido nem virou handoff formal** — nenhum arquivo em
`.agents/handoffs/**` cita "gate único" ou "múltiplos caminhos de publicação".

Pior ainda: `cd-homolog.yml` (branch `develop`) publica imagem + atualiza Helm/config de deploy **sem
rodar absolutamente nenhum teste, lint ou secret scan**. `deploy-pages.yml`, `android-build.yml` e
`ios-build.yml` têm o mesmo problema em menor escala (menor blast radius, mas mesma ausência de gate).

Isso é exatamente o cenário que `/AGENTS.md:267` já cadastra como bloqueador prioritário nº14
("release que publique artefato sem depender dos gates mandatórios") e que a missão da Fase Final 1
existe para fechar.

## 3. Handoffs abertos relevantes (não resolvidos nesta entrega, listados para rastreio)

- `onda-8/18-para-08-ci-openapi-drift.md` (alto) — verificação de deriva OpenAPI pronta, não plugada
  no CI.
- `onda-8/18-para-08-npm-run-docs-dependencia-ausente.md` (normal) — `npm run docs` quebrado
  (`typedoc` ausente).
- `onda-8/09-para-08-10-dominio-producao-e-verificacao-deep-link.md` (bloqueador, mas de escopo Fase
  Final 5/mobile, não desta fase).
- `onda-6/16-para-08-deploy-worker-service.md` (alto, em-andamento) — toca Fase Final 2, não esta.
- `onda-6/14-para-08-baselines-visuais-linux.md` (normal, em-andamento) — depende de execução manual
  do job `visual-baselines`.

## 4. Scripts de verificação — confirmados presentes

`verify:integrations`, `verify:ai`, `verify:prod`, `test:containers`, `setup:db:check`,
`security:trivy`, `security:zap` — todos os 7 existem em `package.json`. Nenhum gap de script ausente
nesta fase.

## 5. Plano de remediação proposto (NÃO aplicado ainda — aguardando confirmação)

1. **`production.yaml`**: fazer o job `publish` depender (`needs:`) do mesmo conjunto de gates de
   `ci.yml` (incluindo E2E) em vez de manter um subconjunto próprio mais fraco — ou substituir o job
   `build-and-test` interno por um `workflow_call` para o job equivalente de `ci.yml`, eliminando a
   duplicação/divergência. Remover `continue-on-error` do `npm audit --audit-level=high` ou substituir
   por waiver formal e documentado (ver item 4).
2. **`cd-homolog.yml`**: adicionar o gate mínimo (secret scan, lint, typecheck, unit, integration,
   build) como pré-requisito (`needs:`) antes do job `build-and-push` — hoje publica em `develop` sem
   nenhuma verificação.
3. **`deploy-pages.yml`**, **`android-build.yml`**, **`ios-build.yml`**: adicionar gate mínimo
   (typecheck + lint + unit, no mínimo) antes de gerar artifact/publicar — proporcional ao risco de
   cada um (Pages e builds mobile têm blast radius menor que a imagem Docker de produção, mas não
   deveriam ser zero-gate).
4. **HIGH/CRITICAL de segurança sem waiver**: `npm audit continue-on-error: true` aparece em 3
   workflows (`ci.yml:107`, `production.yaml:84`) com a mesma justificativa ("better-auth pendente
   upstream"). Formalizar isso como waiver documentado (arquivo dedicado, ex.
   `docs/security/AUDIT_WAIVERS.md`, com CVE, motivo, prazo de reavaliação) em vez de
   `continue-on-error` silencioso — cumprindo `/AGENTS.md`/prompt do 00: *"HIGH/CRITICAL de segurança
   não pode ser ignorado por continue-on-error sem waiver explícito, documentado e aprovado."*
5. Consolidar `qualidade-ci.yml` e `playwright-ci.yml` — hoje duplicam trabalho que `ci.yml` já faz
   (lint/typecheck/unit e E2E respectivamente) em jobs separados com Node 20 vs Node 22 divergente
   (`qualidade-ci.yml` usa Node 20, os demais Node 22) — decidir se isso é redundância proposital
   (segunda opinião) ou débito a remover.
6. Depois de aplicado: rodar os **testes negativos obrigatórios** da fase (forçar falha controlada de
   typecheck/unit/integration/E2E/migration/secret-scan/build num branch de teste e provar que o
   caminho de publicação bloqueia) e então acionar o Agente 19 para o veredito final.

## 6. Veredito desta entrega

**Fase Final 1: EM ANDAMENTO — diagnóstico completo, remediação pendente de confirmação.**

Não é possível declarar APROVADA ainda: a remediação (itens 1-5 acima) não foi implementada, os
testes negativos obrigatórios não foram executados, e o Agente 19 não rodou o gate completo sobre o
estado remediado. Nenhum P0 de código foi corrigido nesta entrega — este documento é o mapa "antes"
exigido pelo Passo 1-2 da missão.
