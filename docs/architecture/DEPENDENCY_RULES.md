# Regras de dependência entre camadas/domínios (ITEM-13)

**Item de dívida técnica:** ITEM-13 — Architecture tests e regras automáticas de dependência.
**Dependências:** ITEM-07 (`server.ts` → `src/bootstrap/`), ITEM-08 (Commercial Intelligence),
ITEM-09 (gateway de IA).
**Onde a regra vive de verdade:** `.dependency-cruiser.cjs` (raiz do repositório) — este documento
explica o racional de cada regra; o arquivo de configuração é a fonte executável.

## Objetivo

Impedir que a complexidade estrutural resolvida pelo ITEM-07/08/09 volte a crescer, sem fingir que
o resto do repositório (24 pastas em `src/features/`, a maioria sem isolamento formal — ver
`docs/architecture/FEATURE-CLASSIFICATION.md` e `docs/architecture/MATRIZ_ARQUITETURA.md`, que já
documenta "Módulos de IA: Parcialmente refatorado") já segue um padrão de fronteiras estritas que
nunca existiu. As regras abaixo foram levantadas a partir do import real do código (`grep`/
`dependency-cruiser --output-type json` neste worktree, na branch que já inclui ITEM-07/08/09
mergeados), não de uma arquitetura desejada.

## Como rodar

```bash
npm run lint:architecture          # gate real — o que o CI roda
npm run lint:architecture:baseline # regenera .dependency-cruiser-known-violations.json (uso manual, nunca em CI)
```

`lint:architecture` roda `depcruise` com `--ignore-known .dependency-cruiser-known-violations.json`
— ver "Mecanismo de ratchet" abaixo.

## As 5 regras

### 1. `no-circular` — proibido qualquer ciclo de import

Generaliza para todo `src/` + `server.ts` + `worker.ts` a proibição que já existia em prosa em
`src/shared/AGENTS.md` ("Não criar dependência circular entre feature e shared"). Um ciclo dificulta
entender ordem de inicialização, quebra tree-shaking e frequentemente esconde uma dependência que
deveria ter sido invertida (interface) em vez de importada de volta.

**Débito pré-existente:** 18 ciclos reais já existiam antes deste item — grandfathered no baseline
(ver `docs/architecture/KNOWN_VIOLATIONS.md`). A regra é `error`; só ciclos **novos** quebram o CI.

### 2. `not-to-bootstrap-from-outside` — `src/bootstrap/**` só é importado por `server.ts`

`src/bootstrap/**` é a raiz de composição extraída de `server.ts` no ITEM-07 (segurança, rate
limit, webhooks, observabilidade, docs de API, health checks, auth handler, Bull Board, rotas,
frontend estático, workers embutidos, shutdown gracioso). Cada módulo presume ser chamado uma única
vez, na ordem que `server.ts` define — não é uma API de propósito geral. Confirmado no código real
(branch com ITEM-07 mergeado): hoje só `server.ts` e o próprio `src/bootstrap/routes.ts` (que chama
outros `bootstrap/*`) importam daqui. **0 violações no baseline** — a regra nasce green e qualquer
import futuro de fora quebra o CI imediatamente.

### 3. `not-to-ai-gateway-internals-from-outside` — `src/lib/ai/gateway/**` só é importado de dentro de `src/lib/ai/`

`src/lib/ai/gateway/**` são os internals do gateway de IA extraído no ITEM-09 (circuit breaker,
retry, parsing de streaming, providers Groq/OpenAI/LiteLLM, redaction, telemetry). A fachada
pública é `src/lib/ai/gateway.ts` — features e outras libs importam dali, nunca de dentro da pasta.
Isso garante que o circuit breaker/retry/redaction sejam comportamento garantido pela fachada, não
algo que cada chamador precisa lembrar de replicar. Confirmado no código real: **0 violações no
baseline** — a regra nasce green.

### 4. `no-cross-feature-imports` — uma feature não importa internals de outra feature

`src/features/<nome>/` é um módulo vertical com dono próprio (ver `AGENTS.md` de cada pasta e
`docs/architecture/FEATURE-CLASSIFICATION.md`). Import direto de `application/`/`infra/`/`domain`/
`services/` de uma feature vizinha cria acoplamento sem dono único — o mesmo padrão que já gerou
"componentes deus" documentados em outras auditorias deste repo (ex.: `chatbook`, ARCH-002 em
`docs/auditoria-divida-tecnica/`).

**Exceção estrutural (não temporária):** `src/features/notifications/` é tratado como serviço
transversal, no mesmo papel de `src/shared/` — notificação é infraestrutura consumida por natureza
por qualquer fluxo de negócio. O único uso real hoje é
`src/features/automations/automation.engine.ts` → `notification.service.ts`, mas a regra permite o
mesmo padrão para outra feature no futuro sem precisar de uma nova exceção.

**Débito pré-existente:** 95 imports cross-feature reais já existiam antes deste item (a maioria
concentrada em `intelligence` → várias features, que é o hub de IA consumindo serviço de negócio de
todo o resto do produto — ver `docs/architecture/KNOWN_VIOLATIONS.md` para o detalhamento completo
por feature e dono). Não foram apagados nem mascarados: estão listados no baseline, com dono e
prazo de reavaliação por grupo. A regra é `error`; só um import cross-feature **novo**, não coberto
pelo baseline, quebra o CI.

### 5. `no-shared-to-features` — `src/shared/**` não importa `src/features/**`

`src/shared/AGENTS.md`: "contratos compartilhados, policies, tipos de autorização/tenant e
utilitários comuns" — `shared/` é consumido por features, nunca o contrário (senão vira ciclo por
definição: `shared → feature → shared`). **Única exceção real e intencional:**
`src/shared/di/setup.ts` — é a raiz de composição do container de injeção de dependência (ver
`docs/architecture/MATRIZ_ARQUITETURA.md`, "Injeção de Dependências") e por natureza precisa
conhecer os repositories/use cases/controllers concretos de cada feature para registrá-los. Todo
outro arquivo de `shared/` segue a regra geral sem exceção. Confirmado no código real: **0
violações fora dessa exceção** — a regra nasce green (com a exceção já embutida na regra, não como
item de baseline).

## Mecanismo de ratchet (`--ignore-known`)

`dependency-cruiser` tem suporte nativo a uma baseline de violações conhecidas
(`--ignore-known <arquivo>`): toda violação já listada em
`.dependency-cruiser-known-violations.json` é ignorada (severidade rebaixada), qualquer violação
**não** listada ali continua `error` e quebra o gate. Isso segue o mesmo padrão de dívida técnica já
usado neste repositório para `npm audit` (`docs/security/AUDIT_WAIVERS.md` +
`scripts/security/check-audit-waivers.ts`): dívida existente é aceita **explicitamente, com dono e
prazo**, não escondida — e o número não pode crescer sem que alguém abra uma exceção nova e
documentada.

- Gerar/atualizar a baseline: `npm run lint:architecture:baseline` (ação manual e deliberada —
  **nunca** rodar isso em CI; se rodasse, qualquer PR poderia "resolver" uma violação nova apenas
  re-gerando o arquivo, o que anularia o propósito do gate).
- Toda entrada da baseline está documentada e tem dono em
  `docs/architecture/KNOWN_VIOLATIONS.md`.
- Reduzir a baseline (corrigir uma violação existente e removê-la do arquivo) é sempre bem-vindo e
  não precisa de aprovação especial — só _aumentar_ o arquivo para "passar" um import novo é que
  exige justificativa documentada (ver seção "Como adicionar uma exceção nova" em
  `docs/architecture/KNOWN_VIOLATIONS.md`).

## Fora de escopo deste item (dívida derivada, não expandida silenciosamente)

- **Fronteiras de camada dentro de uma feature** (`presentation` → `application` → `domain`/
  `infra`, ver `docs/architecture/MATRIZ_ARQUITETURA.md`) não são verificadas por
  `dependency-cruiser` aqui — o próprio documento de matriz já registra "Módulos de IA (Prospecting/
  AI): Parcialmente refatorado", ou seja, aplicar essa regra hoje geraria uma segunda baseline
  gigante sem relação com o que o ITEM-13 foi pedido para proteger (ITEM-07/08/09). Candidato a um
  item de dívida técnica futuro dedicado, não implementado aqui.
- **Hotspots de tamanho de arquivo** têm gate próprio, documentado em
  `docs/architecture/HOTSPOT_EXCEPTIONS.md` e `scripts/architecture/check-hotspots.ts` — não é uma
  regra do `dependency-cruiser` (que não modela "tamanho de arquivo").
