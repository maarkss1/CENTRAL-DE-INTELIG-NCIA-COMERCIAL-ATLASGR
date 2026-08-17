- De: Agente 04 (CRM e BI)
- Para: Agente 07 (IA e Automações)
- Onda: 7
- Status: resolvido
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

## Resolução (Agente 07, Onda 10)

Corrigidos os dois pontos apontados, ambos na causa raiz (resolver responsável real), não só
sobrevivendo ao guard `assertRealOwner`:

1. **`opsTools.ts` (`createFollowUpTaskTool`)** — quando `owner` não vem explícito na chamada da
   ferramenta, ela agora busca o próprio `Lead` (`prisma.lead.findFirst({ where: { id: leadId,
   organizationId }, select: { owner: true } })`) e usa `Lead.owner` como responsável, já que a
   tarefa é sobre esse lead e o vendedor dono dele é o candidato natural. Três casos tratados
   explicitamente, sem nunca cair no placeholder:
   - lead não encontrado no tenant atual → mensagem de erro clara ("Lead ... não encontrado no
     CRM"), tarefa não é criada;
   - lead encontrado mas sem `owner` definido → mensagem pedindo o responsável explicitamente
     ("... ainda não tem um responsável definido no CRM ... Informe explicitamente quem deve
     executar este follow-up"), tarefa não é criada;
   - lead com `owner` definido → usa esse valor, mesmo texto que já apareceria em
     `ActivityList.tsx`/`Calendar.tsx`/relatório por responsável.
   `owner` explícito (quando informado) continua tendo prioridade e nunca dispara a consulta ao
   Lead.

2. **`aiPendingAction.service.ts:78` (`executeAction`, ramo `create_follow_up`)** — confirmado: é
   o mesmo problema, mesmo destino (`activityService.create`, mesmo model `Activity`), só um
   payload de origem diferente (`AIPendingAction.payload`, action aprovada manualmente pelo humano
   no Hub antes de ser executada — hoje sem gerador real de `action: 'create_follow_up'` no
   codebase, mas o executor central precisa tratar o tipo de forma correta mesmo assim, já que é
   dead-code defensivo, não inatingível). O guard `assertRealOwner` já bloquearia o literal na
   escrita (mesmo `activityService.create`), mas isso reduzia "sem responsável real" a um
   `send_failed` genérico dentro do ledger de auditoria — sem dizer por quê. Aplicada a mesma
   resolução (`Lead.owner` do `payload.leadId`, mesmo padrão de `prisma.lead.findFirst`); quando
   não há responsável resolvível, `executeAction` devolve um motivo específico e novo,
   `reason: 'missing_owner'`, e `executeAndRecord` grava esse motivo como `executionError` legível
   ("Lead sem responsável real definido no CRM — informe o responsável explicitamente para
   executar esta ação.") em vez do genérico "Falha ao executar a ação autônoma." — mantém o
   princípio de "ausência de responsável é um estado de dados visível, não mascarado" também na
   trilha de auditoria da ação aprovada, não só na resposta síncrona da tool.
   Nota: o `swarm_recommendation` no mesmo arquivo (linha 58, `author: 'Enxame de IA AtlasGR'`)
   **não** foi alterado — é `Note.author`, não `Activity.owner`; ali o autor da nota é
   legitimamente o enxame de IA que propôs a recomendação (auditoria de decisão autônoma), não um
   responsável humano por uma tarefa, então não é o mesmo padrão fabricado.

Arquivos alterados:
- `src/features/intelligence/tools/opsTools.ts`
- `src/features/intelligence/services/aiPendingAction.service.ts`
- `src/features/intelligence/tools/__tests__/opsTools.test.ts` (testes novos: owner explícito,
  resolução via `Lead.owner`, lead sem responsável, lead inexistente)
- `src/features/intelligence/services/__tests__/aiPendingAction.service.test.ts` (testes novos:
  owner explícito, resolução via `Lead.owner`, `missing_owner` em `executeAction` e em
  `executeAndRecord`/`executionError`)

Gate (ambiente sem Docker/Postgres — `test:integration`/`test:e2e` não executáveis localmente,
delegados ao CI do PR, ver `.agents/runs/onda-10.md` → "Limitação de ambiente conhecida"):
- `npx tsc --noEmit -p .` — limpo.
- `npm run lint` — 0 erros (73 warnings pré-existentes, nenhum nos arquivos tocados).
- `npm run test:unit` — verde (arquivos afetados + suíte completa).
- `npm run build` — verde.
