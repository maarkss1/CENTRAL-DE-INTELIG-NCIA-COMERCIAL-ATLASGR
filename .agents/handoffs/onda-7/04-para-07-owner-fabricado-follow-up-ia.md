- De: Agente 04 (CRM e BI)
- Para: Agente 07 (IA e Automações)
- Onda: 7
- Status: aberto
- Prioridade: alto

## Problema

`createFollowUpTaskTool` (`src/features/intelligence/tools/opsTools.ts`) cria uma `Activity`
(`activityService.create`) para um vendedor humano executar depois — o próprio comentário do
arquivo diz isso: "a IA não conduz a ação externa (ligação, e-mail), apenas agenda o lembrete".
Quando a ferramenta não recebe um `owner` explícito, ela grava o literal `'Enxame de IA Atlas'`
como responsável (`opsTools.ts:31`):

```ts
owner: owner || 'Enxame de IA Atlas',
```

Isso é exatamente o padrão que a mission do Agente 04 e o `AGENTS.md` raiz proíbem — nome
hardcoded mascarando ausência de responsável real ("nenhuma métrica comercial pode ser fabricada
para preencher a interface"; "não usar... fallback que mascara ausência de owner"). A tarefa é
para um humano executar, mas o campo `owner` (exibido em `ActivityList.tsx`/`Calendar.tsx` e
usado no relatório de performance por responsável) passa a apontar para um nome de swarm de IA que
não é a pessoa de fato encarregada — pior do que deixar visível que não há responsável definido.

Adicionei um guard em `src/features/activities/services/activity.service.ts`
(`assertRealOwner`) que agora **rejeita** esse valor especificamente (e alguns outros nomes de
preenchimento conhecidos) na criação/edição de `Activity` — então, a partir desta correção, uma
chamada da ferramenta sem `owner` explícito vai falhar com erro 422 (`"Enxame de IA Atlas" não é
um responsável real...`) em vez de gravar o placeholder. Isso evita o dado fabricado, mas troca o
sintoma: a ferramenta de IA vai começar a devolver erro sempre que não tiver um owner real para
passar, em vez de silenciosamente inventar um.

## Arquivo(s) envolvido(s)
- `src/features/intelligence/tools/opsTools.ts:31` (`createFollowUpTaskTool`)
- Padrão semelhante, mesmo domínio, não necessariamente o mesmo model: `owner: payload.owner ||
  'Enxame de IA AtlasGR'` em `src/features/intelligence/services/aiPendingAction.service.ts:78` —
  não investiguei esse a fundo (model fora do meu escopo), mas vale conferir se tem o mesmo
  problema.

## Alteração necessária
Na ferramenta, resolver um responsável real em vez de usar um texto fixo quando `owner` não é
informado — por exemplo, usar o `Lead.owner` do próprio lead (o vendedor já responsável por ele),
já que a tarefa é sobre esse lead. Se nem isso existir (lead sem responsável), a ferramenta deveria
devolver uma mensagem pedindo o responsável explicitamente, em vez de criar a atividade com um
nome fabricado — mesmo princípio de "ausência de responsável é um estado de dados visível, não
mascarado" já aplicado ao `Lead.owner` no meu domínio.

## Teste esperado
- Teste unitário/integração da tool confirmando que, sem `owner` explícito, ela resolve o
  responsável real do lead (ou falha de forma visível) em vez de gravar
  `'Enxame de IA Atlas'`.
- Regressão confirmando que `activityService.create`/`update` agora rejeitam esse literal (já
  coberto por teste no meu lado, `tests/unit/features/activities/services/activity.service.test.ts`).

## Contexto adicional
Achado durante a auditoria de forecast/BI da Onda 7 (mission do Agente 04, item "Sem owner
fictício"). `Activity.owner` é campo de texto livre por desenho (o formulário humano deixa digitar
qualquer responsável) — o problema não é o tipo do campo, é um chamador automatizado usando um
nome fixo como substituto de "não sei quem é o responsável".
