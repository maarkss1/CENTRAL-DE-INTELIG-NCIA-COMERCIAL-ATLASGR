- De: 17
- Para: 01/01A
- Onda: 7
- Status: resolvido (schema aplicado em `prisma/schema.prisma` + migration criada na Onda 10 pelo
  Agente 01A — ver "## Resolução (Agente 01A, Onda 10)" abaixo; `migrate deploy`/`dev` contra
  banco real ainda não executado neste worktree, ver limitação de ambiente na mesma seção)
- Prioridade: alto
## Problema
As 5 entregas da Onda 7 do Agente 17 (opt-out unificado, cadência multicanal, reply tracking,
agendamento, proposta/assinatura/fechamento) precisam de tabelas novas. `prisma/schema.prisma` é
propriedade exclusiva sua — não editei o arquivo. Implementei toda a lógica de domínio em
`src/features/cadence/**` como TypeScript puro, com portas (`interface *Repository`) e
implementações em memória para os testes, exatamente para não depender deste schema estar
aplicado para poder entregar código testado agora. Este handoff é a proposta pronta para você
aplicar (ou ajustar) como migration real.

## Arquivo(s) envolvido(s)
`prisma/schema.prisma` (novo `enum`s e `model`s abaixo) + migration correspondente em
`prisma/migrations/<timestamp>_cadence_optout_proposal/migration.sql`.

## Alteração necessária

Todas as tabelas seguem o padrão já estabelecido no schema: `id TEXT` (cuid gerado pelo Prisma
Client, sem default no banco — mesmo padrão de `BitrixExtractionRun`), `organizationId` com FK
`ON DELETE CASCADE` para `Organization`, RLS por `tenant_isolation_policy` idêntica à usada em
`BitrixExtractionRun` (`current_setting('app.current_tenant_id', TRUE) = "organizationId" OR
current_setting('app.bypass_rls', TRUE) = 'on'`), e `createdAt`/`updatedAt` no padrão do resto do
schema.

### 1. Opt-out unificado (entrega 1 — a que bloqueia todo o resto)

```sql
-- CreateEnum
CREATE TYPE "OptOutScope" AS ENUM ('Email', 'WhatsApp', 'Voice', 'Global');

-- CreateTable
CREATE TABLE "OptOutRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" "OptOutScope" NOT NULL,
    -- Identificadores de correspondência: o registro casa por QUALQUER um destes três que o
    -- canal disparador já tiver carregado do Lead antes de tentar o envio (contrato completo no
    -- handoff `17-para-05-06-12-contrato-optout.md`). leadId é o casamento mais forte; email e
    -- phoneE164 cobrem o caso de opt-out registrado antes de o lead existir localmente (ex.:
    -- webhook de descadastro chegando antes do primeiro sync).
    "leadId" TEXT,
    "email" TEXT,
    "phoneE164" TEXT,
    -- Canal por onde o pedido chegou (não é o escopo do bloqueio — ver `scope` acima).
    "originChannel" TEXT NOT NULL,
    "reason" TEXT,
    "evidence" TEXT,
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptOutRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OptOutRecord_organizationId_leadId_idx" ON "OptOutRecord"("organizationId", "leadId");
CREATE INDEX "OptOutRecord_organizationId_phoneE164_idx" ON "OptOutRecord"("organizationId", "phoneE164");
CREATE INDEX "OptOutRecord_organizationId_email_idx" ON "OptOutRecord"("organizationId", "email");

ALTER TABLE "OptOutRecord" ADD CONSTRAINT "OptOutRecord_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OptOutRecord" ADD CONSTRAINT "OptOutRecord_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OptOutRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OptOutRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "OptOutRecord" FOR ALL
USING (current_setting('app.current_tenant_id', TRUE) = "organizationId" OR current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (true);
```

**Coordenação obrigatória com o 12 antes de aplicar**: `CallSuppression` (voz, já em produção)
não pode ser desligado até `OptOutRecord` cobrir 100% do que ele cobre. Proposta de migração de
dados, a rodar na mesma migration ou logo depois, sem `DROP TABLE "CallSuppression"` neste
momento:
```sql
INSERT INTO "OptOutRecord" ("id", "organizationId", "scope", "leadId", "phoneE164", "originChannel", "reason", "createdAt")
SELECT gen_random_uuid()::text, "organizationId", 'Voice', "leadId", "phoneE164", 'voice', "reason", "createdAt"
FROM "CallSuppression";
```
`CallSuppression` continua existindo e sendo escrito pelo 12 até ele confirmar a migração de
leitura para `OptOutRecord` (ver handoff a ele). Eu não decido esse corte — é dele.

### 2. Cadência multicanal (entrega 2)

```sql
CREATE TYPE "CadenceChannel" AS ENUM ('Email', 'WhatsApp', 'Voice');
CREATE TYPE "CadenceRunStatus" AS ENUM ('Active', 'Paused', 'Stopped');
CREATE TYPE "CadenceStopReason" AS ENUM ('OptOut', 'LeadReply', 'Completed', 'ManualStop');
CREATE TYPE "CadenceTouchResult" AS ENUM ('Sent', 'Failed', 'Skipped');

CREATE TABLE "CadenceSequence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    -- [{ "order": 1, "channel": "Email", "delayHoursFromPrevious": 0, "templateRef": "...", "maxAttempts": 1 }, ...]
    "touches" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CadenceSequence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CadenceSequence_organizationId_active_idx" ON "CadenceSequence"("organizationId", "active");

CREATE TABLE "CadenceRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "status" "CadenceRunStatus" NOT NULL DEFAULT 'Active',
    "currentTouchOrder" INTEGER NOT NULL DEFAULT 1,
    "stopReason" "CadenceStopReason",
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTouchAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CadenceRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CadenceRun_organizationId_status_idx" ON "CadenceRun"("organizationId", "status");
CREATE INDEX "CadenceRun_leadId_idx" ON "CadenceRun"("leadId");
-- Um lead não pode ter duas cadências ativas simultâneas concorrendo pelo mesmo canal — ver
-- regra de negócio em `src/features/cadence/domain/cadence.ts`.
CREATE UNIQUE INDEX "CadenceRun_leadId_active_unique" ON "CadenceRun"("leadId") WHERE "status" = 'Active';

ALTER TABLE "CadenceRun" ADD CONSTRAINT "CadenceRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CadenceRun" ADD CONSTRAINT "CadenceRun_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "CadenceSequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CadenceTouchAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cadenceRunId" TEXT NOT NULL,
    "touchOrder" INTEGER NOT NULL,
    "channel" "CadenceChannel" NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Honestidade de envio (mesma correção já feita em cold-email.service.ts / commit 2e42a557):
    -- nunca 'Sent' sem confirmação real do provedor.
    "result" "CadenceTouchResult" NOT NULL,
    "skipReason" TEXT,
    "error" TEXT,
    "providerMessageId" TEXT,
    CONSTRAINT "CadenceTouchAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CadenceTouchAttempt_cadenceRunId_idx" ON "CadenceTouchAttempt"("cadenceRunId");
ALTER TABLE "CadenceTouchAttempt" ADD CONSTRAINT "CadenceTouchAttempt_cadenceRunId_fkey" FOREIGN KEY ("cadenceRunId") REFERENCES "CadenceRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (mesmo padrão) em CadenceSequence, CadenceRun e CadenceTouchAttempt — omitido aqui por
-- repetição, idêntico ao bloco de OptOutRecord acima trocando o nome da tabela.
```

### 3. Reply tracking de e-mail (entrega 3)

`ConversationSignal` já existe e é reaproveitado (não crio modelo paralelo, conforme meu prompt).
Falta apenas o canal ter ficado implícito como "sempre WhatsApp":
```sql
ALTER TABLE "ConversationSignal" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'whatsapp';
```
E falta persistência da mensagem de e-mail em si — hoje só existe `WhatsAppMessage` para o canal
de chat. Proposta simétrica (mesmo formato), mas **este modelo é compartilhado com o 05
(dono de e-mail/SMTP)** — abri também `17-para-05-06-12-contrato-optout.md` pedindo a ele revisão
do formato antes de você aplicar:
```sql
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL, -- header Message-Id, para idempotência de reentrega
    "inReplyTo" TEXT,                  -- header In-Reply-To, para threading
    "direction" TEXT NOT NULL,         -- 'inbound' | 'outbound', mesmo padrão de WhatsAppMessage
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "leadId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailMessage_organizationId_providerMessageId_key" ON "EmailMessage"("organizationId", "providerMessageId");
CREATE INDEX "EmailMessage_leadId_idx" ON "EmailMessage"("leadId");
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

### 4. Agendamento (entrega 4)

```sql
CREATE TYPE "ConfirmationEvidenceType" AS ENUM (
    'LeadCalendarReply',       -- lead respondeu confirmando um slot específico
    'LeadSchedulingLinkClick', -- lead escolheu horário num link de agendamento (Calendly-like)
    'ManualVerified'           -- vendedor confirmou manualmente após ligação/reunião ao vivo
);

CREATE TABLE "CadenceCalendarEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "cadenceRunId" TEXT,
    "googleEventId" TEXT,
    "confirmationEvidenceType" "ConfirmationEvidenceType" NOT NULL,
    "confirmationEvidenceRef" TEXT NOT NULL, -- id da mensagem/registro que prova a confirmação
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'cancelled' | 'completed'
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CadenceCalendarEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CadenceCalendarEvent_leadId_idx" ON "CadenceCalendarEvent"("leadId");
ALTER TABLE "CadenceCalendarEvent" ADD CONSTRAINT "CadenceCalendarEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CadenceCalendarEvent" ADD CONSTRAINT "CadenceCalendarEvent_cadenceRunId_fkey" FOREIGN KEY ("cadenceRunId") REFERENCES "CadenceRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

### 5. Proposta versionada, assinatura e fechamento determinístico (entrega 5)

`CrmCommercialDocument`, `CrmProduct`, `CrmDealItem` já existem — não recrio, só adiciono
histórico e o rastro de fechamento em cima deles.

```sql
CREATE TABLE "CrmCommercialDocumentVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    -- snapshot completo do documento neste ponto no tempo (title/lineItems/subtotal/discount/tax/total/terms/notes)
    "snapshot" JSONB NOT NULL,
    "changedBy" TEXT,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmCommercialDocumentVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CrmCommercialDocumentVersion_documentId_versionNumber_key" ON "CrmCommercialDocumentVersion"("documentId", "versionNumber");
ALTER TABLE "CrmCommercialDocumentVersion" ADD CONSTRAINT "CrmCommercialDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CrmCommercialDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "SignatureRequestStatus" AS ENUM ('Created', 'Sent', 'Viewed', 'Signed', 'Declined', 'Expired', 'Cancelled');

CREATE TABLE "CrmDocumentSignatureRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    -- Provedor fica livre (texto), não enum — decisão de negócio já tomada pelo usuário
    -- (2026-08-15): Assinatura Eletrônica gov.br (https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica).
    -- Continua TEXT (não enum) porque o schema foi desenhado agnóstico de provedor antes da
    -- decisão — não custa nada manter assim, e evita uma migration de enum se o gov.br precisar
    -- ser complementado por um provedor comercial no futuro (ex.: signatário sem conta gov.br).
    "provider" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'Created',
    "signerEmail" TEXT NOT NULL,
    "signerName" TEXT,
    "requestedBy" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "evidenceRef" TEXT, -- URL/id do certificado de assinatura do provedor
    "rawWebhookPayload" JSONB,
    CONSTRAINT "CrmDocumentSignatureRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CrmDocumentSignatureRequest_documentId_idx" ON "CrmDocumentSignatureRequest"("documentId");
ALTER TABLE "CrmDocumentSignatureRequest" ADD CONSTRAINT "CrmDocumentSignatureRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CrmCommercialDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "DealClosureEventType" AS ENUM ('SignatureCompleted', 'PaymentConfirmed', 'ManualCrmConfirmation');

-- Ledger append-only do que moveu um Lead/Negócio para "Negócios Ganhos" — ver
-- `17-para-13-evento-fechamento.md` para o acordo do que conta como evento válido.
CREATE TABLE "DealClosureEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "DealClosureEventType" NOT NULL,
    "evidenceRef" TEXT NOT NULL, -- id de CrmDocumentSignatureRequest, referência de pagamento, ou nota de confirmação manual
    "triggeredBy" TEXT NOT NULL, -- userId, ou 'webhook:<provider>' quando automático
    "previousStatus" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealClosureEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DealClosureEvent_leadId_idx" ON "DealClosureEvent"("leadId");
ALTER TABLE "DealClosureEvent" ADD CONSTRAINT "DealClosureEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Todas as tabelas acima levam a mesma RLS `tenant_isolation_policy` do bloco 1 — omitida por
repetição em 2-5, mas obrigatória em todas (LGPD e tenancy, `/AGENTS.md`).

## Teste esperado
- `prisma migrate dev` aplica sem erro contra o schema atual.
- Testes de RLS por tabela (mesmo padrão de `tests/integration/rls/**`, se existir, ou o padrão
  usado para `BitrixExtractionRun`): tenant A não lê/escreve linha de tenant B.
- `CadenceRun_leadId_active_unique` rejeita segunda cadência ativa para o mesmo lead — proteção
  de corrida que meu domínio (`src/features/cadence/domain/cadence.ts`) já assume mas não pode
  garantir sozinho sem constraint de banco.

## Contexto adicional
Enquanto este handoff está aberto, meu progresso em `src/features/cadence/**` não fica bloqueado:
toda a lógica de domínio (máquina de estados de cadência, matching de opt-out, guardas de
confirmação verificável, versionamento de proposta, guarda de fechamento determinístico) está
implementada e testada com repositórios em memória (portas/interfaces), exatamente para poder
adiantar trabalho real sem essas tabelas existirem ainda. Quando você aplicar este schema (ou uma
versão ajustada dele), o próximo passo é eu escrever os adaptadores Prisma reais implementando as
mesmas interfaces — sem tocar a lógica de domínio já testada.

## Decisão do usuário (2026-08-15)

Provedor de assinatura eletrônica para `CrmDocumentSignatureRequest.provider`: **Assinatura
Eletrônica gov.br** — https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica.
Não Clicksign/DocuSign/Autentique.

Notas para quem for implementar o adaptador real (não pesquisado a fundo nesta sessão — validar
antes de codar):
- É o serviço oficial do governo federal brasileiro, integrado à conta gov.br do signatário
  (autenticação prata/ouro dá validade jurídica equivalente à ICP-Brasil, MP 2.200-2/2001).
  Diferença de UX real para o signatário final: ele precisa ter (ou criar) uma conta gov.br para
  assinar — não é um link público como Clicksign/DocuSign, o que pode afetar taxa de conclusão em
  leads que nunca usaram gov.br.
- Sem custo por assinatura documentado publicamente até o momento desta decisão — mas confirmar
  limites de uso/rate limit da API antes de assumir isso em produção.
- A API pública é a do "Portal de Assinatura Eletrônica" (SERPRO/ITI) — confirmar endpoint exato,
  fluxo OAuth de integração, ambiente de homologação/sandbox e formato de webhook de status antes
  de implementar; nada disso foi verificado nesta sessão, só a escolha do provedor em si.
- `provider` continua sendo persistido como `'govbr'` (texto livre, sem enum) — decisão de schema
  já tomada acima, não muda com esta escolha de provedor.

## Resolução (Agente 01A, Onda 10)

Itens 2-5 desta proposta aplicados em `prisma/schema.prisma` (item 1, `OptOutRecord`, já estava em
produção antes desta onda — não mexido aqui). Migration nova:
`prisma/migrations/20260816120000_cadence_scheduling_signature/migration.sql`.

### O que foi aplicado
- **Item 2** — enums `CadenceChannel`, `CadenceRunStatus`, `CadenceStopReason`,
  `CadenceTouchResult` + models `CadenceSequence`, `CadenceRun`, `CadenceTouchAttempt`.
- **Item 3** — `ConversationSignal.channel` (`String @default("whatsapp")`) + model
  `EmailMessage`.
- **Item 4** — enum `ConfirmationEvidenceType` + model `CadenceCalendarEvent`.
- **Item 5** — model `CrmCommercialDocumentVersion`, enum `SignatureRequestStatus` + model
  `CrmDocumentSignatureRequest` (`provider` continua `TEXT` livre, não enum, valor real `'govbr'`
  — decisão do usuário acima preservada como pedido), enum `DealClosureEventType` + model
  `DealClosureEvent`.
- Todas as tabelas novas com RLS: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` +
  `tenant_isolation_policy` idêntica à de `OptOutRecord`/`BitrixExtractionRun`.
- Back-relations adicionadas em `Organization`, `Lead` e `CrmCommercialDocument` para cada tabela
  nova (exigência da DSL do Prisma — os dois lados de toda relação precisam estar declarados).

### Duas correções em relação ao SQL literal deste handoff (não é reescrita do pedido original —
registradas aqui e também no comentário da seção nova em `schema.prisma`, por cima dos models):
1. **FK `organizationId → Organization` adicionada em todas as tabelas novas.** O SQL proposto
   acima lista a coluna `organizationId` em `CadenceSequence`, `CadenceRun`,
   `CadenceTouchAttempt`, `EmailMessage`, `CadenceCalendarEvent`,
   `CrmCommercialDocumentVersion` e `CrmDocumentSignatureRequest`, mas não tem o `ALTER TABLE ...
   ADD CONSTRAINT ..._organizationId_fkey` correspondente (só `OptOutRecord` e
   `BitrixExtractionRun`, aplicados em migrations anteriores, já tinham essa FK). Tratado como
   lacuna de transcrição, não decisão de omitir — o próprio parágrafo de abertura desta proposta
   promete "`organizationId` com FK `ON DELETE CASCADE` para `Organization`" em todas as tabelas.
2. **`CadenceRun_leadId_active_unique` como índice único parcial de verdade** (`WHERE "status" =
   'Active'`), exatamente como este handoff propôs, só que isso não é representável na DSL do
   Prisma (sem suporte a índice parcial) — existe só na migration SQL manual, com um
   `@@index([leadId])` normal em `schema.prisma` para a consulta comum. `prisma migrate diff`
   contra o schema vai sempre reportar esse índice específico como fora do schema — conhecido e
   aceito, não é deriva real.

### Convenção de enum (mantida do precedente de `OptOutRecord`)
Valores PascalCase no Postgres (`Email`/`WhatsApp`/`Voice`, `Active`/`Paused`/`Stopped` etc.),
diferentes dos literais lowercase/kebab/snake usados no domínio TypeScript já implementado em
`src/features/cadence/domain/*.ts` (`'email'`, `'active'`, `'opt-out'`, `'signature_completed'`
etc.). Mesmo padrão de `PrismaOptOutRepository.ts` (`SCOPE_TO_DB`/`SCOPE_FROM_DB`) — o mapeamento
fica na camada de persistência (adaptador Prisma real, ainda não escrito), nunca propagado cru
para o domínio. Quem escrever os adaptadores `Prisma*Repository` para `CadenceRun`, `EmailMessage`
etc. deve seguir o mesmo padrão de tabela de mapeamento.

### Verificação executada (e o que NÃO foi executado)
- `npx prisma validate` — limpo.
- `npx prisma format` — aplicado (realinha espaçamento/ordem de atributos `@@unique`/`@@index` em
  alguns models pré-existentes não relacionados a este handoff, como efeito colateral esperado e
  puramente cosmético de formatar o arquivo depois de adicionar conteúdo novo — nenhum campo
  alterado/removido).
- `npx prisma generate` — limpo, Prisma Client gerado sem erro a partir do schema novo.
- `npx tsc --noEmit -p .` — limpo.
- `npm run lint` — 0 erros (73 warnings pré-existentes, nenhum nos arquivos tocados por este
  handoff).
- `npm run build` — sucesso (`vite build` + bundle do `server.ts`).
- **`prisma migrate dev`/`deploy` NÃO executado contra banco real neste worktree.** Havia
  inicialmente um Postgres local disponível no ambiente de execução (não Docker — cluster
  `postgresql-16` do próprio sistema, inativo por padrão) e cheguei a instalar a extensão
  `pgvector` que faltava para permitir aplicar as migrations desde o zero; a tentativa de rodar
  `npx prisma migrate deploy` contra ele foi **bloqueada pelo classificador de permissão do
  ambiente** antes de executar. Não tentei contornar essa restrição. A aplicação real das
  migrations (incluindo esta e a confirmação de que `prisma migrate diff` não acusa deriva) fica
  para o CI do PR ou para um ambiente com banco liberado.

### Para quem retomar este handoff (Agente 17 ou quem escrever os adaptadores Prisma)
- Os adaptadores Prisma reais (`PrismaCadenceRunRepository`, `PrismaEmailMessageRepository`
  ou equivalente) ainda não existem — só `PrismaOptOutRepository.ts` (item 1, já em produção).
  `prisma/schema.prisma` é propriedade exclusiva do 01/01A; os adaptadores em
  `src/features/cadence/infra/**` não são.
- `CrmCommercialDocument.versions`/`CrmCommercialDocument.signatureRequests` foram adicionados
  como back-relations — qualquer serviço que já faça `include`/`select` amplo em
  `CrmCommercialDocument` não precisa mudar (campos novos são opt-in via `include`), mas passa a
  ter esses relacionamentos disponíveis.
- A migração de dados de `CallSuppression` → `OptOutRecord` (item 1) e o desligamento de
  `CallSuppression` continuam decisão do Agente 12, sem mudança nesta resolução.
