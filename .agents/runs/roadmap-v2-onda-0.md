# Roadmap v2 — Onda 0 — Verdade Operacional e baseline atual

- **SHA base disponível:** `3f92c44b30f8665c9957a7d44e9b4067afb285f0`
- **Data/hora (UTC):** 2026-08-22T16:20:00Z
- **Branch de integração:** `integracao/roadmap-v2-onda-0`
- **Decisão:** **BLOCKED — correção P0/P1 designada para a Onda 1; nenhum release herdado é válido.**

## 1. Limites verificáveis do snapshot

O checkout entregue não contém ref local `main`, remote Git nem credencial `gh`: a única branch inicial era `work`, em `3f92c44b`, e `.git/config` só contém `[core]`. Portanto, a SHA acima é o snapshot materializado que o ambiente apresentou como estado atual, mas não foi possível provar que coincide com a `main` remota. `git fetch --all --prune` não tinha remote; consultas `gh repo/pr/issue/workflow/run` falharam pedindo `gh auth login`. Isso é **P0 de release**, não PASS: PRs abertos, issues, checks e resultado remoto do PR #241 permanecem não verificáveis neste ambiente.

O histórico local identifica como últimos commits: `3f92c44` (roadmap), `b7e1f78` (limpeza documental), `18f554d` (login), merges #229/#225 e mudanças de Market Intelligence `16145fa` (Hub Suitability), `5b7d553` (economics), `8790aec` (hiring gate/competition) e `6221ee8` (remoção de dados sintéticos). O checkpoint histórico `.agents/runs/final-fase-5.md` dizia `RELEASE APPROVED`, porém a reexecução abaixo invalida sua adoção automática.

## 2. Inventário externo solicitado

| Item | Estado real nesta execução |
|---|---|
| PRs abertos / PR #241 | Não verificável: checkout sem remote e GitHub CLI sem autenticação. |
| Issues abertas / issue #242 | Não verificável no GitHub; defeito reproduzido estaticamente no código local. |
| Status checks e runs | Não verificável remotamente pelo mesmo bloqueio. |
| Branches relevantes | Apenas `work` existia antes desta execução; nenhuma ref `main` ou remota. |
| Workflows locais | Presentes em `.github/workflows/**`; incluem quality, production, mobile, deploy, backup/security e ETLs de Market Intelligence. A atribuição a este repositório só pode ser provada após restaurar remote/metadados GitHub. |
| Handoffs | Sem bloqueador aberto identificado. Permanecem `onda-6/16-para-08-deploy-worker-service.md` (em andamento/alto), `onda-6/16-para-10-observabilidade-worker.md` (em andamento/normal) e `onda-8/18-para-00-varredura-duplicacao-contratos.md` (em andamento/normal). |

## 3. Baseline executado

Todos os comandos foram executados sem mutação intencional de fonte. Duração é wall clock em segundos.

| Comando | Exit code | Duração | Resultado / reprodução |
|---|---:|---:|---|
| `npx tsc --noEmit` | 0 | 47 s | PASS. |
| `npx eslint src` | 0 | 19 s | PASS; usado diretamente porque `npm run lint` contém `--fix`. |
| `npm run test:unit` | 124 | 500 s | FAIL: suíte deixou de produzir progresso e foi encerrada após ~8m20s; logs finais estavam em casos de Market Intelligence/tenancy. Reproduzir com o comando literal. |
| `npm run test:integration` | 1 | <1 s | FAIL no `pretest`: `prepare-integration-env.js` não conseguiu subir Postgres/Redis/Meilisearch; runtime não dispõe de `docker`. |
| `npm run test:e2e` | 1 | 1 s | FAIL no mesmo provisionamento obrigatório. |
| `npm run build` | 0 | 36 s | PASS; Vite e bundle do servidor concluíram. Há warning não bloqueante de chunks >500 kB. |

Os artefatos brutos foram resumidos neste relatório e removidos antes do commit para não versionar logs operacionais; nenhuma linha falha é alegada como sucesso. O gate W0 está vermelho.

## 4. Classificação

### P0

1. **Boot executa reset global no caminho normal:** `package.json` define `start` como `tsx scripts/emergency-reset-all-passwords.ts && node dist/server.cjs`. Mesmo condicionado à variável `EMERGENCY_RESET_ALL_PASSWORDS_PASSWORD`, qualquer configuração residual reseta credenciais de todos os usuários, revoga sessões e marca troca obrigatória em todo boot. A ação já tem comando explícito `auth:emergency-reset`; deve sair de `start` e permanecer one-shot deliberada.
2. **Estado remoto e checks não demonstráveis:** ausência de remote/ref `main` e autenticação GitHub impede separar checks deste projeto, revisar PRs/issues e provar a SHA remota. Release impossível até reconciliação em ambiente com acesso ao repositório real.
3. **Gate obrigatório inexequível/vermelho:** unit não termina; integration/E2E não provisionam dependências porque Docker não existe no ambiente. Teste não executado não é PASS.

### P1

1. **Issue #242 reproduzida localmente:** `src/components/ui/Dialog.tsx` aplica `flex flex-col` permanentemente ao `<dialog>`. A regra author CSS `[hidden]/dialog:not([open]) { display:none }` perde para `display:flex`, mantendo o dialog fechado visualmente renderizado. Dono: Agente 03 (definido por `src/components/ui/AGENTS.md`) para o componente; consumidores por seus donos via handoff, com regressão coordenada pelo 14/08. Consumidores inventariados: BugReportButton, CadenceHub, ExecutiveOverviewTab, GoalEditorDialog, CompanyForm, ContactForm e PropostaForm.
2. **CI localmente heterogêneo:** alguns workflows usam `npm ci`, outros `npm install --legacy-peer-deps`; vários jobs executam apenas gate parcial. Agente 08 deve reconciliar checks exigidos sem aceitar workflows de ETL/deploy externo como evidência do gate de código.
3. **Runtime/deploy pendente:** handoffs de worker/observabilidade continuam em andamento e precisam prova real na onda correspondente.

### P2

1. Warning de bundle com chunks acima de 500 kB.
2. Handoff normal de duplicação de contratos ainda em andamento.

## 5. Market Intelligence posterior ao último checkpoint materializado

O histórico local posterior e adjacente ao último checkpoint inclui Hub Suitability auditável (`16145fa`), economics versionado (`5b7d553`), hiring gate/competition (`8790aec`) e remoção de dados sintéticos (`6221ee8`). O snapshot contém ETLs/workflows para CNPJ/Receita, municípios/IBGE, SENATRAN, MDF-e/CIOT e Sinesp, além de manifestos/proveniência. Sem remote não é possível afirmar que este inventário cobre mudanças de PR ainda abertas; a Onda 6 deverá revalidar fontes, versões, granularidade territorial, White Space, economics e contratação fail-closed na SHA integrada.

## 6. Especialistas e matriz de propriedade — Onda 1

A matriz é publicada **antes** do disparo. A capacidade efetiva desta ferramenta é Coordenador + 3 especialistas; portanto a onda começa com 01, 14 e 08 em paralelo, cada um em branch/worktree exclusivo. 15 e 10 entram sequencialmente após liberação de slot.

| Agente | Missão | Propriedade permitida | Proibido/owner único |
|---|---|---|---|
| 01 | Remover reset global do boot, preservar ação explícita one-shot, testar auth/RBAC/tenant/reset. | `package.json`, `package-lock.json` (aprovação explícita do 00 concedida apenas para corrigir `start`), `scripts/emergency-reset-all-passwords.ts`, auth/data tests; schema/migrations se estritamente necessário. | `server.ts` permanece do 00; workflows são do 08. |
| 14 | Tornar baseline unit/integration/E2E reproduzível; diagnosticar hang sem mascará-lo; provar matriz de acesso e tenant. | `scripts/test/**`, configs Vitest/Playwright e testes de harness. | Não altera package/lock, workflows, server, schema/migrations. |
| 08 | Reconciliar CI/status checks deste repo e adicionar regressão/gates de segurança pertinentes. | `.github/workflows/**` e testes/checklists de release. | Não altera package/lock, server, schema/migrations. |
| 15 | Varredura aplicada: segredos, audit policy, PII/credenciais e evidência de rotação possível. | `scripts/security/**`, testes de segurança e documentação de segurança aplicável. | Não altera arquivos compartilhados sem handoff. |
| 10 | Boot/runtime real: reinício sem reset/worker duplicado, health/observabilidade. | infra/runtime docs e testes operacionais; `k8s/**`, `argocd/**`, `charts/**`, `infrastructure/**`. | `server.ts` reservado ao 00; package/lock do 01 nesta onda. |
| 03 (correção P1 programada) | Corrigir o primitive Dialog e coordenar validação de consumidores; a propriedade local exige 03, justificando redistribuição em relação à missão 02 da W4. | `src/components/ui/Dialog.tsx` e teste unitário do primitive; consumidores ficam com seus donos por handoff. | Sem package/lock, server, workflow ou schema. |

### Arquivos compartilhados e dono único

| Arquivo | Dono na W1 |
|---|---|
| `package.json`, `package-lock.json` | 01, com aprovação do 00 limitada à remoção do reset de `start`. |
| `server.ts` | 00; nenhum especialista edita sem novo handoff/aprovação. |
| `prisma/schema.prisma`, `prisma/migrations/**` | 01; 01A não executa nesta onda. |
| `.github/workflows/**` | 08. |
| `src/components/ui/Dialog.tsx` | 03, em subfase/slot posterior. |

Não há sobreposição de escrita entre os três primeiros especialistas. Dependência: 14 valida o comportamento produzido por 01; 08 consome comandos estabilizados por 14, sem editar os mesmos arquivos. 15/10 recebem o SHA após a primeira leva. O item Dialog é independente e pode ocupar o próximo slot, mas não será misturado à propriedade dos demais.

## 7. Ordem, integração, handoffs e gate W1

1. Leva inicial paralela: 01 + 14 + 08 em worktrees exclusivos.
2. Revisar propriedade e integrar 2–3 merges em `integracao/roadmap-v2-onda-1`.
3. Rodar gate completo na integração; se quebrar, identificar e reverter o merge introdutor.
4. Subfase: 15 + 10 + 03 conforme slots, novamente com worktrees exclusivos; integrar em levas de no máximo 3.

Handoffs previstos: 14→08 para qualquer mudança de workflow necessária; 10→00 para eventual alteração de `server.ts`; 15→01 para rotação/armazenamento de credencial; 03→14 para regressão funcional do Dialog. Nenhum handoff bloqueador mútuo existe antes do disparo.

Gate mínimo da W1:

```bash
npx tsc --noEmit
npx eslint src
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
npm run security:audit-waivers
# gitleaks no diff acumulado (ou busca manual documentada se binário indisponível)
```

**Condição exata de aprovação:** reset global ausente de `npm start`; comando emergencial explícito, deliberado e testado; auth/RBAC/tenant e reinício cobertos; zero segredo positivo; checks do repositório reconciliados; todos os comandos do gate com exit 0 em ambiente real; zero handoff bloqueador; branches revisadas e integradas em levas. Até isso, a decisão permanece BLOCKED.
