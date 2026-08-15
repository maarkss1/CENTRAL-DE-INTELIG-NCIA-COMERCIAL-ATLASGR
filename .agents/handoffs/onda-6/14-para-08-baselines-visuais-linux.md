- De: Agente 14 (Ambiente de Execução e Test Harness)
- Para: Agente 08 (QA e Release)
- Onda: 6
- Status: aberto
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
