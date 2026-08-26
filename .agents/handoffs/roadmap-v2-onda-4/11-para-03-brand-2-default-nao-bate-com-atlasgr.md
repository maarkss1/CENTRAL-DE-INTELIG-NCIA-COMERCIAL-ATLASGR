- De: 11 (Marca e Ativos Institucionais)
- Para: 03 (Design e Acessibilidade)
- Onda: roadmap-v2-onda-4
- Status: aberto
- Prioridade: normal

## Problema
`src/styles/globals.css` define, no `:root` padrão (linhas 171-172):
```css
--brand: #FF5618;
--brand-2: #FF8008;
```
`#FF8008` é uma cor real da paleta AtlasGR (`identidade-visual/atlasgr/tokens/atlasgr.css` →
`--atlas-cor-laranja-medio`, README → "Laranja médio"), então não é uma cor inventada — mas não é a
cor que `src/contexts/BrandContext.tsx` efetivamente aplica como `accentColor`/`--brand-2` para a
marca AtlasGR em runtime:
```ts
atlasgr: { primaryColor: '#FF5618', accentColor: '#FF6B10', ... }
```
`#FF6B10` é a outra cor secundária real do pack (`--atlas-cor-laranja-apoio`, README → "Laranja
apoio"). Ou seja: o valor default/fallback de `--brand-2` em `globals.css` (`#FF8008`, laranja
médio) e o valor que o JS realmente escreve em `--brand-2` assim que `BrandProvider` monta
(`#FF6B10`, laranja apoio) são dois tons diferentes da paleta AtlasGR, não o mesmo tom.

Efeito prático: qualquer render antes do `useEffect` de `BrandContext.tsx` rodar (SSR eventual,
paint inicial antes da hidratação, ou qualquer consumidor de `--brand-2`/`--color-brand-2`/
`--color-brand-2-active` fora da árvore do `BrandProvider`) usa `#FF8008` em vez do `#FF6B10` que o
resto da aplicação considera "o" accent da AtlasGR. Os dois tons são próximos visualmente (mesma
família de laranja), então não é um erro grosseiro de marca, mas é uma divergência real de token —
exatamente o tipo de coisa que `identidade-visual/atlasgr/tokens/atlasgr.css` existe pra evitar
(tokens têm nome próprio pra cada tom: `--atlas-cor-laranja-medio` vs `--atlas-cor-laranja-apoio`).

Não fiz a alteração porque `src/styles/globals.css` é propriedade exclusiva do Agente 03 (ver
`identidade-visual/AGENTS.md` → "Não pode: alterar tokens de cor em `src/styles/**` diretamente").

## Arquivo(s) envolvido(s)
- `src/styles/globals.css`, linha 172 (`--brand-2: #FF8008;` no `:root` default).
- Para referência (não alterar, só decidir o valor correto): `src/contexts/BrandContext.tsx`
  (`BRAND_CONFIGS.atlasgr.accentColor = '#FF6B10'`), `identidade-visual/atlasgr/tokens/atlasgr.css`
  (`--atlas-cor-laranja-medio: #FF8008` e `--atlas-cor-laranja-apoio: #FF6B10`).

## Alteração necessária
Decidir qual dos dois tons é o "--brand-2" canônico da AtlasGR e alinhar os dois lugares:
- Opção A (recomendada, menor mudança): trocar o default em `globals.css` linha 172 para
  `--brand-2: #FF6B10;`, igualando ao que `BrandContext.tsx` já aplica em runtime — assim o valor
  antes da hidratação já é o mesmo que depois.
- Opção B: manter `#FF8008` em `globals.css` e mudar `accentColor` da AtlasGR em `BrandContext.tsx`
  para `#FF8008` — só faz sentido se houver razão de design pra preferir "laranja médio" como accent
  em vez de "laranja apoio" (fora do escopo de decisão do Agente 11).

Qualquer uma das duas resolve a divergência; a escolha entre elas é decisão de design (Agente 03),
não de consistência de token (que é o que audito).

## Teste esperado
- `document.documentElement.style.getPropertyValue('--brand-2')` (ou inspeção visual do primeiro
  paint antes da hidratação, se reproduzível) bate com o valor usado pelo restante da UI depois que
  `BrandProvider` monta, para a marca AtlasGR.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` continuam verdes (mudança é só valor de token
  CSS, não deveria quebrar nada).

## Contexto adicional
Encontrado durante auditoria de consistência de tokens de marca (Agente 11, Onda 4/roadmap-v2) ao
comparar `identidade-visual/atlasgr/tokens/*` contra o que `globals.css` e `BrandContext.tsx`
realmente consomem, conforme escopo da missão desta onda. Não é bloqueador: os dois tons pertencem à
mesma paleta oficial documentada, o problema é qual dos dois é "o" `--brand-2`, não uma cor fora da
marca.
