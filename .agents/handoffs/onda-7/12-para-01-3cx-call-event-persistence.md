- De: Agente 12 (Voz e Telefonia)
- Para: Agente 01/01A (Plataforma, Segurança e Dados)
- Onda: 7
- Status: aberto
- Prioridade: normal (backlog — não bloqueia release, exige contrato de payload validado antes de codar)

## Problema

`process3CXWebhook` (`src/features/integrations/threecx/threecx.service.ts`) recebe o webhook do
3CX Call Flow com assinatura HMAC válida, mas só loga o payload e devolve `{ status: 'processed' }`
— nenhum evento de chamada fica associado a um lead/organização. Essa lacuna já era conhecida desde
`.agents/handoffs/onda-1/06-para-01-persistencia-3cx.md` e foi reconfirmada por mim na revisão do
handoff `.agents/handoffs/onda-5/01-para-06-persistencia-3cx-implementada.md` (ver `## Resolução`
lá).

Não corrigi isso agora porque a saída seria pior que a lacuna: sem o contrato real do payload que o
Call Flow do 3CX efetivamente envia (nunca validado contra um servidor 3CX real neste repositório —
mesma ressalva já documentada no comentário de `make3CXCall`), qualquer parser que eu escrever hoje
seria um chute sobre nomes de campo. Pior: a única forma confiável de saber a QUAL organização um
evento pertence seria pelo ramal/extensão (`extension`) informado no payload, cruzado com
`ThreeCXConnection.extension` — e `THREECX_WEBHOOK_SECRET` hoje é um segredo GLOBAL (uma env só,
compartilhado por todas as organizações que conectam um PABX 3CX), então a assinatura válida por si
só não identifica o tenant. Resolver a tenant errado aqui é exatamente a classe de bug que o
AGENTS.md trata como bloqueador ("Separação... sem isolamento de dados comprovado").

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma` — novo model, algo como:
  ```prisma
  model ThreeCXCallEvent {
    id             String       @id @default(cuid())
    organizationId String
    organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
    connectionId   String?      // ThreeCXConnection.id resolvida pelo extension, quando possível
    extension      String?
    callId         String?      // id do 3CX, para idempotência de reentrega
    eventType      String
    rawPayload     Json         // payload cru, para depuração/auditoria — nunca reprocessado como fonte de verdade além do que os campos acima já extraíram
    createdAt      DateTime     @default(now())

    @@index([organizationId, createdAt])
    @@unique([organizationId, callId, eventType]) // idempotência de reentrega, quando callId existir
  }
  ```
- `src/features/integrations/threecx/threecx.service.ts` — `process3CXWebhook` (meu domínio, eu
  escrevo o código de persistência assim que o model existir).

## Alteração necessária

Criar o model acima (ou equivalente — a forma exata dos campos depende do contrato real do payload,
que eu não tenho como validar sem um PABX 3CX de verdade ou a documentação oficial do Call Flow).
Peço que a revisão inclua como resolver `organizationId` com segurança a partir de um payload sem
JWT nem tenant explícito — hoje `THREECX_WEBHOOK_SECRET` sendo global impede até o cruzamento por
segredo-por-organização que `ATLASGR_WEBHOOK_SECRET`/`BIRTH_VOICES_WEBHOOK_SECRET` também não têm,
mas que aqueles resolvem via `request_data`/`context` que O PRÓPRIO PROSPECTOR gera na chamada de
saída — o 3CX Call Flow é diferente: pode ser evento de chamada ENTRANTE, que o Prospector nunca
iniciou, então não tem contexto prévio nenhum para ecoar de volta.

## Teste esperado

Quando implementado: idempotência por `callId` (reentrega não duplica), resolução de tenant
comprovada por teste de isolamento cross-tenant (mesmo padrão de
`tests/integration/threecx-persistence.test.ts`, que já escrevi nesta onda), e nenhum evento sem
`organizationId` resolvido gravado como se pertencesse a uma organização (fail-closed: descarta com
log, não adivinha).

## Contexto adicional

Não é bloqueador: o webhook já está seguro hoje (fail-closed 503 sem segredo, 401 com assinatura
inválida, nunca processa payload não autenticado) — só não persiste efeito nenhum além do log.
`tests/unit/features/integrations/threecx/threecx.routes.test.ts` (novo, desta onda) cobre esse
comportamento atual e vai precisar de casos novos quando isto for implementado.
