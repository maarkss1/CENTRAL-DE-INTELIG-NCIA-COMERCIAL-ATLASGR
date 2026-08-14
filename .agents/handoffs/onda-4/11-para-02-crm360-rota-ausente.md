- De: 11 (Marca e Ativos Institucionais)
- Para: 02 (Produto e UX)
- Onda: 4
- Status: aberto
- Prioridade: bloqueador

## Problema
O item de menu "Cockpit CRM" (`crm360`) está presente na Sidebar (`coreTools`) e em `TAB_META`,
navega para `/app/crm360`, mas não existe nenhuma `<Route path="crm360">` dentro do bloco `/app/*`
em `src/App.tsx`. O React Router cai no catch-all (`<Route path="*" element={<Navigate to="/app"
replace />} />`) e redireciona silenciosamente de volta ao Dashboard — sem erro visível, sem
loading, sem mensagem. Do ponto de vista do usuário, o clique "não faz nada" (na prática, volta pro
início).

O backend do módulo (`src/features/crm360/**`: routes, controller, use cases, repository, DI em
`src/shared/di/setup.ts`) e o componente de apresentação (`src/features/crm360/components/
CrmOverview.tsx`) já existem e parecem prontos — falta só registrar a rota no App.tsx (dono
exclusivo deste arquivo é o Agente 02, por isso não alterei diretamente).

Isto é o mesmo padrão do bloqueador global #7 da lista de `/AGENTS.md` ("Comando de voz que afirma
navegar sem realizar navegação") — aqui é um item de menu, não um comando de voz, mas o efeito para
o usuário é idêntico: a interface promete uma navegação que não acontece.

## Arquivo(s) envolvido(s)
- `src/App.tsx` (falta a `<Route path="crm360" element={<CrmOverview />} />` ou o wrapper correto,
  dentro do bloco de rotas relativas a `/app/*`, por volta da linha 84-119).
- `src/lib/navigationBus.ts` (linha 53-60) — **erro de compilação confirmado**. `TAB_ROUTE_SET:
  Record<TabType, true>` não inclui a chave `crm360`, então `npx tsc --noEmit` falha agora com:
  `error TS2741: Property 'crm360' is missing in type '{...}' but required in type
  'Record<TabType, true>'`. Isso não é só um erro de tipo cosmético: `isKnownTab()` usa esse mapa
  para decidir se `requestNavigation(tab)` (usado pelo comando de voz / navegação global) deve
  disparar a navegação — com `crm360` ausente, `isKnownTab('crm360')` retorna `false` e o comando de
  voz também falharia silenciosamente para este módulo, o mesmo padrão do bloqueador #7 global.
- Consumidores já existentes, não precisam de mudança: `src/components/layout/Sidebar.tsx` (linha
  47), `src/components/layout/tabMeta.ts` (linha 17), `src/features/crm360/components/
  CrmOverview.tsx`.

**Este erro de compilação bloqueia o gate obrigatório da onda (`npx tsc --noEmit`) para qualquer
branch que baixar a partir de `integracao/onda-4` até ser corrigido** — não é exclusivo do escopo
do Agente 11, mas foi descoberto rodando o gate aqui.

## Alteração necessária
1. Adicionar a rota `crm360` no bloco de `<Routes>` de `AppLayout()` em `src/App.tsx`, apontando
   para o componente de apresentação do módulo (`CrmOverview` ou o componente que ele expõe hoje).
2. Adicionar `crm360: true,` em `TAB_ROUTE_SET` (`src/lib/navigationBus.ts`, linha ~53-60) para
   corrigir o erro de compilação e destravar a navegação via comando de voz para este módulo.
3. Confirmar que `CrmOverview.tsx` já resolve dados via o hook/serviço correto (parece que sim,
   dado o DI já registrado em `setup.ts`) — só validar depois de a rota existir.
4. Enquanto a correção não é aplicada, considerar (decisão do Agente 02/Coordenador, não minha)
   remover temporariamente o item "Cockpit CRM" do menu para não expor uma ação quebrada ao
   usuário — ou aceitar o risco até a próxima onda, já que a Onda 3 explicitamente "ligou" este
   módulo (commit `3f6e336e feat(02): liga o Cockpit CRM (crm360), modulo orfao sem rota nem
   menu`) e parece ter faltado a rota nesse commit.

## Teste esperado
- Login → clicar em "Cockpit CRM" na Sidebar → URL muda para `/app/crm360` e permanece lá,
  renderizando o Cockpit CRM (não redireciona de volta para `/app`).
- `npx tsc --noEmit`, `npm run lint`, `npm run build` continuam verdes.
- Idealmente, um teste e2e (ou passo manual documentado) cobrindo esta navegação específica, já que
  o bug não aparece em nenhum teste existente (não houve erro de console nem exceção — é uma
  navegação silenciosamente incorreta).

## Contexto adicional
Encontrado durante auditoria de conteúdo institucional (Agente 11, Onda 4) ao conferir se
`documentacao-aplicacao/inventario/mapa-de-navegacao.md` batia com a estrutura real do menu.
Também notei, no mesmo arquivo `tabMeta.ts`, dois identificadores de `TabType` sem item de menu e
sem rota alguma: `enrich` ("Enriquecer") e `prompts` ("Commercial OS") — só existem porque
`TAB_META` é tipado como `Record<TabType, ...>` e exige uma entrada para cada valor do union. Não é
bloqueador (não há promessa de navegação visível ao usuário para eles, já que não aparecem em
nenhuma lista de Sidebar), mas é código morto que vale limpar quando o Agente 02 mexer neste
arquivo novamente — prioridade normal, não abri isso como um segundo handoff separado.
