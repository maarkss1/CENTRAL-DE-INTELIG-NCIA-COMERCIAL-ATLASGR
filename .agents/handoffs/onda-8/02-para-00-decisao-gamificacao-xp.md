- De: Agente 02 (Produto e UX)
- Para: Coordenador (00)
- Onda: 8
- Status: resolvido
- Prioridade: normal

## Problema

`.agents/completion/01-bloqueadores.md` registra a pendência: "Gamificação da prospecção é
estado local puro (XP some no reload) — decidir produto antes de persistir." A missão da Onda 8
me pediu para decidir entre (a) manter como decoração efêmera com UI honesta, ou (b) abrir handoff
técnico para o Agente 01A propor schema de persistência.

## Investigação

Existem DOIS componentes de gamificação distintos no repositório, e a nota do bloqueador se
refere ao segundo, não ao primeiro:

1. **`src/features/gamification/components/GameWidget.tsx` + `SpaceGame.tsx`** — minijogo 3D
   (nave coletando "leads" com `@react-three/fiber`), `score` em `useState` puro. Propriedade
   exclusiva do Agente 02 nesta onda. Confirmado por busca em toda a árvore `src/`: **nenhum
   arquivo importa `GameWidget` ou `SpaceGame` fora deles mesmos** — é código órfão, inalcançável
   por qualquer rota ou componente montado hoje. `CLAUDE.md` (seção 1) descreve este arquivo como
   "usada hoje só num widget de gamificação decorativo" — essa frase está desatualizada; vale
   correção por quem mantém `CLAUDE.md`, mas não é decisão que eu deva tomar sozinho editando a
   constituição.

2. **`src/components/ui/GamificationWidget.tsx`** — o widget real que o usuário vê: "Missões
   Diárias" com XP/nível/streak, montado em `src/features/prospecting/components/ProspectingHub.tsx`
   (linha 402). É este que corresponde à descrição do bloqueador ("XP some no reload"): `xp`,
   `missions` (checklist auto-reportado, marcado manualmente pelo usuário) e `showMissions` vivem
   em `useState`, sem `localStorage`/backend — cada reload zera o progresso da sessão. Este arquivo
   está em `src/components/ui/**`, propriedade exclusiva do **Agente 03** nesta onda (ver matriz de
   propriedade em `.agents/runs/onda-8.md`) — não é meu para editar.

   Importante: uma onda anterior já corrigiu a parte de "verdade cenográfica" deste widget (ver
   comentário já existente nas linhas 12-18 do arquivo) — os defaults eram fixos (Level 12, 12.480
   XP, "5 Dias Seguidos", 2 missões já marcadas) e apareciam para qualquer usuário como se fosse
   histórico real. Hoje os defaults começam zerados e não há nenhum texto do tipo "seu progresso é
   salvo" em lugar nenhum do componente. Ou seja: a parte de honestidade textual (não prometer o
   que não existe) já está resolvida — o que falta decidir é só persistência.

## Decisão

**Opção (a) — manter como decoração efêmera, sem abrir handoff de schema para o Agente 01A.**

Razões:
- As "missões" são um checklist **auto-reportado** (o próprio usuário marca "Completar perfil do
  SDR", "Qualificar 5 novos leads hoje" etc. manualmente), não uma leitura de dado real de
  atividade/CRM. Persistir esse dado em banco de produção como se fosse histórico oficial de
  performance criaria uma fonte de "verdade" paralela e não verificável — o tipo de risco que
  `AGENTS.md` já pede para evitar em métricas comerciais ("nenhuma métrica comercial pode ser
  fabricada para preencher a interface"; aqui não seria fabricada, mas seria auto-declarada e
  tratada como se fosse medida).
- Não há, hoje, nenhum texto na UI que prometa persistência — a barra "reseta" junto com a própria
  natureza de "Missões **Diárias**" (o nome já comunica ciclo curto). O ponto de atrito real é
  perder o progresso no meio de uma sessão ao dar F5, não uma mensagem enganosa.
- Se o produto quiser recompensar engajamento **real** (leads qualificados de verdade, reuniões
  agendadas de verdade) com XP persistente, isso é um recorte de produto diferente — calcular XP a
  partir de `Activity`/`Lead` reais, não persistir o checklist auto-reportado atual. Não faz
  sentido abrir uma migration de schema para persistir um número que hoje não é derivado de nada
  verificável.

**Não implementei nenhuma mudança de código nesta decisão** além de um comentário em
`GameWidget.tsx` (arquivo da minha propriedade) registrando o mesmo princípio para o componente
órfão. Não editei `src/components/ui/GamificationWidget.tsx` (propriedade do Agente 03 nesta onda)
— nenhuma mudança é necessária nele para esta decisão, já que a parte de honestidade textual já
estava corrigida antes desta onda.

## Ação recomendada para o Coordenador

Marcar a pendência em `.agents/completion/01-bloqueadores.md` ("Gamificação da prospecção é
estado local puro...") como decidida: opção (a), sem persistência, pelas razões acima. Nenhum
handoff bloqueador pendente relacionado a este item.

## Contexto adicional

- `src/features/gamification/components/GameWidget.tsx` e `SpaceGame.tsx` continuam no
  repositório como código órfão (não removi, já que remoção de código não estava no escopo pedido
  e nenhuma outra tela referencia esses arquivos para eu confirmar com segurança que a remoção é
  inofensiva a médio prazo). Se o Coordenador quiser, isso pode virar um item de limpeza técnica
  separado (não é bloqueador de release).
