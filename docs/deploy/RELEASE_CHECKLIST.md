# Checklist de pré-release

Este documento é o runbook manual para rodar antes de um release para produção — passos que não
fazem parte do gate automático do `ci.yml` (build-and-test, em todo push/PR) nem do job agendado
`security-trivy.yml` (semanal). Ver decisão completa em
`.agents/handoffs/onda-6/15-para-08-zap-trivy-gate.md`.

## 1. Gate automático (já cobre isto — não repita manualmente)

- `.github/workflows/ci.yml` → job `build-and-test`: lint, typecheck, testes unitários, testes de
  integração, testes E2E, `npm audit --audit-level=high` (não bloqueia — `continue-on-error`,
  débito conhecido do `better-auth`), build.
- `.github/workflows/security-trivy.yml` → scan de filesystem/dependências (`npm run
  security:trivy`), semanal, não bloqueia PR. Ver o Job Summary da última execução em Actions
  antes de um release para conferir se há achado HIGH/CRITICAL não triado.

## 2. `security:zap` — scan dinâmico contra staging (manual, antes de todo release)

`npm run security:zap` roda `zap-api-scan.py` contra
`http://host.docker.internal:3000/api-docs/openapi.yaml` — **precisa de uma instância real da
aplicação já no ar**, não roda contra código estático. Por isso não está em nenhum CI automático
(handoff `15-para-08-zap-trivy-gate.md`): não há alvo efêmero criado por push/PR neste projeto, e
subir a stack completa só para o scan tornaria todo PR minutos mais lento sem ganho — o valor real
do ZAP é escanear o comportamento HTTP real, então rode contra staging (ou uma instância local
apontando pro banco de staging/homolog), nunca contra produção diretamente na primeira vez.

Passo a passo:

1. Garanta que a instância alvo está no ar e acessível a partir de onde o container do ZAP vai
   rodar. Local contra staging: ajuste o comando abaixo (variável de URL) ou rode a stack local
   (`npm run docker:up` / `npm run infra:up`) se o alvo for esta máquina.
2. Rode:
   ```
   npm run security:zap
   ```
   Isso baixa/roda `ghcr.io/zaproxy/zaproxy:stable` via `docker compose --profile tools`, contra
   `host.docker.internal:3000` (ver `docker-compose.opensource.yml`, serviço `zap`). Se o alvo for
   staging (não `localhost:3000`), edite temporariamente o `-t` do comando no compose (ou rode o
   comando `zap-api-scan.py` diretamente apontando pra URL de staging) — não versione essa mudança
   de alvo, é uma execução manual pontual.
3. O relatório sai em `reports/zap-report.html` (volume montado pelo serviço `zap`).
4. Triagem: qualquer achado `FAIL-NEW`/`WARN-NEW` de severidade alta precisa ser investigado antes
   do release — abra um handoff se não for possível corrigir na mesma rodada, não ignore
   silenciosamente. Achados repetidos de execuções anteriores já triados podem ser confirmados
   como aceitos (documentar no próprio handoff/PR do release, não neste arquivo).

## 3. Regressão visual (`tests/e2e/visual.spec.ts`)

Enquanto `tests/e2e/visual.spec.ts` estiver em `describe.skip` (baseline Linux ainda não gerada —
ver `.agents/handoffs/onda-6/14-para-08-baselines-visuais-linux.md` e o job manual
`visual-baselines` em `ci.yml`), não há cobertura automática de regressão visual pixel-a-pixel.
Antes de um release com mudança visual relevante, rode uma verificação manual: abra as telas-chave
(dashboard, pipeline CRM) em light e dark e compare visualmente contra o release anterior. Depois
que a baseline Linux for gerada e commitada, este passo volta a ser automático via
`npm run test:e2e` no job `build-and-test`.

## 4. Antes de aprovar o release

- [ ] `build-and-test` verde na branch/PR do release.
- [ ] Última execução de `security-trivy.yml` sem achado HIGH/CRITICAL não triado (ou triado e
      documentado).
- [ ] `npm run security:zap` rodado contra staging nesta rodada de release, sem achado alto não
      triado.
- [ ] Regressão visual conferida (automática, se a baseline já existir; manual, enquanto não
      existir — ver seção 3).
- [ ] `docs/security/SECURITY_GUIDE.md` conferido para nenhum risco aceito ter mudado de
      classificação desde a última leitura.
