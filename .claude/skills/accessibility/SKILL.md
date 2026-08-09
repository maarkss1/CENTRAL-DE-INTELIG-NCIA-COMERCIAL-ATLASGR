---
name: accessibility
description: Use em todo componente interativo, formulário, modal, navegação ou mudança de layout. Cobre o débito de acessibilidade já mapeado neste projeto (jsx-a11y, axe-core) e os requisitos WCAG AA mínimos não-negociáveis.
---

# Acessibilidade — Central de Inteligência Comercial ATLASGR

## Estado atual (não repita os problemas já resolvidos, nem ignore os que faltam)

Este projeto já tem tooling de acessibilidade real, não é greenfield:

- `eslint-plugin-jsx-a11y` ativo em `eslint.config.mjs`. Regras que **bloqueiam** o lint:
  `react/no-unescaped-entities`, `jsx-a11y/heading-has-content` (com exceção documentada em
  `Card.tsx` para `CardTitle`). Regras rebaixadas a `warn` (débito conhecido, ~152 ocorrências):
  `jsx-a11y/label-has-associated-control`, `click-events-have-key-events`,
  `no-static-element-interactions`, `no-noninteractive-element-interactions`, `no-autofocus`,
  `media-has-caption`. **Não aumente essas contagens de warning** em código novo — todo `<div
  onClick>` novo precisa de `role`, `tabIndex` e `onKeyDown`/`onKeyPress` desde o início; todo
  `<input>` novo precisa de `<label>` associado (via `htmlFor`/`id` ou `aria-labelledby`) desde o
  início.
- `@axe-core/playwright` roda em `tests/e2e/accessibility.spec.ts` contra login, dashboard,
  Pipeline CRM e Configurações — falha em violações `critical`/`serious`. Ao adicionar uma tela
  nova a um fluxo coberto por esse spec, ela herda a mesma verificação; considere adicionar um
  `test()` novo se a tela for uma superfície principal.
- Baseline global `:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px }` já
  existe em `globals.css` — todo elemento interativo tem foco visível por padrão, mesmo sem estilo
  próprio. Componentes com anel de foco próprio (`focus-visible:ring-*`) continuam vencendo por
  especificidade — não remova isso ao estilizar um componente novo.
- `@media (prefers-reduced-motion: reduce)` global já cobre CSS/keyframes; `MotionConfig
  reducedMotion="user"` cobre Framer Motion.

## Bug real já encontrado e corrigido — não reintroduza

Texto branco sobre `--brand`/`--brand-2` puro (ex.: item ativo da Sidebar) dava só ~3.2:1
(AtlasGR) / ~3.9:1 (Total Trac) de contraste — abaixo do mínimo AA de 4.5:1. Corrigido com o token
`--color-brand-active` (`color-mix(in srgb, var(--brand) 75%, black)`). **Use
`bg-brand-active`/`--color-brand-active` sempre que precisar de texto branco sobre um fundo de cor
de marca sólida** — não volte a usar `--brand` puro nesse cenário.

## Checklist mínimo para qualquer componente interativo novo

- [ ] Navegável via teclado: Tab alcança o elemento, Enter/Space ativa, Escape fecha (modais/
      drawers/dropdowns), setas navegam onde o padrão ARIA pedir (menus, tabs, listboxes).
- [ ] `<div onClick>`/`<span onClick>` tem `role`, `tabIndex={0}` e handler de teclado — ou,
      preferencialmente, é um `<button>`/`<a>` de verdade.
- [ ] Todo `<input>`/`<select>`/`<textarea>` tem `<label>` associado (`htmlFor`) ou
      `aria-label`/`aria-labelledby`.
- [ ] Formulários com `react-hook-form`/`zod` expõem erro via `aria-describedby` apontando pro
      texto de erro, não só cor vermelha.
- [ ] Contraste de texto ≥ 4.5:1 (normal) / 3:1 (grande) — checar especialmente texto sobre
      `bg-brand`/cor sólida (usar `--color-brand-active` se for branco sobre marca).
- [ ] Área com scroll próprio (padrão do Kanban `CrmBoard`) tem `tabIndex={0}` +
      `aria-label` se for navegável só por scroll horizontal.
- [ ] Imagem/ícone informativo tem `alt`/`aria-label`; decorativo tem `aria-hidden="true"`.
- [ ] A raiz da tela tem um landmark semântico (`<main>`, não `<div>`) — achado real do axe-core no
      Piloto 001: `WelcomeScreen.tsx` usava `<div>` na raiz e disparava `landmark-one-main`/`region`
      em toda a página.
- [ ] Estado de loading é anunciado (não só visual) — `aria-live`/`aria-busy` onde aplicável.
- [ ] Animação nova respeita `prefers-reduced-motion` (herdado do `MotionConfig` raiz, salvo hooks
      customizados que checam `useReducedMotion()` manualmente).

## Como verificar

- `npm run lint` — pega os erros bloqueantes de `jsx-a11y` imediatamente.
- `npx playwright test tests/e2e/accessibility.spec.ts` — roda `axe-core` nas telas principais já
  cobertas. Se a mudança tocar uma dessas telas, rode este spec antes de reportar concluído.
- Ao adicionar uma superfície principal nova, considere adicionar um `test()` a esse spec seguindo
  o padrão existente (`signUp` + `assertNoBlockingViolations`).
