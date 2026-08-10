---
name: design-system
description: Use antes de criar um token de cor/espaçamento/radius, uma variante de componente, ou qualquer padrão visual reutilizável. Evita duplicar o sistema de tokens já existente (Tailwind 4 CSS-first em globals.css) e documenta as duplicações intencionais que não devem ser "consolidadas" ingenuamente.
---

# Design System — Central de Inteligência Comercial ATLASGR

## Onde os tokens vivem

Tailwind 4, **CSS-first** — não existe `tailwind.config.*`. Todo token é definido em
`src/styles/globals.css`, dentro de `:root` (valores base), `.dark` (overrides de dark mode) e
`@theme` (mapeamento pro Tailwind: `--color-*`, `--radius-*`, `--shadow-*`, `--animate-*`).

Antes de adicionar um token novo, procure primeiro se ele já existe:

| Categoria | Tokens existentes |
|---|---|
| Superfície | `--bg`, `--surface`, `--surface-2` |
| Texto | `--ink`, `--ink-2` |
| Borda | `--line` |
| Marca (dinâmico, reage à troca AtlasGR↔Total Trac) | `--brand`, `--brand-2`, `--color-brand-active` (versão escurecida p/ contraste AA de texto branco) |
| Semântico | `--warn`, `--ok`, `--color-success/warning/danger/info` |
| Radius | `--radius-card` (1.25rem), `--radius-card-lg` (1.75rem) |
| Sombra | `--shadow-card` |
| Fonte | `--font-brand-sans` (Montserrat AtlasGR / Fivo Sans Total Trac via `[data-brand]`) |

## A duplicação de tokens de marca é intencional — não "consolide" sem entender por quê

`--brand`/`--brand-2` (tokens dinâmicos, usados por `bg-brand`/`text-brand`) e
`--brand-primary`/`--brand-accent` (variáveis legadas) **precisam continuar existindo em
paralelo**: `BrandContext.tsx` atualiza os dois pares ao trocar de marca. Além disso, ~40+ arquivos
de feature usam classes estáticas por marca (`atlas-orange`/`totaltrack-blue`, escolhidas por
ternário `isAtlas ? ... : ...`) de propósito — um padrão de branding diferente e coexistente com o
token dinâmico, usado em contextos onde a cor **não** deve reagir à marca ativa (ex.: telas de
pré-seleção mostrando as duas marcas lado a lado). Transformar `--color-atlas-orange` num alias
cego de `--brand` quebraria esse padrão. Se uma tarefa pedir "consolidar tokens de cor", leia
`DESIGN_QA_CENTRAL_ATLASGR.md` seção "Nota importante sobre consolidação de tokens de cor
(DQA-10)" antes de tocar nisso — é uma decisão de arquitetura de branding, não uma limpeza de CSS.

## Radius — convergir, não fragmentar mais

Histórico: `Button`, `Card`, `Dialog`, `Skeleton`, `EmptyState`, `Badge` tinham 5 valores de radius
diferentes sem escala compartilhada. Já convergido parcialmente para `rounded-card`/
`rounded-card-lg` em `Card`/`Dialog`/`EmptyState`. Ao criar um componente novo com cantos
arredondados, use esses dois tokens em vez de um valor `rounded-*` arbitrário do Tailwind — exceto
onde o radius é semanticamente diferente por design (pill de `Badge`, painel edge-to-edge de
`Drawer`).

## Primitivos de UI existentes (`src/components/ui/`)

Componha a partir daqui antes de criar algo novo: `Button` (cva, variantes), `Card` (cva),
`Badge` (cva), `Dialog`, `Drawer`, `Skeleton`, `EmptyState`, `Pagination`, `Timeline`, `Toaster`.
`Button`/`Card`/`Badge` usam `class-variance-authority` (`cva`) para variantes — siga esse padrão
ao adicionar uma variante nova em vez de criar classes condicionais soltas.

## Dupla marca — como testar

Toda decisão de cor/token nova precisa ser verificada nas duas marcas, não só AtlasGR (a marca
default costuma "esconder" bugs porque muitos tokens legados já são laranja por padrão). Alterne
via `useBrand()`/`BrandContext` ou `data-brand="totaltrac"` no `<html>` durante o QA visual.

## Tema (claro/escuro) e marca (AtlasGR/Total Trac) são eixos independentes

"Usar token" não significa automaticamente "reagir à marca". `bg-bg`/`text-ink` resolvem
reatividade a **tema** (via classe `.dark` que `ThemeContext.tsx` já aplica em `<html>`,
default `'dark'`); só tokens como `--brand`/`--brand-2` reagem à **marca ativa**. Existem
superfícies pré-seleção de marca (`WelcomeScreen.tsx`, `SelectionScreen.tsx`, antes de
`/select-brand`) que precisam reagir a tema mas mostrar as duas marcas com peso visual igual — não
"corrija" isso pra reagir à marca ativa, é o comportamento certo (ver `CLAUDE.md` seção 7, item 7).

Antes de aplicar uma mudança baseada em tema num componente, confirme nesta ordem: o componente
tem uma variante/prop própria para tema, ou você precisa ler `useTheme()` manualmente? Ele já
existe em versão consciente de tema, ou você vai introduzir a primeira? A tela roda antes ou depois
da escolha de marca? Exemplo real do Piloto 001 (`.claude/PILOTS.md`): `TotalTrackLogo` já tem
`tone="auto"`, que troca sozinho entre positivo/negativo via `dark:hidden`/`dark:block` — não
recalcule isso manualmente. Já `Logo` só tem variantes `default`/`white`/`symbol` (sem "auto") —
usar `variant="white"` fixo, como o código legado fazia, quebra em tema claro; é preciso ler
`useTheme()` e escolher a variante explicitamente. Verifique sempre as 4 combinações mínimas antes
de considerar pronto: light+AtlasGR, light+TotalTrac, dark+AtlasGR, dark+TotalTrac — e, se a
superfície for pré-seleção, o estado "marca ainda não escolhida" também.

## Checklist de saída

- [ ] Nenhum token novo foi criado sem antes confirmar que não existe equivalente em `globals.css`.
- [ ] Cor de marca usa token dinâmico (`--brand`) por padrão; classe estática (`atlas-orange`) só
      se a tela precisa mostrar as duas marcas ao mesmo tempo, deliberadamente.
- [ ] Radius novo usa `--radius-card`/`--radius-card-lg`, a menos que haja motivo semântico para
      justificar por que (pill de `Badge`, painel edge-to-edge de `Drawer`).
- [ ] Variante de componente nova segue o padrão `cva` já usado em `Button`/`Card`/`Badge`.
- [ ] Testado (ou revisado mentalmente) nas duas marcas, light e dark — 4 combinações mínimas.
- [ ] Se o componente usado (`Logo`, `TotalTrackLogo`, etc.) já tem uma variante/prop consciente de
      tema (ex.: `tone="auto"`), ela foi usada em vez de recalcular o mesmo comportamento na mão.
