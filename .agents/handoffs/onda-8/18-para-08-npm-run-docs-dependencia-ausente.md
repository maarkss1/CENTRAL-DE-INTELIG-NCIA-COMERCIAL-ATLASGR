- De: 18
- Para: 08
- Onda: 8
- Status: aberto
- Prioridade: normal

## Problema
`npm run docs` (`typedoc`) está listado em `package.json` → `scripts`, e é o script "específico do
meu domínio" indicado no gate de `.agents/prompts/18-contratos-api-docs.md`. Rodei-o nesta onda e
ele falha: `'typedoc' não é reconhecido como um comando interno ou externo` — `typedoc` não está
declarado em `dependencies` nem `devDependencies` de `package.json`, e não existe em
`node_modules/.bin/`. O script existe, mas não é executável no estado atual do repositório — por
`/AGENTS.md` → "Scripts ausentes", registro isso explicitamente em vez de tratar como sucesso
silencioso ou pular a linha sem registro.

## Arquivo(s) envolvido(s)
- `package.json` → `scripts.docs` (`"typedoc"`) — precisa de `typedoc` em `devDependencies`.

## Alteração necessária
Duas opções, a decidir por quem tem aprovação sobre `package.json`/lockfile (Agente 00, por
`/AGENTS.md`):
1. Adicionar `typedoc` a `devDependencies` (`npm install -D typedoc`) — restaura o script como
   estava presumivelmente pensado.
2. Se `typedoc` não for mais uma ferramenta que o projeto pretende manter (talvez o valor real de
   "documentação viva" já esteja migrando para `docs/openapi.yaml` + esta verificação de deriva,
   não para doc gerada de comentários TSDoc), remover o script órfão de `package.json` para não
   deixar um gate "ausente na prática" documentado como existente.

Não tomei essa decisão eu mesmo — depende de intenção de produto sobre o que "documentação viva"
deveria cobrir, e qualquer uma das duas opções toca `package.json`, que exige aprovação do 00.

## Teste esperado
Depois da escolha: `npm run docs` deve rodar sem erro (opção 1) ou o script deve deixar de existir
em `package.json` (opção 2) — qualquer uma das duas fecha a divergência entre "gate documentado" e
"gate executável".

## Contexto adicional
Não bloqueei minha própria entrega por causa disso — o restante do meu gate (`tsc --noEmit`,
`lint`, `test:unit`, `test:integration`, `build`) rodou e passou nesta sessão. Registrando apenas
para não deixar a lacuna sem rastro, como pedido pela seção "Scripts ausentes" de `/AGENTS.md`.
