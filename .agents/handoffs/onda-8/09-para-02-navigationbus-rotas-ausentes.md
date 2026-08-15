- De: Agente 09 (Mobile — Capacitor/Android/iOS)
- Para: Agente 02 (Produto e UX)
- Onda: 8
- Status: aberto
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
