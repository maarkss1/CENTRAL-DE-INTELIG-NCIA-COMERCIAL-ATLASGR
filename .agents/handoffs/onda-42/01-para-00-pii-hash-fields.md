- De: 01
- Para: 00
- Onda: 42
- Status: pendente (schema/migration/backfill de dono único do usuário)
- Prioridade: alto

## Contexto

Dossiê de auditoria CPI, DEC-01 (opção A): reativar a busca/dedup exata de `Contact.phone/email/
whatsapp` sem depender de igualdade sobre texto puro, usando um índice determinístico
(HMAC-SHA256 do valor normalizado) ao lado de cada campo. Isso existe porque cifrar esses campos em
repouso com AES-256-GCM (IV aleatório por valor) quebra qualquer `WHERE`/`groupBy` de igualdade
sobre a coluna cifrada — confirmado contra Postgres real na onda 39, ver
`.agents/handoffs/onda-39/01-para-00-pii-contact-revertida-quebra-integration.md`.

Implementado nesta rodada (sem tocar `prisma/schema.prisma`/migrations — arquivos de dono único
deste repositório):
- `src/lib/security/piiSearchIndex.ts` — HMAC-SHA256(valor normalizado, `PII_SEARCH_HMAC_SECRET`).
  Reusa `normalizeEmailForDedupe`/`normalizePhoneForDedupe` de
  `src/features/prospecting/utils/contactDedupe.ts` (mesma definição de "mesmo e-mail/telefone" já
  usada no dedupe de prospecção, para não inventar uma terceira).
- `src/lib/prisma.ts` — passo novo "1c" na extensão do Prisma Client: para `model === 'Contact'`,
  em `create`/`update`/`updateMany`/`createMany`/`upsert`, calcula `phoneHash`/`whatsappHash`/
  `emailHash` a partir dos campos correspondentes presentes no payload e grava os dois juntos —
  automático, nenhum call site precisou de mudança para os pontos de ESCRITA.
- `src/config/env.ts` / `.env.example` — nova env var `PII_SEARCH_HMAC_SECRET` (mesmo esquema
  fail-closed de `CREDENTIALS_ENCRYPTION_KEY`: obrigatória em produção, cai para um segredo fixo de
  dev/test com aviso no log se ausente).
- Pontos de LEITURA por igualdade exata atualizados para usar o hash em vez do valor puro (ver lista
  completa mais abaixo):
  - `src/features/integrations/email/emailReply.webhook.ts` → `findOpenLeadByEmail`
  - `src/features/integrations/bitrix/service/ownershipGuard.ts` → `findOwnershipConflict`
  - `src/features/crm/jobs/deduplication.worker.ts` → `groupBy` de detecção de duplicados

## O que preciso que você aplique (schema + migration)

Adicionar ao model `Contact` em `prisma/schema.prisma`:

```prisma
model Contact {
  // ... campos existentes ...
  phoneHash    String? // HMAC-SHA256 hex (64 chars) de phone normalizado — ver src/lib/security/piiSearchIndex.ts
  whatsappHash String? // idem, de whatsapp normalizado
  emailHash    String? // idem, de email normalizado (trim+lowercase)

  // ... relations/timestamps existentes ...

  @@index([phoneHash])
  @@index([whatsappHash])
  @@index([emailHash])
}
```

Notas sobre os campos:
- `String?` simples é suficiente — Postgres `text` não paga custo extra por não fixar o tamanho, e
  HMAC-SHA256 hex sempre tem 64 chars, então `@db.VarChar(64)`/`@db.Char(64)` é uma otimização
  opcional, não necessária.
- Índice simples (`@@index`), não `@@unique` — dois contatos podem legitimamente compartilhar o
  mesmo telefone/e-mail hoje (é literalmente o que o job de dedup existe para detectar); um
  `@@unique` quebraria isso.
- A migration gerada (`ALTER TABLE "Contact" ADD COLUMN "phoneHash" TEXT, ADD COLUMN
  "whatsappHash" TEXT, ADD COLUMN "emailHash" TEXT;` + os 3 `CREATE INDEX`) é uma mudança aditiva,
  sem default, metadata-only no Postgres moderno (≥11) — segura para rodar sem lock longo mesmo com
  a tabela `Contact` grande.
- Depois de aplicar, rodar `prisma generate` (normalmente já parte do pipeline de
  build/`postinstall`) para o Prisma Client passar a conhecer os 3 campos novos — só depois disso
  o código desta rodada (que hoje faz cast explícito para `Record<string, unknown>`/`as unknown as
  Prisma.XxxInput` nesses pontos, exatamente por causa disso) passa a rodar de verdade contra
  Postgres real. Ver comentário no topo de
  `tests/integration/piiSearchIndex-contactHash.test.ts` — esse arquivo já existe, com
  `describe.skip`, pronto para provar isso: só remover o skip depois da migration.

## Plano de backfill (contatos já existentes)

Confirmado nesta rodada: `Contact` **não está** em `ENCRYPTED_MODEL_FIELDS`
(`src/lib/crypto/piiFields.ts`) hoje — `phone`/`email`/`whatsapp` continuam em texto puro no banco
(a tentativa de cifrar foi revertida na onda 39 e não foi reativada nesta rodada, ver seção
"Decisão desta rodada: cifra continua OFF" abaixo). Isso simplifica o backfill: o script pode ler o
valor já em texto puro diretamente, sem precisar decifrar nada primeiro.

Script sugerido (`scripts/backfill-contact-pii-hash.ts` ou similar, rodado manualmente uma vez
depois da migration, com `PII_SEARCH_HMAC_SECRET` definida no ambiente):

```
1. Cursor por `Contact.id` (ordem estável), em lotes de ~500, filtrando
   `WHERE phoneHash IS NULL AND phone IS NOT NULL` (e o mesmo para whatsapp/email) — ou simplesmente
   todos os contatos com `phoneHash IS NULL OR (emailHash IS NULL AND email IS NOT NULL) OR
   (whatsappHash IS NULL AND whatsapp IS NOT NULL)`, para não reprocessar quem já tem hash.
2. Para cada lote: calcular phoneHash/whatsappHash/emailHash com
   `computeContactHashFields` (src/lib/security/piiSearchIndex.ts) a partir dos valores lidos.
3. `updateMany`/`update` em lote gravando só os campos *Hash calculados (nunca reescreve
   phone/email/whatsapp em si).
4. Idempotente: recalcular o hash do mesmo valor normalizado sempre dá o mesmo resultado — seguro
   rodar de novo (ex.: depois de uma falha no meio) sem duplicar nem corromper nada.
```

Sem decifra nenhuma necessária (ver confirmação acima). Se `Contact` for cifrado no futuro (ver
próxima seção) ANTES deste backfill rodar, o script precisaria decifrar cada valor primeiro
(`decryptField`, `src/lib/crypto/secretFields.ts`) — documentado aqui para não ser esquecido se a
ordem de execução mudar.

## ⚠️ Risco de deploy — ordem importa

O código desta rodada troca a busca por igualdade em `findOpenLeadByEmail`/`findOwnershipConflict`/
`deduplication.worker` para usar **só** o hash — não há fallback para o valor puro. Se este código
for implantado em produção ANTES do backfill acima terminar, contatos já existentes (sem
`*Hash` ainda) ficam **invisíveis** para esses três fluxos: não é um erro/crash, é uma busca que
silenciosamente não encontra nada — o pior tipo de bug para isto (ex.: `findOwnershipConflict`
deixaria de bloquear duplicidade de dono para todo contato importado antes do backfill).

Ordem de rollout recomendada:
1. Aplicar a migration (colunas `*Hash` nullable, sem quebrar nada — ninguém ainda as lê).
2. Rodar o script de backfill até completar 100% dos contatos existentes.
3. Confirmar (`SELECT count(*) FROM "Contact" WHERE phone IS NOT NULL AND "phoneHash" IS NULL`
   zerado, idem email/whatsapp) antes do passo 4.
4. Só então implantar esta branch (o código já calcula o hash em toda escrita nova a partir do
   deploy — contatos criados/atualizados entre o passo 1 e o 4 também precisam entrar no backfill
   do passo 2, ou rodar o backfill de novo depois do deploy para pegar essa janela).

## Decisão desta rodada: cifra de Contact continua OFF (não reativada)

Este PR implementa só o mecanismo de busca do DEC-01 — **não** reativa `Contact` em
`ENCRYPTED_MODEL_FIELDS`. Motivo: o relatório da onda 39 documentou 4 fluxos quebrados, mas só 1
deles (`emailReplyTracking.test.ts`) era realmente sobre igualdade `WHERE` — resolvido por este
hash. Os outros 2 casos reais (`whatsapp-optout-gating.test.ts` e
`document-signature.routes.test.ts`) eram sobre um problema DIFERENTE, ainda não resolvido: a
extensão do Prisma (`src/lib/prisma.ts`) só decifra no nível do model da própria operação
(`ENCRYPTED_FIELDS[model]`) — não em relações aninhadas (`include`/`select` a partir de outro
model, ex. `Lead.contact.email`). Confirmei isso lendo o código real:
`src/features/cadence/infra/PrismaLeadSubjectResolver.ts` (`Lead.findFirst({ select: { contact:
{ select: { email, whatsapp, phone } } } })`) é exatamente esse padrão, usado pelo worker de
cadência antes de checar opt-out — se `Contact` for cifrado sem resolver isso, esse fluxo volta a
quebrar exatamente como na onda 39, e o hash desta rodada NÃO ajuda (é um problema de leitura
aninhada, não de igualdade `WHERE`).

Reativar `Contact` em `ENCRYPTED_MODEL_FIELDS` com segurança exige, além deste hash, resolver a
decifra de relações aninhadas — proposta: estender `$allOperations` em `src/lib/prisma.ts` para
percorrer `include`/`select` do resultado e aplicar `decryptSensitiveResult` recursivamente nos
models aninhados que estiverem em `ENCRYPTED_MODEL_FIELDS`. Não implementado aqui — fora do escopo
do DEC-01 (que é especificamente sobre o mecanismo de busca), e arriscado demais para entrar
"de brinde" sem Postgres real disponível neste ambiente para validar contra os mesmos 4 testes de
integração que expuseram o problema original.

Guard de regressão preservado: `src/lib/crypto/__tests__/piiFields.unit.test.ts` ainda afirma que
`ENCRYPTED_MODEL_FIELDS.Contact` é `undefined` — não removido nem contornado nesta rodada.

## Lacunas conhecidas que este hash NÃO resolve (documentado, não corrigido)

HMAC só serve para igualdade EXATA — nenhuma das buscas abaixo é conversível para hash, e nenhuma
delas quebra hoje porque `Contact` continua em texto puro (ver seção acima). Ficam registradas aqui
para quando a decisão de reativar a cifra for revisitada — nesse momento, cada uma delas precisa de
uma solução própria (ex.: manter uma réplica pesquisável, um índice de blind-index por n-gramas, ou
aceitar formalmente a perda dessa busca específica):

1. **Busca fuzzy/parcial de Contact** (`contains`, `mode: 'insensitive'`) em
   `src/features/contacts/infra/PrismaContactRepository.ts` e
   `src/features/contacts/services/contact.service.ts` (esta última não está em uso real — nenhum
   import fora dela mesma, mantida por paridade) — busca livre por nome/e-mail/telefone/WhatsApp
   na tela de Contatos.
2. **Casamento de telefone por sufixo/padrão** (últimos 8-9 dígitos, `contains` ou `LIKE`), usado
   para achar o Lead de uma chamada recebida quando só se conhece o número, não o contato: `src/
   features/integrations/threecx/threecx.service.ts` (linha ~556), `src/features/integrations/
   birth-voice/voiceResult.webhook.ts` (linha ~146), e — o caso mais delicado — `src/features/
   integrations/whatsapp/whatsappMessage.service.ts` → `findContactByPhone`, que roda **SQL bruto**
   (`$queryRaw` com `regexp_replace(...) LIKE`) direto na coluna `Contact.phone`/`whatsapp`,
   bypassando tanto este hash quanto a decifra automática da extensão do Prisma (`$queryRaw` não
   passa por `$allOperations` — o próprio comentário do arquivo já documenta isso para RLS; vale
   também para cifra/hash). Se `Contact` for cifrado no futuro, este método também devolve
   `email`/`phone` como ciphertext cru, silenciosamente.
3. **Domínio de e-mail por sufixo** (`endsWith`), usado pelo rate limit de cadência por domínio:
   `src/features/cadence/infra/PrismaCadenceRateLimitPort.ts` →
   `countDistinctEmailRecipientsForDomain`.
4. **Leitura de PII de Contact via relação aninhada** (`include`/`select` a partir de `Lead` ou
   outro model) — já detalhado na seção anterior (`PrismaLeadSubjectResolver.ts` é o exemplo
   confirmado; provavelmente há outros pontos não auditados nesta rodada, o escopo desta auditoria
   foi especificamente `WHERE`/dedup por igualdade, não uma varredura completa de todo `include`
   que toca `Contact`).
5. **Sentinela de nome no sweep de anonimização LGPD** (`contact: { name: { not:
   '[titular anonimizado — LGPD]' } }`, em `src/features/crm/jobs/autoAnonymizeDisqualified.worker.ts`)
   — não afetado hoje porque `name` não está sendo hasheado (avaliei explicitamente: busca por
   nome neste produto é sempre fuzzy/`contains`, nunca igualdade exata, então não se beneficia de
   um índice HMAC). Se `Contact.name` for cifrado no futuro, este `not equals` contra uma string
   sentinela em texto puro precisa ser reescrito (ex.: um campo booleano dedicado
   `anonymizedAt`/`isAnonymized` em vez de comparar contra um valor mágico) — fora do escopo desta
   rodada.

## Lista completa de pontos que fazem WHERE/groupBy de Contact.phone/email/whatsapp (auditoria pedida)

Levantada ANTES de qualquer mudança de código, nesta ordem de arquivo:

| Arquivo | Tipo de busca | Ação nesta rodada |
|---|---|---|
| `src/features/integrations/email/emailReply.webhook.ts` (`findOpenLeadByEmail`) | Igualdade exata, case-insensitive, via `contact: { email }` | ✅ migrado para `emailHash` |
| `src/features/integrations/bitrix/service/ownershipGuard.ts` (`findOwnershipConflict`) | Igualdade exata (`phone`) + case-insensitive (`email`), via `contact: { OR: [...] }` | ✅ migrado para `phoneHash`/`emailHash` |
| `src/features/crm/jobs/deduplication.worker.ts` | `groupBy` por `email`/`phone` (detecção de duplicados) | ✅ migrado para `groupBy` por `emailHash`/`phoneHash` |
| `src/features/contacts/infra/PrismaContactRepository.ts` (`findAllWithFilters`) | `contains`, fuzzy, multi-campo (nome/e-mail/telefone/whatsapp/cargo/depto/empresa) | ⛔ fora de escopo (não é igualdade) — ver lacuna 1 |
| `src/features/contacts/services/contact.service.ts` (`findAll`) | Idem acima — módulo sem uso real hoje (nenhum import fora dele mesmo) | ⛔ idem — mantido por paridade |
| `src/features/integrations/threecx/threecx.service.ts` (~linha 556) | `contains` por sufixo de dígitos (últimos 8) | ⛔ fora de escopo — ver lacuna 2 |
| `src/features/integrations/birth-voice/voiceResult.webhook.ts` (~linha 146) | Idem acima | ⛔ idem |
| `src/features/integrations/whatsapp/whatsappMessage.service.ts` (`findContactByPhone`) | `$queryRaw` com `LIKE` por sufixo de dígitos — bypassa a extensão do Prisma inteira | ⛔ idem — risco adicional documentado na lacuna 2 |
| `src/features/cadence/infra/PrismaCadenceRateLimitPort.ts` (`countDistinctEmailRecipientsForDomain`) | `endsWith` por domínio de e-mail | ⛔ fora de escopo — ver lacuna 3 |
| `src/features/cadence/infra/PrismaLeadSubjectResolver.ts` | Leitura (não `WHERE`) de `contact.email/whatsapp/phone` via `select` aninhado a partir de `Lead` | ⛔ fora de escopo — problema de decifra aninhada, não de busca — ver lacuna 4 |
| `src/shared/services/dataSubjectErasure.service.ts` (`eraseDataSubject`) | `update` que zera `phone`/`whatsapp`/`email` (LGPD) | ✅ automático — o passo "1c" em `prisma.ts` já zera o hash correspondente sem mudança de código aqui |
| `src/features/crm/jobs/autoAnonymizeDisqualified.worker.ts` | `contact: { name: { not: <sentinela> } }` | ⛔ fora de escopo (campo `name`, não hasheado por decisão) — ver lacuna 5 |
| `src/lib/prisma.ts` (soft delete cascade, `Contact.deletedAt`) | Não filtra por PII, só `id`/`companyId` | N/A — não usa phone/email/whatsapp |

## Testes

- `src/lib/security/__tests__/piiSearchIndex.unit.test.ts` — determinismo do HMAC, normalização
  (mesmo hash para grafias diferentes do mesmo e-mail/telefone), segredo ausente/errado, guard de
  fail-closed em produção, e `computeContactHashFields` (só toca os campos presentes no payload,
  update parcial preserva hash não tocado, `null` limpa o hash).
- `tests/integration/piiSearchIndex-contactHash.test.ts` — **`describe.skip`, pendente da migration
  acima**. Prova, contra Postgres real: create grava os 3 hashes automaticamente; busca exata por
  e-mail com grafia diferente encontra via `emailHash`; `update` que limpa `phone` também limpa
  `phoneHash`; `update` parcial preserva hash já gravado. Remover o `.skip` depois de aplicar a
  migration e rodar `prisma generate`.
- `tests/integration/emailReplyTracking.test.ts` (já existente, não modificado) — depois da
  migration aplicada, este teste passa a exercitar de verdade o novo caminho por `emailHash` em
  `findOpenLeadByEmail` (é o mesmo fluxo do CYC-003 que a onda 39 confirmou quebrado com cifra
  ligada) — nenhuma mudança de asserção foi necessária porque o comportamento observável (encontra
  o lead pelo e-mail do contato) não muda.

## Arquivo(s) envolvido(s)

- `src/lib/security/piiSearchIndex.ts` (novo)
- `src/lib/security/__tests__/piiSearchIndex.unit.test.ts` (novo)
- `src/lib/prisma.ts`
- `src/config/env.ts`
- `.env.example`
- `src/features/integrations/email/emailReply.webhook.ts`
- `src/features/integrations/bitrix/service/ownershipGuard.ts`
- `src/features/crm/jobs/deduplication.worker.ts`
- `tests/integration/piiSearchIndex-contactHash.test.ts` (novo, `describe.skip`)
