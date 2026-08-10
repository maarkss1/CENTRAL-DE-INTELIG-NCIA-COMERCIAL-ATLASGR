---
name: ui-ux
description: Use ao decidir composição, hierarquia, fluxo, estados de componente ou responsividade em qualquer tela deste CRM. Cobre os padrões de layout, densidade de informação e comportamento mobile (Capacitor/Android) já estabelecidos no projeto.
---

# UI/UX — Central de Inteligência Comercial ATLASGR

Este é um produto de uso diário e repetido (CRM comercial), não uma landing page — as decisões de
UX priorizam velocidade de tarefa e previsibilidade sobre impacto visual pontual.

## Composição e hierarquia

- Este projeto é organizado por feature (`src/features/<nome>/components/`), com 25+ módulos:
  crm, prospecting, roleplay, intelligence, analytics, automations, billing, gamification, etc.
  Antes de propor uma composição nova, veja como os módulos vizinhos resolvem o mesmo tipo de tela
  (lista, detalhe, formulário, dashboard) e mantenha a família visual.
- Regra visual do projeto: **hero centralizada não é o padrão default**. Reserve composição
  centralizada para telas de estado único (login, seleção de marca, empty state). Telas de
  trabalho (dashboard, pipeline, relatórios) usam grid/densidade de dados real, não composição de
  "página de produto".
- Não crie 3 cards visualmente idênticos só para simetria — se os dados não sustentam 3 itens
  paralelos, use lista, gráfico (`recharts`, já padrão em `Analytics.tsx`/`Billing.tsx`) ou
  composição assimétrica.

## Estados obrigatórios de todo componente interativo

Um componente não está pronto sem definir explicitamente:

- **Default / hover / focus-visible / active / disabled**
- **Loading** — use `src/components/ui/Skeleton.tsx` (já token-based, dark-mode correto) em vez de
  spinner genérico quando o layout final é conhecido.
- **Vazio** — use `src/components/ui/EmptyState.tsx`, já usado por `ContactList`/`CompanyList`
  como padrão de referência.
- **Erro** — mensagem acionável, não só "algo deu errado". Ver padrão de toast em
  `src/lib/toast.ts` / `Toaster.tsx`, já usado nos formulários de contato/empresa.

## Formulários

- Padrão do projeto: `react-hook-form` + `zod` (ver `ContactForm`/`CompanyForm`). Siga esse padrão
  em vez de estado manual de formulário.
- Modais de formulário usam `src/components/ui/Dialog.tsx` (suporta `maxWidth`, `footer`,
  `preventClose`) — não reimplemente um modal hand-rolled; isso já foi um débito real do projeto
  (`DESIGN_QA_CENTRAL_ATLASGR.md`, DQA-12) e a migração para `ui/Dialog` já está em andamento.
- Botão de submit pode ficar fora da tag `<form>` ligado via atributo `form="id"` dentro do
  `footer` do `Dialog` — padrão já usado, preserve-o ao editar formulários existentes.

## Responsividade e mobile

- Breakpoint de navegação principal é `lg` (1024px), não `md` — decisão documentada
  (`Sidebar.tsx` off-canvas abaixo de `lg`), porque rótulos de navegação em português são longos.
  Siga a mesma lógica em vez de escolher um breakpoint novo por tela.
- **Este app é distribuído como app Android real via Capacitor.** Qualquer tela nova precisa
  funcionar em viewport de celular de verdade (~360-420px de largura), não só "encolher
  graciosamente". Kanban/tabelas com `overflow-x-auto` sem tratamento mobile são um débito
  conhecido (`CrmBoard.tsx`) — não repita o padrão em telas novas.
- Tabelas densas (`ContactList`, `CompanyList`) já têm `Pagination` compartilhado
  (`src/components/ui/Pagination.tsx`) — reuse-o.

## Navegação

- Módulos são rotas reais sob `/app/*` (`react-router-dom`, migração já feita — ver DQA-17). Toda
  tela nova deve ser uma rota deep-linkável, nunca estado local tipo `useState<Tab>` alternando
  conteúdo sem mudar a URL.

## Checklist de saída

- [ ] Todos os estados (default/hover/focus/active/disabled/loading/vazio/erro) definidos.
- [ ] Formulário usa `react-hook-form` + `zod` + `ui/Dialog`, se aplicável.
- [ ] Testado mentalmente (ou de fato) em viewport de ~375px — não só desktop.
- [ ] Rota real (deep-linkável) se for uma tela/módulo, não alternância de estado local.
- [ ] Nenhuma grade de 3 cards idênticos sem justificativa de conteúdo.
