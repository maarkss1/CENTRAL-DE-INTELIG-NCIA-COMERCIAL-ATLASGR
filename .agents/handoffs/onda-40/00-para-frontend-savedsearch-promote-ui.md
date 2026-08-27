- De: 00 (auditoria CPI, onda 40)
- Para: dono de `src/features/prospecting/components/**` (Agente de Prospecção/UI)
- Onda: 40
- Status: aberto
- Prioridade: normal

## Problema

O checklist CPI apontava "funil técnico-comercial quebra no primeiro elo (busca→lead)": um Lead
promovido nunca guardava de qual `SavedSearch` (busca salva) o candidato que o originou veio.

Fechei a metade de backend nesta onda: `Lead.savedSearchId` (nullable, `onDelete: SetNull`) +
`PromoteInput.savedSearchId` em `prospecting.service.ts` — se o body de `POST /api/prospecting/
promote` incluir `savedSearchId`, ele é persistido no Lead criado.

O que falta é a metade de UI: hoje `SavedSearchesModal.tsx` (`handleRun`, linha ~90-106) executa
`POST /saved-searches/:id/run`, recebe `{ count, savedSearch, candidates }` de volta, mas **descarta
`candidates`** — só mostra um toast com a contagem e reaplica os `criteria` de volta no formulário
de descoberta genérico (`onApplyCriteria`). Como consequência, o fluxo real de "promover um
candidato" (`ProspectingHub.tsx` → botão de promover → `POST /prospecting/promote`) nunca tem o
`savedSearchId` em mãos, porque os candidatos que chegam até ele vieram de uma nova descoberta
genérica, não da execução da busca salva.

## Alteração necessária (decisão de UX, não só técnica)

Uma forma de fechar isso (não a única — avalie o que faz mais sentido para o fluxo real do
produto):
1. `SavedSearchesModal.handleRun` passa a guardar `res.candidates` em estado e exibi-los (mesmo
   componente/lista de candidato já usado em `ProspectingHub.tsx`, se puder ser reaproveitado) em
   vez de só reaplicar os critérios.
2. O botão de promover, quando acionado a partir desses candidatos, inclui `savedSearchId:
   search.id` no body de `POST /prospecting/promote`.

## Por que não fiz isso nesta onda

É uma mudança de UI real (novo estado, nova lista renderizada dentro do modal, novo botão de ação)
— não é um ajuste de schema/backend que dá pra fechar sem tocar em composição de tela. Merece
passar pelo processo de Direção de Arte da Constituição de Design Engineering
(`.claude/CLAUDE.md` seção 7) antes de implementar, o que está fora do escopo desta rodada de
remediação backend.

## Arquivo(s) envolvido(s)

- `src/features/prospecting/components/SavedSearchesModal.tsx` (`handleRun`, linha ~90-106)
- `src/features/prospecting/components/ProspectingHub.tsx` (fluxo de promoção existente, para
  reaproveitar o componente de candidato/botão já existente em vez de duplicar)

## Teste esperado

Promover um candidato a partir da lista de uma busca salva persiste `Lead.savedSearchId` igual ao
id da busca — verificável hoje mesmo no backend (`promoteToCrm({ ..., savedSearchId })`), só falta
o caminho de UI que preenche esse campo de verdade.
