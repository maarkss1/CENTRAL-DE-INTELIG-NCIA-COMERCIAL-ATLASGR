# Roadmap v2 — Onda 2 — Operação comercial (CRM/BI, Prospecção, IA/Automações)

- **SHA base:** `599668b2de111758faa620fc6eb64a1de2787ca6` (`origin/main`)
- **Data/hora (UTC):** 2026-08-26
- **Branch de integração:** `integracao/roadmap-v2-onda-2`
- **Decisão de reavaliação da Onda 1:** BLOCKED **removido**. Ver seção 1.

## 1. Reavaliação da Onda 1 (por que BLOCKED foi removido sem reexecutar aquele sandbox)

`roadmap-v2-onda-1.md` (22/08/2026) foi produzido num ambiente isolado sem remote Git, sem
autenticação GitHub, sem Docker e sem `gitleaks`. Os SHAs de commit citados nesse relatório
(`b89eaf8`, `03e1fe1`, `a4d602d`, `e5252d5`, `60b40a6`, `aec52ad`, `8fd2f99`, `fa025d0`, `6804a9a`)
não existem em nenhum lugar do histórico real deste repositório — confirmado via
`git log --all --oneline` e `git merge-base --is-ancestor` contra `origin/main`. Aquele trabalho
nunca chegou ao GitHub; é um ramo órfão de um sandbox descartado, não uma tentativa real deste
repositório.

Reavaliação de cada condição de aprovação de W1 (`roadmap-v2-onda-1.md`, seção "Condição para
retomar e aprovar W1"), contra o estado real de hoje:

| Condição | Estado em 22/08 (sandbox isolado) | Estado real agora |
|---|---|---|
| Remote/autenticação GitHub | Ausente (P0, onda-0) | Disponível — usado extensivamente nesta sessão (merge de 16 PRs da campanha de dívida técnica, reconciliação de checks) |
| Reset global no boot (`npm start`) | Presente (P0, onda-0) | Corrigido — `package.json` → `"start": "node dist/server.cjs"`, sem reset acoplado |
| Bug do `Dialog` (issue #242, P1 onda-0) | Presente | Corrigido — `src/components/ui/Dialog.tsx` usa `open:flex open:flex-col` |
| `tsc --noEmit` / `eslint src` / `test:unit` / `test:integration` / `test:e2e` / `build` | Não executável no sandbox (sem Docker) | Verde na CI real (GitHub Actions, workflow "Central AtlasGR Release"), confirmado nos commits `335ddba` e `599668b` desta sessão, incluindo Integration/E2E via service containers reais (Postgres/Redis/Meilisearch) |
| `npm run security:audit-waivers` | Falhou fechado (registry 403 local) | Roda dentro do job `build-and-test` da CI real (runner com acesso de rede íntegro), já verde |
| Gitleaks no diff acumulado | Binário ausente localmente | Roda como job obrigatório `secret-scan` (gitleaks-action) que gateia o job agregador `build`, já verde |
| Zero handoff `Status: aberto` + `Prioridade: bloqueador` | Não verificado | Verificado nesta reavaliação: `grep` por ambos os campos não encontrou nenhum handoff real aberto e bloqueador (os 2 matches iniciais eram falso-positivo — texto citando um handoff antigo já superseded dentro do corpo de outro handoff já resolvido) |
| Checks/PRs/issues reconciliados | Não verificável (P0, onda-0) | Reconciliado nesta sessão: nenhum PR aberto da campanha de dívida técnica; `main` confirmado verde via `actions_list` |

**Conclusão:** as condições de bloqueio de W1 eram reais para o ambiente isolado em que foram
observadas, mas não se aplicam ao repositório real, que já satisfaz o gate mínimo de W1 via CI.
Este ambiente também não tem Docker/gitleaks localmente (mesma limitação), mas isso não é decisivo
porque o gate autoritativo é a CI do GitHub, protegida por branch protection, não a execução local
de um sandbox — e essa CI já está verde no SHA base acima.

Débito técnico P0/P1 remanescente de `roadmap-v2-onda-0.md` não coberto por este ciclo (fora do
escopo dos 3 agentes desta onda, registrado para continuidade): reconciliação formal de
`.dependency-cruiser-known-violations.json`/hotspots (ITEM-13, já em produção via ITEM-13 da
campanha de dívida técnica) e decisão humana pendente sobre reescrita de histórico do dump legado
em `backups/` (ver `/AGENTS.md` → "Segurança e higiene" — decisão humana explícita, não automática
de agente).

## 2. Escopo da Onda 2 (Freeze de escopo em vigor)

Conforme `/AGENTS.md` → "Freeze de escopo (Sprint 00 → Sprint 13)": nenhuma feature nova fora de
promessa já existente. Esta onda é **auditoria fail-closed com correção no próprio escopo**
("Proibição de auditoria sem correção") dos três domínios abaixo contra:

- os critérios de parada de `EXECUCAO-ONDAS.md` → Onda 2 (forecast sem rastreabilidade; owners
  fictícios; provider com erro silencioso; RAG cross-tenant; ferramenta de IA inacessível;
  automação sem histórico/status; dado pessoal enviado a IA sem consentimento registrado);
- os itens aplicáveis de `/AGENTS.md` → "Bloqueadores prioritários";
- a responsabilidade LGPD do próprio domínio, listada em `/AGENTS.md` → "LGPD e dados pessoais".

## 3. Especialistas e matriz de propriedade (publicada antes do disparo)

| Agente | Missão | Pastas de propriedade (owner único, confirmado via `AGENTS.md` local de cada pasta) |
|---|---|---|
| 04 — CRM e BI | Auditar pipeline CRM, BI executivo e dados de contato/atividade quanto a forecast rastreável, owners reais e dado pessoal com proveniência/exposição controlada em relatórios agregados. | `src/features/companies/`, `src/features/crm/`, `src/features/contacts/`, `src/features/activities/`, `src/features/calendar/`, `src/features/commercial-intelligence/`, `src/features/analytics/` |
| 05 — Prospecção | Auditar prospecção e enriquecimento quanto a provider com erro silencioso, proveniência e rotulagem inferido-vs-confirmado, sem enriquecer além do necessário. | `src/features/prospecting/`, `src/lib/enrichment/` |
| 07 — IA e Automações | Auditar ferramentas de IA, automações, RAG/knowledge e filas quanto a acessibilidade real das ferramentas, RAG cross-tenant, automação sem histórico/status e consentimento explícito antes de enviar dado pessoal a provedor de IA externo. | `src/features/intelligence/`, `src/features/roleplay/`, `src/features/knowledge/`, `src/features/automations/`, `src/lib/ai/`, `src/lib/queue/` |

Propriedade disjunta confirmada — nenhuma pasta acima é compartilhada entre os três agentes, e
nenhuma delas é um arquivo de propriedade exclusiva de outro agente (`prisma/schema.prisma`,
migrações, `server.ts`, `package.json`/lockfile, `.github/workflows/**`, `App.tsx`/Sidebar,
`k8s/**`/`argocd/**`/`charts/**`/`infrastructure/**`, `android/**`, `identidade-visual/**`).
Qualquer achado fora da própria pasta vira handoff (`.agents/handoffs/roadmap-v2-onda-2/`), nunca
edição direta.

Isolamento: cada agente roda em `git worktree` + branch própria (`agente/04-crm-bi`,
`agente/05-prospeccao`, `agente/07-ia-automacoes`), a partir de `integracao/roadmap-v2-onda-2`.

## 4. Gate mínimo da W2

```bash
npx tsc --noEmit
npx eslint src
npm run test:architecture
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
npm run verify:integrations
npm run verify:ai
```

Rodado por leva (2–3 merges) na branch de integração, nunca acumulando os três merges para um
único gate final.

## 5. Status

Onda disparada nesta data. Relatório final de integração (achados, correções, evidência de gate)
será registrado em atualização deste mesmo arquivo ao final da onda.
