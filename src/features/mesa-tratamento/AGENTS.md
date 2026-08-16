# Mesa de Tratamento SDR

Mesa de trabalho lead-a-lead para o SDR (papel `VENDEDOR`): busca a fila de
leads do Bitrix24 atribuídos ao usuário logado, importa pro Prisma quando
necessário, prioriza, e permite registrar o resultado do contato — que é
propagado de volta ao Bitrix24 (comentário na timeline + atualização de
etapa/motivo de desqualificação) usando a integração já existente em
`src/features/integrations/bitrix/`.

## Escopo desta entrega (MVP)

- `GET /api/mesa-tratamento/queue` — fila priorizada do usuário logado
  (ou, para ADMIN/GESTOR, a fila do time todo).
- `POST /api/mesa-tratamento/lead/:id/register` — atualiza o Lead local,
  comenta na timeline do Bitrix e exporta a etapa/motivo.
- Frontend: fila lateral + card do lead atual + formulário de registro.

## Deliberadamente fora desta entrega (ver histórico do protótipo HTML)

- Pontuação do lead com detalhamento por fator.
- Sugestões de roteiro de ligação/mensagem (script coach).
- Comando de voz (ditado e comandos).
- Criação de negócio no funil Comercial com anexos dinâmicos por campo real
  do Bitrix (`crm.deal.fields`).
- Painel de gestão com ações (reatribuir responsável, comentar, marcar
  como decidido) — hoje ADMIN/GESTOR só veem a mesma fila, sem ação extra.
- Login próprio — reusa inteiramente `AuthContext`/`ProtectedRoute` do Atlas.

## Decisões de reuso (não duplicar)

- Import/listagem Bitrix: `src/features/integrations/bitrix/service/leads.ts`
  (`listBitrixLeads`, `findUnimportedBitrixLeadIds`, `importSelectedBitrixLeads`).
- Escrita de volta ao Bitrix: `src/features/integrations/bitrix/service/outboundSync.ts`
  (`postCommentToBitrix`, `exportLeadToBitrixNow`) via o barrel
  `bitrix.service.ts` — ambas operam sobre o `Lead` local (precisa estar
  importado, com `bitrixLeadId` preenchido).
- Motivo de desqualificação: `Lead.lossReason` já é mapeado para
  `UF_CRM_1770065854148` em `bitrixFieldMap.ts` — só setar o campo local,
  `exportLeadToBitrixNow` propaga sozinho. Lista de opções em
  `constants/lossReasons.ts`, extraída de `bitrix_fields.json` (raiz do
  repo) — se o Bitrix mudar essas opções, atualizar ali.
- Escopo "só meus leads" para VENDEDOR: mesmo princípio de
  `resolveScopedAssignedById` em `bitrix.routes.ts` (função não exportada,
  reimplementada aqui com as mesmas peças exportadas —
  `getBitrixUsers`/`resolveOwnBitrixUserId`).
