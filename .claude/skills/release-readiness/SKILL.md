---
name: release-readiness
description: Use quando a pergunta for "está pronto para produção?", "podemos lançar?", ou equivalente — visão de fechamento que agrega bloqueadores reais de funcionalidade, segurança, integrações, dados, testes, build, environment, observabilidade e deploy. Nunca declara "pronto" só porque lint/typecheck/build passam.
---

# Release Readiness — Central de Inteligência Comercial ATLASGR

## Quando usar

Ative esta skill quando a pergunta for sobre prontidão de produção no nível do produto inteiro ou
de um módulo inteiro ("o CRM está pronto para produção?", "podemos lançar o módulo de
automações?", "o que falta pra ir pra prod?"). Para uma funcionalidade específica ("o botão X
funciona?"), use `functional-completeness` + `end-to-end-flow-validator` primeiro — esta skill
consome os resultados delas, não os substitui.

## Missão

Determinar objetivamente se a plataforma (ou o módulo em questão) está pronta para produção,
produzindo uma lista de bloqueadores classificados por severidade — não uma opinião. Esta skill é
a **visão de fechamento** da camada Platform Completion:

```
release-readiness (fechamento)
        ├── functional-completeness   (a feature está completa ponta a ponta?)
        │       └── end-to-end-flow-validator  (a jornada inteira funciona?)
        ├── integration-audit         (as integrações externas são confiáveis?)
        ├── api-contracts             (o contrato UI↔backend↔banco é consistente?)
        ├── database-integrity        (o schema/dados aguentam produção?)
        └── error-resilience          (falhas são visíveis e recuperáveis?)
```

Para um veredito real, rode (ou delegue) as skills de domínio relevantes ao escopo perguntado antes
de agregar — não estime bloqueadores de integração sem ter passado por `integration-audit`, por
exemplo.

## Antes de editar

Esta skill é **auditoria por padrão**, não implementação. Comece sempre em modo leitura:
`DESIGN_QA_CENTRAL_ATLASGR.md` (débito visual já mapeado — não é o escopo desta skill, mas evita
reportar um problema visual como se fosse funcional), `BITRIX24-LEAD-FLOW-AUDIT.md` (auditoria real
já feita da integração Bitrix24, com achados classificados `P0`-`P4` e evidência `arquivo:linha` —
não reaudite Bitrix do zero, leia esse documento primeiro e só adicione o que mudou desde
2026-08-09), `PRODUCT_EXPERIENCE_CENTRAL_ATLASGR.md` (gaps de UX/produto já identificados),
`REMEDIACAO_FINAL_PROSPECTOR_ATLASGR.md` (o que já foi corrigido — não reporte como bloqueador algo
já remediado ali; verifique o estado atual antes de citar). Só edite código se o usuário pedir
explicitamente uma correção pontual depois do relatório — a entrega padrão desta skill é o
relatório de bloqueadores, não um PR.

## Investigação

Percorra estas frentes, citando arquivo real por achado:

- **Funcionalidades**: delegue a `functional-completeness`/`end-to-end-flow-validator` para
  qualquer feature em dúvida.
- **Segurança**: `src/shared/middlewares/authenticateToken.ts`, `requireRole.ts`,
  `src/lib/auth/authorization.ts` (RBAC canônico — 4 papéis `ADMIN`/`GESTOR`/`VENDEDOR`/
  `VISUALIZADOR`, hierarquia numérica). **Checagem específica deste projeto**: autenticação e RBAC
  não são aplicados por router — são montados centralmente em `server.ts`
  (`app.use('/api/leads', authenticateToken, requireTenant, leadRoutes)`). Um router novo que não
  foi adicionado a essa lista fica **sem autenticação**, silenciosamente. Ao auditar segurança,
  sempre confira `server.ts` contra a lista real de `src/features/*/routes/*.routes.ts` — não
  assuma que todo router está protegido só porque routers "irmãos" estão. Rotas de webhook
  (`birth-voice`, `3cx`, `bitrix` webhook) são montadas *antes* de `authenticateToken` de propósito
  — não as marque como bug, mas confirme que cada uma valida a origem/assinatura do provedor por
  outro meio.
- **Integrações**: delegue a `integration-audit`.
- **Dados/migrations**: delegue a `database-integrity`. Verificação rápida de bloqueador: rodar
  `npx prisma migrate status` (ou equivalente) contra o ambiente alvo — migration pendente em
  produção é `BLOCKER` por definição.
- **Testes**: `npm run lint`, `npx tsc -b --noEmit`, `npm run test:unit`, `npm run test:integration`
  (exige Postgres com role `NOSUPERUSER` + Redis — ver `scripts/db/bootstrap-app-role.sh` e
  `.github/workflows/ci.yml`), `npm run test:e2e` (Playwright sobe o servidor Express real via
  `start:e2e`, não `vite preview` — os specs fazem signup/login/CRUD reais). Teste que não roda por
  limitação de ambiente é um **bloqueio a registrar**, não um "passou implicitamente" — mesmo
  protocolo de `visual-qa/SKILL.md` seção "Quando não há navegador/suíte disponível", aplicado aqui
  a testes de backend/integração.
- **Build**: `npm run build` (Vite build + esbuild do `server.ts` para `dist/server.cjs`).
- **Environment**: `.env.example` como inventário de variáveis esperadas — para cada integração
  ativa (ver `integration-audit`), confirme se a env var correspondente tem um caminho de falha
  claro quando ausente (erro explícito na inicialização) vs. falha silenciosa em runtime.
- **Observabilidade**: `src/lib/logger.ts` (pino), `src/shared/middlewares/observability.ts`,
  `@opentelemetry/*`, `prom-client`, `langfuse` (observabilidade de LLM). Pergunte: um erro em
  produção gera log estruturado com `correlationId` rastreável, ou só um `console.error` solto? Ver
  `error-resilience`.
- **CI/CD**: `.github/workflows/ci.yml` (pipeline completo: lint → typecheck → unit → migrate
  deploy → integration → e2e → build, com Postgres `pgvector/pg15` + Redis reais). **Achado
  arquitetural a verificar, não assumir resolvido**: `production.yaml`/`cd-homolog.yml` duplicam a
  etapa de teste de forma independente do `ci.yml` — os workflows não bloqueiam uns aos outros por
  construção do GitHub Actions. Confirme se existe branch protection real exigindo o `ci.yml`
  passando antes de merge, ou se um merge para `main`/`develop` pode disparar `production.yaml`
  mesmo com `ci.yml` vermelho.
- **Deploy/rollback**: `Dockerfile` (multi-stage, usuário não-root) → GHCR → ArgoCD
  (`argocd/application-production.yaml`, `application-homolog.yaml`, sync automático com
  `prune`+`selfHeal`) → `charts/prospector-atlas` (Helm) → `k8s/` (`api-deployment.yaml` com
  `readinessProbe`/`livenessProbe` reais em `/health/ready` e `/health/live`, este último faz
  `SELECT 1`). **Pergunta em aberto a investigar, não assumir**: migrations rodam automaticamente
  no deploy real (K8s/ArgoCD) ou dependem de um passo manual/job separado? O `Dockerfile` só roda
  `npm run start` (`node dist/server.cjs`), sem `prisma migrate deploy` embutido — confirme onde
  esse passo realmente acontece antes de declarar migration como não-bloqueadora. `render.yaml`
  existe como alvo secundário (Render.com, tier free) e documenta explicitamente que
  `preDeployCommand` de `prisma migrate deploy` está **comentado/desativado** nesse caminho — trate
  Render como legado/secundário, não como o caminho real de produção, mas cite se for relevante ao
  escopo perguntado.

## Processo de execução

1. Rode um grep amplo por sinais de trabalho inacabado antes de aprofundar manualmente:
   `TODO`, `FIXME`, `XXX`, `mock`/`MOCK`, `placeholder`, `not implemented`, `not.*support`,
   `throw new Error\(.unimplemented`, funções vazias (`{}`/`return null` suspeito em handler),
   segredo hardcoded (string literal que parece token/senha fora de `.env.example`), variável de
   ambiente lida sem fallback nem erro claro se ausente.
2. Para cada hit, **prove o problema** antes de classificar — não classifique por grep sozinho (ver
   "Evidências necessárias"). Um `TODO` num comentário de refatoração futura é `LOW`; um `TODO` num
   caminho de pagamento/segurança é outra categoria.
3. Cruze achados novos com os documentos já existentes (seção "Antes de editar") — não repita um
   achado já registrado, mas confirme se ele ainda é verdade (código muda; auditoria de
   2026-08-09 pode já estar parcialmente corrigida).
4. Agregue por módulo/domínio, não por arquivo — um bloqueador é sobre uma capacidade do produto
   ("exportar lead pro Bitrix perde qualificação"), não sobre uma linha isolada.

## Evidências necessárias

Toda classificação BLOCKER/CRITICAL precisa de uma das duas provas, citada explicitamente no
relatório:

1. **Reprodução real** — comando, request, ou fluxo de UI executado que demonstra a falha (ex.:
   chamar a rota com `curl`/Playwright e mostrar o erro real, ou rodar a query que mostra dado
   órfão).
2. **Evidência de código inequívoca** — trecho `arquivo:linha` onde a lógica necessariamente falha
   (ex.: `runSyncRule` nunca lê `next` — não há caminho de código que pagine, isso é verificável por
   leitura, sem precisar reproduzir).

Achado sem uma dessas duas evidências vira `MEDIUM`/`LOW` no máximo, ou uma pergunta em aberto
("investigar: X") — nunca um `BLOCKER` especulativo.

### Classificação

- **BLOCKER** — impossibilita produção (dado corrompido/perdido, autenticação ausente numa rota
  sensível, migration destrutiva sem estratégia, funcionalidade central quebrada sem workaround).
- **CRITICAL** — produção possível, mas com risco sério (falha silenciosa numa integração
  financeira/comercial central, RBAC com brecha real, sem observabilidade num caminho crítico).
- **HIGH** — função importante incompleta ou instável (ex.: paginação de sync automático quebrada —
  ver P0-2 do audit Bitrix, hoje classificado mais alto lá porque afeta volume real de dado; ajuste
  a severidade ao contexto do módulo perguntado).
- **MEDIUM** — dívida relevante sem bloquear lançamento (código órfão mantido, duplicidade de
  pipeline, falta de índice em query de baixo volume).
- **LOW** — refinamento (comentário órfão, nomenclatura inconsistente, log verboso demais).

## Regras de implementação

Se o usuário pedir para corrigir um bloqueador específico depois do relatório: escopo mínimo,
migration real (nunca ajuste manual de dado em produção sem migration versionada — ver
`database-integrity`), e sempre re-rode a validação relevante (seção seguinte) antes de reportar
corrigido.

## Validação

- `npm run lint && npx tsc -b --noEmit` — sempre, é barato e pega regressão óbvia.
- `npm run test:unit` — sempre possível, não depende de infraestrutura externa.
- `npm run test:integration`/`npm run test:e2e` — só se Postgres (role `NOSUPERUSER` real, não
  superuser — RLS não é exercitado de verdade com superuser) e Redis estiverem disponíveis. Se não
  estiverem, registre o bloqueio explicitamente (protocolo de `visual-qa/SKILL.md`) em vez de pular
  em silêncio.
- `npm run build` — confirma que o bundle de frontend e o bundle de servidor (`esbuild server.ts`)
  ainda compilam juntos.

## O que não fazer

- Não declare "READY FOR PRODUCTION" só porque build/typecheck/testes unitários passam — isso
  prova ausência de regressão sintática, não completude funcional. Exigir ao menos uma passada de
  `functional-completeness`/`end-to-end-flow-validator` no(s) módulo(s) em escopo antes do
  veredito.
- Não reabra uma investigação já feita em `BITRIX24-LEAD-FLOW-AUDIT.md` do zero — leia, confirme o
  que mudou, complemente.
- Não corrija bloqueadores nesta mesma passada sem que o usuário peça — o padrão desta skill é
  relatório, não PR.
- Não misture débito visual (`DESIGN_QA_CENTRAL_ATLASGR.md`, skills de Design Engineering) com
  bloqueador funcional — são eixos diferentes; cite ambos se relevante, mas não classifique um como
  o outro.

## Quando parar e pedir aprovação de escopo/Git

Pare e pergunte ao usuário antes de: expandir a auditoria para módulos não mencionados na pergunta
original; propor uma correção que toque schema/migration; ou declarar um veredito final quando
partes relevantes da investigação (ex.: `test:integration` sem infraestrutura) não puderam rodar —
nesse caso, o veredito correto é "não determinável com o que este ambiente permite verificar hoje",
não um "sim" ou "não" forçado.

## Critérios de conclusão

Um relatório de release readiness está completo quando:

- [ ] Cada bloqueador tem severidade, evidência (reprodução ou código inequívoco) e arquivo:linha.
- [ ] Achados já documentados em auditorias existentes foram confirmados como ainda válidos (ou
      marcados como já resolvidos), não repetidos cegamente.
- [ ] O relatório distingue explicitamente o que foi verificado de fato do que não pôde ser
      verificado neste ambiente.
- [ ] Nenhum veredito "pronto para produção" foi dado sem passar por pelo menos
      `functional-completeness` (ou `end-to-end-flow-validator`) no escopo perguntado.
- [ ] Débito visual não foi confundido com bloqueador funcional.
