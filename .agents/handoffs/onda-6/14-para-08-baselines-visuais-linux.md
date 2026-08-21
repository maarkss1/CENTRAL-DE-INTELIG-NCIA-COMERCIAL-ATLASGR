- De: Agente 14 (Ambiente de Execução e Test Harness)
- Para: Agente 08 (QA e Release)
- Onda: 6
- Status: resolvido
- Prioridade: normal

## Problema
`tests/e2e/visual.spec.ts` está em `describe.skip` porque as únicas baselines commitadas em
`tests/e2e/visual.spec.ts-snapshots/` são `*-chromium-win32.png` (geradas no Windows). Playwright
inclui a plataforma no nome do arquivo de baseline, então o CI (`ubuntu-latest`) sempre procuraria
`*-chromium-linux.png`, que nunca existiu — todo teste falharia com "A snapshot doesn't exist", não
por regressão visual real.

Confirmei nesta onda que **não é seguro gerar essa baseline localmente**, mesmo tendo Docker/Postgres
de pé aqui: o Chromium provisionado neste ambiente de agente é `chromium-1194`
(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), enquanto `npx playwright install
--with-deps chromium` — o que o CI de fato instala — resolveu `chromium_headless_shell-1228` quando
tentei rodar sem a variável `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Builds diferentes de Chromium rasterizam
fonte/anti-aliasing de forma sutilmente diferente, o que é exatamente a classe de falso
positivo/negativo que uma suíte de regressão visual pixel-a-pixel não pode tolerar. Por isso não
gerei/commitei PNG nenhum a partir deste ambiente.

## Arquivo(s) envolvido(s)
- `tests/e2e/visual.spec.ts` (comentário do skip atualizado nesta onda para explicar a causa correta)
- `tests/e2e/visual.spec.ts-snapshots/*-chromium-win32.png` (baseline existente, Windows)
- `.github/workflows/ci.yml` (fora do meu escopo — pertence ao 08)

## Alteração necessária
Adicionar um job (ou step dedicado, rodando uma vez) no `ci.yml`, no mesmo runner/imagem
`ubuntu-latest` que já roda `test:e2e`, que:
1. sobe a stack de serviços igual ao job de e2e normal (postgres/redis/meilisearch);
2. roda `npx playwright test tests/e2e/visual.spec.ts --update-snapshots` (com o `describe.skip`
   temporariamente removido, ou passando o teste explicitamente já que `--update-snapshots` ainda
   respeita `.skip`);
3. produz os PNGs `*-chromium-linux.png` em `tests/e2e/visual.spec.ts-snapshots/`;
4. alguém baixa esses artefatos do job e commita junto com a remoção do `describe.skip`.

Este passo é essencialmente manual/único (não precisa virar job permanente) — só precisa rodar
dentro do CI uma vez para estabelecer a baseline Linux real.

## Teste esperado
Depois de commitados os PNGs `*-chromium-linux.png` e removido o `describe.skip`:
`npm run test:e2e` (ou só `npx playwright test tests/e2e/visual.spec.ts`) roda os 5 testes de
`visual.spec.ts` no CI e fecha verde sem depender de retry.

## Contexto adicional
Baseline Windows preservada (não removi `*-chromium-win32.png`) — sem instrução do usuário para
descartar histórico de referência, e não custa nada mantê-la junto da baseline Linux nova.

## Resolução (Agente 08, remediação pós-Onda 6)

Implementado exatamente como pedido: `.github/workflows/ci.yml` ganhou `workflow_dispatch:` no
`on:` e um novo job `visual-baselines` (`if: github.event_name == 'workflow_dispatch'`, não roda
em push/PR), que:

1. sobe a mesma stack de serviços do job `build-and-test` (postgres/redis — o job `build-and-test`
   não sobe um container dedicado de Meilisearch apesar de `MEILI_HOST`/`MEILI_MASTER_KEY`
   estarem no `env`, então o job novo espelha esse comportamento real em vez do que o handoff
   descrevia; `visual.spec.ts` não depende de busca);
2. remove o `describe.skip` só no checkout efêmero do job (`sed` num arquivo do runner, nunca
   commitado) e roda `npm run test:e2e -- tests/e2e/visual.spec.ts --update-snapshots`;
3. publica os PNGs `*-chromium-linux.png` resultantes como artifact (`visual-snapshots-linux`).

**Não foi possível gerar os PNGs de verdade neste ambiente** — confirmando exatamente o
diagnóstico deste handoff (Chromium local incompatível com o que o CI instala) — então
`tests/e2e/visual.spec.ts` **continua em `describe.skip`** neste commit. Isso ainda depende de
ação humana real:

1. Abrir Actions → CI → "Run workflow" no GitHub (branch `agente/08-ci-deploy-audit` ou `main`
   depois do merge) para disparar o `workflow_dispatch`.
2. Baixar o artifact `visual-snapshots-linux` do job `visual-baselines`.
3. Extrair os PNGs em `tests/e2e/visual.spec.ts-snapshots/` (mantendo as `*-chromium-win32.png`
   já commitadas).
4. Remover o `describe.skip` real de `tests/e2e/visual.spec.ts` (linha ~30) e commitar junto com
   os PNGs novos.

Depois desse passo manual, `npm run test:e2e` no job `build-and-test` volta a cobrir
`visual.spec.ts` normalmente em todo push/PR — sem exigir mudança adicional no `ci.yml`.
`docs/deploy/RELEASE_CHECKLIST.md` (novo, seção 3) documenta a verificação manual a fazer
enquanto a baseline não existir.

## Resolução final (2026-08-21)

Passo manual executado: `gh workflow run ci.yml --ref main` disparou o `workflow_dispatch`
(run `32521483569`), job `visual-baselines` concluído com sucesso, artifact
`visual-snapshots-linux` baixado e os 5 PNGs `*-chromium-linux.png` extraídos para
`tests/e2e/visual.spec.ts-snapshots/` ao lado das `*-chromium-win32.png` existentes.
`describe.skip` removido de `tests/e2e/visual.spec.ts`. Commit `33dbb851`.

Nota à parte, fora do escopo deste handoff: o disparo do workflow também rodou o job
`secret-scan` (Gitleaks) do mesmo `ci.yml`, que reportou 47 leaks no histórico do repositório
(público). Os dois achados de credencial real (chave Gemini em `test-gemini.ts` e
`test-gemini-quota.ts`, commits de 2026-07-17) foram confirmados pelo usuário como já
inválidos/rotacionados. Os demais 4 achados (`phase-12-manifest.json`) são falso-positivo —
hashes SHA-256 de conteúdo de arquivo, não segredo. Nenhuma ação de remediação de histórico
(reescrita/força) foi tomada — não fazia parte do escopo autorizado nesta rodada.
