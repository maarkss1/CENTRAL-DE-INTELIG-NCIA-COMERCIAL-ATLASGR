---
name: visual-qa
description: Use depois de qualquer mudança visual, antes de reportar a tarefa como concluída. Define os comandos de verificação (lint, typecheck, axe-core, regressão visual) já configurados neste projeto e o que checar manualmente quando não há navegador disponível.
---

# Visual QA — Central de Inteligência Comercial ATLASGR

Este projeto já tem infraestrutura de QA visual e de acessibilidade real — use-a antes de declarar
qualquer mudança de UI como concluída. Não é opcional nem redundante: `DESIGN_QA_CENTRAL_ATLASGR.md`
documenta bugs reais (contraste insuficiente, área não navegável por teclado, primitivo
100%-light-only) que só foram encontrados porque essa infraestrutura existe.

## Ordem de verificação recomendada

1. **`npm run lint`** — deve terminar em 0 erros. `eslint-plugin-jsx-a11y` está ativo; novos
   `warn` são aceitáveis apenas se já fizerem parte do débito documentado (ver
   `accessibility/SKILL.md`), nunca como resultado direto da mudança atual.
2. **`npx tsc -b --noEmit`** — 0 erros de tipo.
3. **`npx playwright test tests/e2e/accessibility.spec.ts`** — se a mudança tocou login, dashboard,
   Pipeline CRM ou Configurações (as 4 telas já cobertas por `axe-core`). Falha em qualquer
   violação `critical`/`serious`.
4. **`npx playwright test tests/e2e/visual.spec.ts`** — se a mudança alterou aparência de
   dashboard, CRM ou formulário de contato (light/dark já têm baseline commitada em
   `tests/e2e/visual.spec.ts-snapshots/`). Uma mudança visual intencional exige atualizar a
   baseline (`--update-snapshots`) e justificar o diff, não apenas fazer o teste passar.
5. **Specs funcionais relevantes** (`crm.spec.ts`, `auth.spec.ts`, `contact-company-forms.spec.ts`,
   `command-palette.spec.ts`, `leads-crud.spec.ts`) — rode o(s) spec(s) do fluxo tocado para
   confirmar que a mudança visual não quebrou comportamento (regra visual #10).

## Quando não há navegador interativo disponível

Sessões anteriores deste projeto já documentaram rodadas inteiras de QA sem acesso a navegador
interativo (ver seção "Verificação" de `DESIGN_QA_CENTRAL_ATLASGR.md`). Nesse cenário:

- Playwright headless (`npx playwright test`) continua funcionando e é a fonte de verdade —
  prefira sempre a ele sobre inspeção estática de código.
- Se nem Playwright headless estiver disponível, **declare explicitamente** que a verificação
  visual não foi possível e liste os itens específicos que precisam de confirmação manual depois —
  não afirme "funciona visualmente" sem tê-lo verificado de alguma forma. Isso já é a convenção
  deste projeto (ver como o próprio `DESIGN_QA_CENTRAL_ATLASGR.md` lista pendências de verificação
  visual manual explicitamente em vez de assumir sucesso).

## Verificação nas duas marcas

Sempre que a mudança tocar cor, contraste ou qualquer coisa condicionada a `data-brand`, verifique
em **AtlasGR e Total Trac**, light e dark — 4 combinações. Um bug real deste projeto (vazamento de
laranja da AtlasGR em componentes usados pela Total Trac) só existia porque a verificação tinha
sido feita apenas na marca default.

## O que reportar ao final

Ao encerrar uma tarefa de UI, o relato para o usuário deve deixar claro:

- O que foi verificado de fato (comandos rodados, resultado).
- O que **não** pôde ser verificado (ex.: navegador indisponível) e continua pendente de
  confirmação manual — nunca omitir isso para parecer mais concluído do que está.
- Se a baseline de regressão visual foi atualizada, por quê (mudança intencional) — nunca
  atualizar a baseline só para fazer um teste vermelho passar sem revisar o diff.
