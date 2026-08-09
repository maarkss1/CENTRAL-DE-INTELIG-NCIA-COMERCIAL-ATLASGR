# Baseline — Onda 0 (Preparação)

- Data: 2026-08-09
- Branch de integração: `integracao/onda-1` (criada a partir de `main`, commit `6235814`)
- Executor: Agente 00 — Coordenador

## Ações de preparação

1. Verificado o estado do repositório: branch `main`, working tree com apenas arquivos de governança
   (`AGENTS.md`, `EXECUCAO-ONDAS.md`, `.agents/**` e `AGENTS.md` locais) ainda não versionados.
2. Criada a branch `integracao/onda-1` a partir de `main`.
3. Commitado nela todo o pacote de governança untracked (commit inicial da onda) — sem esse commit
   o material seria perdido ao trocar de branch/sessão.
4. Confirmado que `.agents/runs/` e `.agents/handoffs/` já existem (com `README.md`), nenhuma criação
   necessária.
5. **Achado de ambiente (bloqueador de baseline, não regressão de código):** `node_modules` estava
   dessincronizado de `package.json` — módulos declarados como dependência (`react-router-dom`, `bullmq`,
   `ioredis`, `meilisearch`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `better-auth`, `uuid`,
   `@opentelemetry/api`, `eslint-plugin-jsx-a11y`, entre outros) estavam ausentes em disco. Isso quebrava
   `tsc`, `lint` e `build` por ambiente, não por código. Corrigido com `npm install` (EXIT 0, gerou
   `@prisma/client` via `postinstall`). Sem essa correção, qualquer gate rodado por um especialista
   retornaria falso-negativo.
   - `npm install` reportou 8 vulnerabilidades (4 moderate, 4 high) via `npm audit` — não investigado
     nesta rodada de baseline; registrar como item de acompanhamento para o Agente 01 (segurança/deps).
   - `npm warn allow-scripts`: scripts de instalação de 14 pacotes (`sharp`, `bcrypt`, `esbuild`, `prisma`,
     `ssh2`, `tesseract.js`, etc.) não foram executados por não estarem na allowlist. O `postinstall` do
     próprio projeto (`prisma generate`) rodou normalmente (client gerado com sucesso). Nenhum bloqueio
     aparente nos gates abaixo, mas registrar para o Agente 01 avaliar se algum desses scripts pendentes é
     necessário em runtime (ex.: `bcrypt` nativo, `sharp`).

## Resultado dos gates (branch `integracao/onda-1`, pós `npm install`)

| Gate | Comando | Resultado | Detalhe |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | ✅ PASSOU | 0 erros (antes do `npm install` havia ~50 erros `TS2307`/`TS7006`, todos por módulo ausente — falso-negativo de ambiente, não código) |
| Lint | `npm run lint` | ✅ PASSOU | 0 erros, 161 warnings (todos `jsx-a11y/*`: `label-has-associated-control`, `click-events-have-key-events`, `no-static-element-interactions`) — candidato a escopo do Agente 03 (Design e Acessibilidade) na Onda 3, não bloqueador de onda |
| Testes unitários | `npm run test:unit` | ✅ PASSOU | 70 arquivos, 430 testes, 0 falhas (antes do `npm install`: 30 arquivos falhando por `Cannot find module` — mesmo falso-negativo de ambiente) |
| Testes de integração | `npm run test:integration` | ⛔ BLOQUEADO (ambiente) | `pretest:integration` sobe Postgres/Redis/Meilisearch via `docker-compose`; falhou com `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine` — Docker Desktop instalado (v29.6.2) mas o daemon Linux não respondeu neste ambiente de execução. Não é regressão de código; é impeditivo de ambiente que precisa ser resolvido (Docker Desktop rodando, ou host com Postgres/Redis/Meilisearch acessíveis + `.env.test` real — hoje só existe `.env.test.example`) antes que qualquer agente possa reivindicar este gate como verde. |
| Testes E2E | `npm run test:e2e` | ⛔ BLOQUEADO (ambiente) | Mesmo `pretest:e2e` do item acima (mesma dependência de Docker/`.env.test`); não executado nesta rodada pelo mesmo motivo. |
| Build | `npm run build` | ✅ PASSOU | `vite build` + `esbuild server.ts` concluídos sem erro (antes do `npm install`: falha por `react-router-dom` não resolvido — mesmo falso-negativo de ambiente) |
| `verify:integrations` | `npm run verify:integrations` | ⚠️ FALHOU (credenciais/rede, não código) | 3 integrações com falha: `googlePlaces` ("nenhum resultado; confira ativação, faturamento e restrições da chave"), `apollo` (HTTP 401 Invalid API key), `litellm` ("fetch failed" — proxy local provavelmente não está rodando). 5 integrações opcionais não configuradas por design (`hunter`, `bitrix24`, `groq`, `gemini`, `langfuse` — chaves ausentes, comportamento esperado em ambiente local). As 3 falhas reais (googlePlaces/apollo/litellm) precisam de decisão humana sobre credenciais válidas de sandbox/produção ou ficam registradas como bloqueio de ambiente para a Onda 1, não como bug do Agente 06. |
| `verify:ai` | `npm run verify:ai` | não executado nesta rodada | Reservado para o gate da Onda 2 (Agente 07); não é exigido no gate da Onda 1. |

## Falhas pré-existentes vs. regressão

Nenhuma falha de **código** foi encontrada nesta baseline após corrigir o ambiente (`npm install`).
Toda falha residual listada acima é de **ambiente/credenciais**, não de lógica:
- Docker daemon inacessível → bloqueia `test:integration`/`test:e2e`.
- Credenciais reais ausentes/inválidas (`googlePlaces`, `apollo`) e proxy `litellm` fora do ar → bloqueiam
  parte de `verify:integrations`.

Qualquer especialista que rodar esses mesmos comandos deve obter os mesmos resultados. Se algum
especialista reportar falha em `tsc`/`lint`/`test:unit`/`build` a partir daqui, é regressão introduzida
pela mudança dele, não falha pré-existente.

## Pendências levantadas para as próximas ondas (não bloqueiam Onda 1)

- Agente 01: revisar as 8 vulnerabilidades reportadas por `npm audit` e decidir sobre os scripts de
  instalação pendentes (`allow-scripts`).
- Agente 03: os 161 warnings `jsx-a11y/*` do lint são material direto para a missão de acessibilidade da
  Onda 3.
- Coordenador/usuário: decidir sobre credenciais de sandbox para `googlePlaces`/`apollo`/`litellm` e sobre
  disponibilizar Docker (ou infra equivalente) para `test:integration`/`test:e2e` rodarem de fato antes do
  gate final da Onda 1.

## Decisão da Onda 0

Onda 0 concluída. Ambiente saneado, baseline de código 100% verde (typecheck, lint, testes unitários,
build). Bloqueios remanescentes são de infraestrutura local (Docker) e credenciais externas, registrados
acima — não impedem o início da Onda 1, mas devem ser resolvidos antes do gate final da Onda 1 poder ser
declarado verde por completo.

**Pronto para iniciar a Onda 1** (Agentes 01, 02, 06), sujeito à confirmação do usuário sobre o modo de
disparo dos especialistas (subagentes nesta mesma sessão com worktree isolado, vs. sessões manuais).
