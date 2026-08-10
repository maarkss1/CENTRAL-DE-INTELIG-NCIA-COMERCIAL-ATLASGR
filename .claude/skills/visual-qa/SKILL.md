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

## Amplitude do QA é proporcional ao risco, não um checklist cego

A "Ordem de verificação recomendada" acima é o teto, não um mínimo fixo pra toda mudança. Antes de
decidir o que rodar, avalie o risco real: um ajuste pontual de texto/espaçamento numa tela isolada
não precisa das mesmas combinações que uma mudança em autenticação, layout compartilhado
(`MainLayout`, `Sidebar`), ou primitivo de design system (`src/components/ui/`) — essas últimas
afetam múltiplas telas e justificam QA amplo: desktop, mobile, light, dark, AtlasGR, Total Trac,
navegação por teclado, foco visível, overflow horizontal, contraste, `prefers-reduced-motion`,
console do navegador (sem erros novos) e screenshot. Não pule QA proporcional por preguiça, mas
também não rode todas as combinações cegamente em toda alteração pequena — isso não é rigor, é
desperdício que não escala.

## Classificação de warnings — nem todo warning é ignorável, nem todo warning bloqueia

Ao rodar lint/typecheck/build, classifique cada warning encontrado:

1. **Causado pela alteração** — corrija antes de reportar concluído, sempre.
2. **Relacionado à alteração** (no mesmo arquivo/fluxo, mas não introduzido por ela) — corrija se
   for barato; senão, registre explicitamente no relato final.
3. **Pré-existente, sem relação** — não corrija por conta própria (expandiria o escopo sem pedido),
   mas registre no relato final se for relevante ao que foi tocado.
4. **Fora de escopo** — não mencione, não persiga.

"Warning" não significa "pode ignorar" nem "precisa investigar tudo": a classificação acima é o que
decide a ação, não a palavra "warning" em si.

## Quando não há navegador interativo ou suíte oficial disponível

Sessões anteriores deste projeto já documentaram rodadas inteiras de QA sem acesso a navegador
interativo (ver seção "Verificação" de `DESIGN_QA_CENTRAL_ATLASGR.md`) e o Piloto 001 encontrou o
mesmo bloqueio (sem Docker/Postgres/Redis para o servidor Express que os specs oficiais exigem — ver
`.claude/PILOTS.md`). Quando a suíte oficial não puder rodar por limitação real de ambiente, siga
este protocolo:

1. **Registre exatamente o bloqueio** — o que não rodou e por quê (ex.: "sem Postgres/Redis, o
   `webServer` do Playwright não sobe").
2. **Nunca declare que um teste passou se ele não rodou.** Isso vale mesmo sob pressão de "terminar
   a tarefa" — reportar um falso verde é pior que reportar um bloqueio real.
3. **Execute a melhor validação alternativa possível** dentro do que o ambiente permite.
4. **Explique a diferença** entre o teste oficial e a validação alternativa no relato final — não
   deixe implícito que são equivalentes.
5. **Nunca substitua silenciosamente** um teste por outro e o apresente como se fosse o mesmo.

O Piloto 001 é uma referência **conceitual** do que uma validação alternativa pode parecer quando a
tela não depende de backend (build estático real via `vite preview` + Playwright + `axe-core` em
múltiplos viewports/temas) — não uma receita obrigatória para toda tela. Uma tela que depende de
dados/autenticação pode não ter alternativa equivalente; nesse caso, o passo 1-2 (registrar o
bloqueio, não fingir que passou) já é o comportamento correto, mesmo sem passo 3.

## Harness/script de investigação temporário nunca vira teste oficial por cópia direta

Achado real do Piloto 002 (`.claude/PILOTS.md`): medir performance do Kanban com datasets grandes e
validar comportamento mobile precisou de scripts descartáveis (semear centenas de leads via Prisma
direto, abrir browser manualmente, medir `PerformanceObserver`/`longtask`) — ferramentas de
diagnóstico, não testes. Eles viveram fora do Git (`.tmp-*`, apagados ao final da investigação) e
nenhum virou arquivo de teste oficial por simples copy-paste.

Quando uma investigação descartável revela um comportamento que vale a pena proteger com teste
permanente, **reescreva-o contra a infraestrutura real do repo** (`tests/e2e/helpers.ts`,
`signUp()`, seeds via API autenticada como os specs já existentes fazem) em vez de promover o
script bruto. Só promova depois de rodar repetidamente e confirmar estabilidade (não flakiness) —
foi o caso do teste de touch/mobile deste piloto (`tests/e2e/crm-kanban-mobile.spec.ts`), que só
entrou na suíte oficial depois de reescrito nesses termos e validado por múltiplas execuções
consecutivas sem falha.

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
