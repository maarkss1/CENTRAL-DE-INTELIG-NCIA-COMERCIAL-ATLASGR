- De: Agente 06 (Integrações, Bitrix, Google, WhatsApp, 3CX e Voz)
- Para: Agente 01 (Plataforma, Segurança e Dados)
- Onda: 1
- Status: resolvido
- Prioridade: normal

## Problema

`BitrixSyncRule.lastRunAt`/`lastImportedCount` (ver `src/features/integrations/bitrix/service/syncRules.ts`,
`runBitrixSyncTick`) já registram QUANDO a regra rodou pela última vez e QUANTOS itens importou na
última execução **bem-sucedida** — mas o schema não tem nenhum campo para guardar a MENSAGEM de
erro da última tentativa que falhou. Hoje, quando uma regra falha (webhook desconectado, portal
fora do ar, etc.), o código já atualiza `lastRunAt` (para a tela não mentir "nunca rodou"), mas o
operador não tem como saber, pela UI, **por que** a última tentativa falhou — só que ela aconteceu.
Isso já está documentado como pendência dentro do próprio código-fonte (comentário em
`runBitrixSyncTick`), este handoff só torna a solicitação rastreável.

Requisito de observabilidade de sincronização (missão do Agente 06, Onda 1) pede "mensagem
sanitizada" de erro visível — este é o único item dessa lista que depende de mudança de schema, o
resto (status, retry, backoff, idempotência, correlation id, contagem de itens) já está
implementado em `service/client.ts`/`service/syncRules.ts`.

## Arquivo(s) envolvido(s)
- `prisma/schema.prisma` — `BitrixSyncRule` precisa de um campo a mais, ex.:
  `lastErrorMessage String? @db.Text` (nullable — só preenchido quando a última tentativa falhou;
  seria limpo/setado como `null` na próxima execução bem-sucedida).
- `src/features/integrations/bitrix/service/syncRules.ts` — `runBitrixSyncTick`, bloco `catch` (já
  identificado no comentário existente ali) passa a gravar `lastErrorMessage` junto de `lastRunAt`
  no `update` de erro, e limpar (`null`) no `update` de sucesso.

## Alteração necessária
1. Adicionar o campo ao modelo `BitrixSyncRule` e gerar migração.
2. Eu assumo a gravação/leitura desse campo em `syncRules.ts` e a exposição na tela assim que o
   campo existir (é código dentro do meu escopo).

## Teste esperado
Teste de integração/unitário cobrindo: regra que falha → `lastErrorMessage` preenchido com
mensagem sanitizada (sem stack trace/detalhe interno); regra que depois roda com sucesso →
`lastErrorMessage` volta a `null`.

## Contexto adicional
Mensagem sanitizada é importante aqui pelo mesmo motivo de segurança já aplicado no resto do
Bitrix client: nunca expor detalhe de infraestrutura (stack trace, IP interno, nome de host) numa
mensagem que vai parar na tela de um usuário de negócio — só a causa em linguagem simples (ex.:
"Webhook do Bitrix24 sem permissão ou token revogado", já é o padrão de mensagem usado em
`BitrixDefinitiveError`/`AppError` no restante do arquivo).

## Resolução

Já implementado antes desta rodada de remediação (confirmado pelo Agente 01, não recriado do
zero) — o campo existe em `prisma/schema.prisma`, model `BitrixSyncRule`, como `lastError String?
@db.Text` (mesmo espírito do `lastErrorMessage` pedido, nome diferente), com migração aplicada em
`prisma/migrations/20260810000000_bitrix_full_wiring_sync_status_audit/migration.sql`
(`ALTER TABLE "BitrixSyncRule" ADD COLUMN "lastError" TEXT;`). `runBitrixSyncTick` em
`src/features/integrations/bitrix/service/syncRules.ts` já grava `lastError: errorMessage`
(`err instanceof Error ? err.message : String(err)`) no bloco de falha junto com `lastRunAt`, e
limpa para `lastError: null` no bloco de sucesso (junto de `lastImportedCount`). Validado nesta
rodada: `prisma validate`/`prisma migrate status` confirmam a coluna aplicada no banco de
desenvolvimento local; `npx tsc --noEmit`, `npm run lint` e `npm run build` seguem verdes com este
código presente. Não foi necessária nenhuma alteração de schema ou de `syncRules.ts` nesta rodada —
handoff fechado por já estar implementado.
