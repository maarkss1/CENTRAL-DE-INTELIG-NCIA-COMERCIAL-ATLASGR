- De: Agente 02 (Produto, Navegação e UX)
- Para: Agente 06 (Integrações, Bitrix, Google, WhatsApp, 3CX e Voz)
- Onda: 1
- Status: resolvido
- Prioridade: bloqueador

## Problema

`navigationBus.requestTool(tool)` (`src/lib/navigationBus.ts`) despachava para um `Set` de
listeners que **nunca tinha nenhum inscrito de verdade** — nada no app chamava `subscribe`. Todo
comando de voz reportava sucesso ("Navegou para o CRM Board") incondicionalmente, sem nenhuma
navegação real acontecer. Bloqueador #7 do AGENTS.md ("Comando de voz que afirma navegar sem
realizar navegação"), confirmado por evidência de código, não só suspeita.

## Contrato acordado (implementado)

- **Destination id canônico**: `TabType` (`src/components/layout/tabMeta.ts`) — já era a fonte
  única usada por Sidebar/Topbar/Command Palette; `navigationBus` passou a reaproveitá-lo em vez
  de manter uma lista paralela (`NavigableTool` antigo só cobria 6 dos 26 destinos reais).
- **API**: `navigationBus.requestNavigation(tab: string): boolean` — só retorna `true` quando a
  navegação foi de fato disparada. `false` cobre os dois jeitos de falhar: destino desconhecido,
  ou nenhum navegador ainda registrado.
- **Ack real**: `navigationBus.registerNavigator(fn)` é chamado uma única vez, dentro do Router,
  por `useNavigationBusBridge()` (novo, `src/hooks/useNavigationBusBridge.ts`), montado em
  `MainLayout.tsx`. A função registrada chama `navigate()` de verdade (react-router).
- **Erro quando destino não existe / navegador ainda não montado**: `requestNavigation` retorna
  `false` sem lançar — quem chama decide a UX do erro.

## O que já apliquei do lado 06 (você pode ajustar)

Como estou operando os dois slots nesta sessão, já atualizei `VoiceCommandWidget.tsx` (seu domínio
de captura/comando de voz) para consumir o contrato corretamente:
- só anuncia sucesso quando `requestNavigation` retorna `true`;
- mostra "Não consegui navegar até aqui agora — tente de novo em instantes." quando retorna `false`;
- mostra "Não entendi o comando..." quando a frase reconhecida (resultado final, não interino) não
  bate com nenhum comando conhecido — antes, esse caso ficava em silêncio total.

Fique à vontade para revisar o vocabulário reconhecido (`textLower.includes(...)`) e a UX de erro —
isso é seu domínio; só garanti que o contrato de navegação por trás não minta mais.

## Teste esperado
Já entregue:
- `src/lib/__tests__/navigationBus.unit.test.ts` (4 testes — ack real, destino desconhecido, sem
  navegador registrado, cleanup);
- `tests/unit/hooks/useNavigationBusBridge.test.tsx` (3 testes — wiring real com react-router,
  caso `dashboard` → `/app`, desregistro no unmount);
- `tests/unit/components/ui/VoiceCommandWidget.test.tsx` (3 testes — sucesso, falha honesta, comando
  não reconhecido).

## Contexto adicional
`setActiveBrand('atlasgr'|'totaltrac')` (troca de marca por voz) não passa por este contrato — é
uma ação de contexto local síncrona e genuína (`BrandContext`), não uma navegação de rota, então
não tinha o mesmo problema.
