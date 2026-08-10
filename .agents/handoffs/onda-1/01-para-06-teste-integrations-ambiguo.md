- De: Agente 01 (Plataforma, Segurança e Dados)
- Para: Agente 06 (Integrações e Bitrix)
- Onda: 1
- Status: resolvido
- Prioridade: alto

## Problema

`npm run test:unit` falha em 1 de 74 arquivos (456/457 testes passando):

```
tests/unit/features/integrations/components/Integrations.test.tsx
 ❯ getMultipleElementsFoundError
   35: expect(screen.getByText('Integrações')).toBeInTheDocument();
   37: expect(screen.getByRole('button', { name: /WhatsApp/ })).toBeInTheDocument();
```

`getByRole('button', { name: /WhatsApp/ })` casa com **dois** elementos: o botão de aba da
sidebar ("WhatsApp") e o botão de ação do painel de conteúdo ("Conectar WhatsApp" — visível no
dump de DOM do teste, dentro do card com o título "WhatsApp"). A regex `/WhatsApp/` não é
ancorada, então também casa com "Conectar WhatsApp".

Este teste (e o componente `Integrations.tsx` que ele cobre) pertence ao escopo do Agente 06
(tela de Integrações). Não alterei o arquivo — apenas diagnostiquei a causa raiz ao rodar o gate
de validação da Onda 1.

## Arquivo(s) envolvido(s)
- `tests/unit/features/integrations/components/Integrations.test.tsx:37` (query ambígua)
- `src/features/integrations/components/Integrations.tsx` (componente sob teste — confirmar se o
  botão "Conectar WhatsApp" é realmente o elemento esperado ali antes de mudar só o teste)

## Alteração necessária
Ancorar a query do botão de aba para não casar com o botão de ação do painel, por exemplo:

```ts
expect(screen.getByRole('button', { name: /^WhatsApp$/ })).toBeInTheDocument();
```

ou usar um seletor mais específico (ex.: `within(sidebarNav).getByRole(...)`, ou `data-testid` na
aba). Mesma ambiguidade pode existir também nas outras 3 asserções da linha 38-40 (Google
Workspace / Bitrix24 / PABX 3CX) caso o painel de cada uma tenha um botão de ação cujo texto
também contenha o nome da aba — vale conferir as quatro, não só a primeira que falhou.

## Teste esperado
`npm run test:unit` retornando 74/74 arquivos e 457/457 testes verdes (paridade com o baseline da
Onda 0, que já estava 100% verde antes deste teste ser adicionado).

## Contexto adicional
- Este teste não existia no baseline da Onda 0 (`.agents/runs/baseline.md`, 430 testes, 0
  falhas) — foi adicionado depois, junto com outras mudanças de RBAC/Bitrix num commit único
  ("Auto sync") que misturou escopo do Agente 01 e do Agente 06 na mesma branch
  (`agente/01-plataforma-dados`). Não é uma regressão introduzida pela minha auditoria de
  autorização desta rodada — os `requireRole(...)` que adicionei em `bitrix.routes.ts`/
  `whatsapp.routes.ts`/etc. não tocam este componente de frontend nem seus testes.
- Fora este item, o gate obrigatório da Onda 1 (`tsc --noEmit`, `lint`, `test:unit`, `build`)
  está verde no meu escopo — ver relatório de saída em
  `.agents/runs/onda-1-agente-01.md` (quando publicado).

## Resolução
Investiguei como Agente 06 (dono de `src/features/integrations/**`). Causa raiz confirmada
exatamente como suspeitado: `getByRole('button', { name: /WhatsApp/ })` casava tanto com a aba
"💬 WhatsApp" da sidebar quanto com o botão de ação "Conectar WhatsApp" do painel de conteúdo.

Corrigido nos dois lados:
- `src/features/integrations/components/Integrations.tsx`: a lista de abas agora é um
  `<nav aria-label="Módulos de integração">` (era um `<div>` sem landmark nenhum) — além de
  resolver a ambiguidade do teste, dá um marco semântico real de navegação pra leitor de tela,
  que antes não existia.
- `tests/unit/features/integrations/components/Integrations.test.tsx`: as 4 asserções de
  `getByRole('button', ...)` agora usam `within(getByRole('navigation', {name: 'Módulos de
  integração'}))` em vez de `screen` direto.

`npm run test:unit` local: 3/3 testes deste arquivo verdes. `tsc --noEmit` e `eslint` limpos
(0 erros; 2 warnings jsx-a11y pré-existentes, sem relação com esta mudança, débito conhecido do
Agente 03).
