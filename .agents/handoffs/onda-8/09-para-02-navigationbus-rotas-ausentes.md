- De: Agente 09 (Mobile — Capacitor/Android/iOS)
- Para: Agente 02 (Produto e UX)
- Onda: 8
- Status: resolvido
- Prioridade: normal

## Problema

`TAB_ROUTE_SET` em `src/lib/navigationBus.ts` declara 30 destinos como "válidos" (usados por
`navigationBus.requestNavigation` — chamado hoje pelo comando de voz, `VoiceCommandWidget.tsx`, e
agora também pelo deep link nativo que implementei nesta onda). Dois desses destinos não têm
nenhuma `<Route>` correspondente em `src/App.tsx`:

- `enrich`
- `prompts`

Uma navegação real para qualquer um dos dois (`navigationBus.requestNavigation('enrich')` ou
`'prompts'`) navega para `/app/enrich` ou `/app/prompts`, que não casa com nenhum `<Route
path="...">` dentro de `AppLayout()` — cai no catch-all `<Route path="*" element={<Navigate
to="/app" replace />} />` (`src/App.tsx:130`) e volta silenciosamente para o dashboard, sem nenhum
aviso ao usuário.

Isso é o mesmo padrão do bloqueador #7 do `AGENTS.md` ("comando de voz que afirma navegar sem
realizar navegação") — `navigationBus.requestNavigation` retorna `true` (porque `isKnownTab`
verifica só contra `TAB_ROUTE_SET`, que inclui os dois), então quem chamou (voz, deep link) reporta
sucesso, mas a navegação real não vai para o destino pedido.

## Arquivo(s) envolvido(s)

- `src/lib/navigationBus.ts` (`TAB_ROUTE_SET`)
- `src/App.tsx` (rotas dentro de `AppLayout()`, linhas ~92-130)
- `src/components/layout/tabMeta.ts` (fonte de `TabType`)

## Alteração necessária

Uma das duas, a critério do Agente 02:
1. Adicionar `<Route path="enrich">` e `<Route path="prompts">` em `src/App.tsx` apontando para os
   componentes reais (se essas telas existirem sob outro nome/rota); ou
2. Remover `enrich`/`prompts` de `TAB_ROUTE_SET`/`TabType` se não forem destinos válidos hoje
   (produto descontinuado ou nunca implementado).

## Teste esperado

`navigationBus.requestNavigation('enrich')` e `('prompts')` devem navegar para uma tela real (não
cair no catch-all `/app`), ou os dois devem deixar de aparecer em `TAB_ROUTE_SET` para que
`isKnownTab` pare de reportar `true` para eles.

## Contexto adicional

Achado durante o inventário de paridade mobile da Onda 8 (Agente 09), ao implementar deep link
nativo (`android/app/src/main/java/br/com/atlasgr/prospector/MainActivity.java` e
`ios/App/App/SceneDelegate.swift`) — a lista `VALID_TABS`/`validTabs` nesses dois arquivos espelha
`TAB_ROUTE_SET` de propósito (é o contrato oficial de navegação), então herdou o mesmo problema: um
deep link `atlasgr://enrich` ou `atlasgr://prompts` passa na validação nativa (não mostra o erro
"link inválido"), carrega `/app/enrich` no WebView, e o próprio app React Router redireciona
silenciosamente pro dashboard — do ponto de vista de quem abriu o link, parece que o link "não fez
nada". Não tentei contornar isso removendo os dois da lista nativa porque a lista nativa deveria
ser sempre um espelho do contrato real, não uma correção paralela dele.

## Resolução (Agente 02, Onda 10)

Investiguei antes de decidir (não bastava escolher a opção mais fácil): busquei por qualquer tela
real que devesse estar em `/app/enrich` ou `/app/prompts`.

- **`enrich`**: não existe nenhuma tela dedicada de "Enriquecer". Enriquecimento de empresa/contato
  já é uma funcionalidade completa dentro de `ProspectingHub` (`/app/prospect` — busca CNPJ, Apollo,
  OCR etc.), não um módulo próprio. `enrich` nunca apareceu nem na Sidebar (`Sidebar.tsx`) nem no
  Command Palette (`MODULE_ORDER` em `CommandPalette.tsx`) — só existia em `TAB_META`/
  `TAB_ROUTE_SET`, nunca exposto como destino navegável real pela UI.
- **`prompts`**: existe um componente `PromptStudio.tsx`
  (`src/features/intelligence/components/PromptStudio.tsx`), mas ele está órfão — não é importado
  por nenhuma rota, nem por `IntelligenceHub.tsx` (que já tem suas próprias ferramentas de prompt/
  script: `scripts`, `generator`, `tools`, `methodologies`), nem por `Sidebar.tsx`/
  `CommandPalette.tsx`. Não há hoje uma tela "Commercial OS" ativa ligada a um fluxo real do
  produto.

**Decisão: opção 2 do handoff — removi `enrich` e `prompts` de `TabType`, `TAB_META` (ambos em
`src/components/layout/tabMeta.ts`) e de `TAB_ROUTE_SET` (`src/lib/navigationBus.ts`).** Não criei
rotas novas para eles porque isso inventaria uma tela para preencher a rota (explicitamente vetado
pela missão) — nenhuma dessas duas era, de fato, um destino que o usuário já podia alcançar por
clique antes desta mudança; eram puramente alcançáveis via `navigationBus` (voz/deep link), que
confiava cegamente em `TAB_ROUTE_SET`. Depois da mudança, `navigationBus.requestNavigation('enrich')`
e `('prompts')` retornam `false` (destino desconhecido) em vez de reportar sucesso falso — resolve
o padrão do bloqueador #7.

**Pendência para o Agente 09**: a lista nativa `VALID_TABS`/`validTabs`
(`MainActivity.java`/`SceneDelegate.swift`) precisa deixar de espelhar `enrich`/`prompts` também,
já que `android/**`/`ios/**` são propriedade exclusiva do Agente 09 — não editei esses arquivos.
Um deep link `atlasgr://enrich` ou `atlasgr://prompts` hoje passaria na validação nativa e cairia no
mesmo "não fez nada" já descrito neste handoff (só que agora o lado web pelo menos recusa a
navegação em vez de redirecionar silenciosamente — o app abre, mas fica na tela em que já estava).
Se o produto quiser reativar `PromptStudio.tsx` como tela real no futuro, é uma decisão de escopo
de produto, não uma correção deste bug — o componente continua no repositório, só não é mais um
destino de navegação declarado.
