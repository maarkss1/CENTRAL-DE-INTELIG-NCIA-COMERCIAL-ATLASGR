- De: 10
- Para: 08
- Onda: 4
- Status: resolvido
- Prioridade: alto
## Problema
Ao rodar o gate obrigatório (`npm run lint`) no meu worktree (`agente/10-infraestrutura-sre`,
criado a partir de `integracao/onda-4` == `main` no commit `46e86724`), o comando falha para o
repositório inteiro, antes de analisar qualquer arquivo:

```
ESLint: 9.39.5
TypeError: Key "rules": Key "react-hooks/set-state-in-effect": Could not find
"set-state-in-effect" in plugin "react-hooks".
```

Causa: `eslint.config.mjs` (linha 50) referencia a regra `react-hooks/set-state-in-effect`, mas a
versão de `eslint-plugin-react-hooks` efetivamente instalada via `package-lock.json` é `5.2.0`
(confirmado em `node_modules/eslint-plugin-react-hooks/package.json`), que não tem essa regra —
ela só existe em versões mais novas do plugin. Não toquei em `eslint.config.mjs` nem em
`package.json`/`package-lock.json` (fora do meu escopo) — reproduzi isso só rodando `npm install`
limpo + `npm run lint` no meu worktree, então é um problema de ambiente/dependência pré-existente
em `main`, não uma regressão introduzida por mim (não editei nenhum arquivo em `src/**` ou
config de lint).

Isso bloqueia `npm run lint` para **qualquer** agente/dev que rodar `npm install` limpo a partir
de `main` hoje — não é específico da Onda 4.
## Arquivo(s) envolvido(s)
- `eslint.config.mjs` (linha 50: `'react-hooks/set-state-in-effect': 'warn'`)
- `package.json`/`package-lock.json` (`eslint-plugin-react-hooks` pinado em `^5.2.0` — a regra
  citada só existe em versões mais novas)
## Alteração necessária
Uma das duas (fora do meu escopo — `package.json` exige aprovação do Agente 00, `eslint.config.mjs`
é config de tooling geral do repo):
1. Atualizar `eslint-plugin-react-hooks` para uma versão que tenha a regra
   `set-state-in-effect`, ou
2. Remover/comentar essa regra de `eslint.config.mjs` até a atualização acontecer.
## Teste esperado
`npm install` limpo seguido de `npm run lint` não lança `TypeError` e produz a lista real de
erros/warnings do projeto (baseline documentada em `.agents/runs/baseline.md` esperava 0 erros,
161 warnings `jsx-a11y/*` — útil para confirmar se o comportamento voltou a esse estado depois da
correção).
## Contexto adicional
Onda 4 — Agente 10. Reportado como achado de ambiente, não como regressão minha: meu gate de
`k8s/argocd/charts/infrastructure/docker` não depende de `npm run lint` rodar sobre `src/**`
(nenhum arquivo do meu escopo é `.ts`/`.tsx`), mas o gate obrigatório do prompt/README pede o
comando mesmo assim — reportando FAIL com causa raiz identificada, não pulando silenciosamente.
