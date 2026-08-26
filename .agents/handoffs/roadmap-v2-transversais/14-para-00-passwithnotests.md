- De: 14 — Ambiente de Execução e Test Harness
- Para: 00 — Coordenador (edição de `package.json` exige aprovação explícita, ver `/AGENTS.md` → "Propriedade exclusiva de arquivos")
- Onda: roadmap-v2-transversais
- Status: aberto
- Prioridade: normal

## Problema

`package.json` → scripts `test:unit` e `test:integration` rodam o Vitest com a flag
`--passWithNoTests`:

```json
"test:unit": "vitest run -c vitest.unit.config.ts --passWithNoTests",
"test:integration": "vitest run -c vitest.integration.config.ts --passWithNoTests",
```

Isso significa que, se o `include` glob de `vitest.unit.config.ts`/`vitest.integration.config.ts`
por algum motivo deixar de casar com nenhum arquivo (glob quebrado, diretório movido/renomeado,
erro de digitação num PR futuro), o Vitest sai com código 0 (sucesso) em vez de falhar — o gate
"Run Unit Tests"/"Run Integration Tests" da CI (`.github/workflows/ci.yml`) reportaria PASS mesmo
que **nenhum teste real tenha rodado**. Isso é exatamente o cenário que `/AGENTS.md` → "Gate
obrigatório por onda" proíbe: "Não marcar teste como 'aprovado' se não foi executado."

Hoje isso não está mascarando nada na prática — reexecutei os dois comandos de verdade nesta
auditoria (ver evidência abaixo) e ambos colecionam e rodam centenas de testes reais. O risco é
estrutural/futuro, não uma falha observada agora.

## Arquivo(s) envolvido(s)

- `package.json` (linhas dos scripts `test:unit` e `test:integration`) — fora do escopo de edição
  do Agente 14 nesta onda (`scripts/test/**`, `vitest.*.config.ts`, `playwright.config.ts` apenas);
  qualquer alteração em `package.json` exige aprovação explícita do Agente 00 por regra de
  `/AGENTS.md`.

## Alteração necessária

Remover `--passWithNoTests` dos dois scripts (`test:unit`, `test:integration`). Não há hoje nenhum
caminho de invocação legítimo (local ou CI) que dependa de rodar com zero arquivos casados — os
dois comandos são sempre chamados sem filtro adicional de arquivo. Se algum caso legítimo de "zero
testes é aceitável" for identificado depois, prefiro que seja explícito e local (ex.: um terceiro
script dedicado a um subconjunto opcional), não um default silencioso no gate obrigatório.

## Teste esperado

Depois de remover a flag: `npx vitest run -c vitest.unit.config.ts` (sem `--passWithNoTests`)
contra um `include` intencionalmente quebrado (ex.: glob apontando para um diretório inexistente)
deve sair com código diferente de 0, não 0. Contra o `include` real atual, o comportamento não
muda (já há centenas de arquivos casando).

## Contexto adicional

Evidência real rodada nesta auditoria (Agente 14, sem esta mudança ainda aplicada):

```
npx vitest run -c vitest.unit.config.ts --passWithNoTests
  Test Files  236 passed (236)
       Tests  1744 passed (1744)

npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts --passWithNoTests
  Test Files  48 passed (48)
       Tests  232 passed (232)
```

`vitest.container.config.ts` (`test:containers`) e `coverage:unit`/`coverage:integration` já NÃO
usam `--passWithNoTests` — só os dois scripts citados acima têm a flag, o que sugere que ela não é
uma convenção deliberada do projeto, e sim um artefato que sobrou de algum momento em que os globs
de `include` ainda não existiam/estavam instáveis.
