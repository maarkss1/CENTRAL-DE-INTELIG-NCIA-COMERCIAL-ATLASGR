- De: Agente 09 (Mobile — Capacitor/Android/iOS)
- Para: Agente 02 (Produto e UX)
- Onda: 8
- Status: aberto
- Prioridade: alto

## Problema

Minha missão da Onda 8 inclui garantir "comportamento explícito de stale/offline quando o
dispositivo perde conexão (nunca dado desatualizado apresentado como atual sem indicação)". Busquei
em todo `src/**` por detecção de conectividade no cliente (`navigator.onLine`,
`window.addEventListener('online'/'offline', ...)`, algum hook `useOnlineStatus`/`useNetworkStatus`
ou componente de banner "você está offline") e não encontrei nenhum. O único tratamento de rede
existente é por requisição individual: `src/lib/api.ts` (`apiFetch`) captura falha de `fetch` e
lança `"Não foi possível conectar ao servidor."` — isso cobre uma chamada isolada que falhou, mas
não cobre o caso central do requisito: **dado já carregado na tela continua sendo exibido como se
fosse atual mesmo depois do dispositivo perder conexão**, sem nenhuma indicação visual de que a
informação pode estar desatualizada.

Não consigo resolver isso dentro do meu escopo (`android/**`, `capacitor.config.ts`): a solução
correta é um hook compartilhado (ex. `useOnlineStatus`) + um indicador visual (banner/badge "sem
conexão — dados podem estar desatualizados") em `src/**`, usado tanto pela versão web quanto pela
versão empacotada em Capacitor — não posso criar uma segunda cópia dessa lógica só "pra versão
mobile" (proibido pelo `AGENTS.md` do Agente 09: "não duplicar lógica de negócio... funcionalidade
vem de `src/**`").

## Arquivo(s) envolvido(s)

- Novo hook sugerido: `src/hooks/useOnlineStatus.ts` (ou local equivalente já usado por outros
  hooks de estado global do app)
- Componente de indicador visual: idealmente em `src/components/layout/MainLayout.tsx` (mesmo nível
  onde `VoiceCommandWidget`/outros widgets globais já são montados) ou em `src/components/ui/`
  como primitivo reutilizável
- Pontos que já fazem cache/exibição de dados potencialmente desatualizados: dashboard
  (`SinglePageDashboard`), CRM board, listas de empresas/contatos — qualquer tela que mantém estado
  React de uma resposta anterior de API na tela

## Alteração necessária

1. Hook `useOnlineStatus()` baseado em `navigator.onLine` + listeners `online`/`offline` (funciona
   tanto no browser quanto dentro do WebView do Capacitor — não precisa de plugin nativo adicional
   para o caso básico de "tem ou não tem rede"; para detecção mais robusta de qualidade de conexão
   dentro do app nativo, o plugin oficial seria `@capacitor/network`, que exigiria aprovação do
   Coordenador para entrar em `package.json` — não é bloqueador para a versão básica).
2. Indicador visual persistente (banner fixo ou badge) quando offline, com texto explícito tipo
   "Sem conexão — os dados exibidos podem estar desatualizados", seguindo os tokens de
   `globals.css` (`--warn`) e o padrão de estados já definido pelo Agente 02/03.
3. Idealmente, junto de um timestamp "atualizado há Xmin" nas telas que exibem dados agregados
   (dashboard/analytics), para o usuário distinguir "sem conexão agora" de "dado desatualizado
   mesmo com conexão" (cache stale por outro motivo).

## Teste esperado

- Desligar a rede do dispositivo (ou simular offline no DevTools) com uma tela de dados já
  carregada aberta → indicador visual de offline aparece, dado continua visível mas com indicação
  de que pode estar desatualizado.
- Religar a rede → indicador some, próxima requisição bem-sucedida atualiza o timestamp/estado.

## Contexto adicional

Isso é um requisito explícito da missão do Agente 09 nesta onda (`.agents/prompts/09-mobile.md`,
seção "Offline e conectividade instável") que depende inteiramente de código fora do meu escopo de
edição. Registrando como handoff em vez de implementar uma versão paralela só pro app empacotado,
que violaria a regra de não duplicar lógica de negócio.
