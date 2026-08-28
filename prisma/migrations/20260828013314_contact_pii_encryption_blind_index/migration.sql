-- Cifra em repouso (AES-256-GCM, aplicada pela extensão do Prisma em src/lib/prisma.ts) de
-- Contact.email/phone/whatsapp, reativando o gap documentado em
-- .agents/handoffs/onda-39/01-para-00-pii-contact-revertida-quebra-integration.md — ver comentário
-- grande em src/lib/crypto/piiFields.ts sobre por que desta vez é seguro.
--
-- Os três índices antigos abaixo comparavam diretamente o valor da coluna (`email`/`phone`/
-- `whatsapp`) por igualdade — inúteis a partir de agora, já que a coluna passa a guardar
-- ciphertext com IV aleatório por valor (o mesmo texto puro nunca produz o mesmo ciphertext duas
-- vezes). Substituídos pelos índices cegos determinísticos abaixo (HMAC-SHA256, ver
-- src/lib/crypto/piiIndex.ts), computados pela aplicação a partir do texto puro ANTES de cifrar.
--
-- NOTA: só remove os índices plain btree sobre as próprias colunas cifradas — os índices trigram
-- (gin_trgm_ops) de name/role, criados por uma migration raw SQL anterior e não representados no
-- schema.prisma, não são tocados aqui.
DROP INDEX "Contact_email_idx";
DROP INDEX "Contact_phone_idx";
DROP INDEX "Contact_whatsapp_idx";

-- AlterTable
ALTER TABLE "Contact"
  ADD COLUMN "emailIndex" TEXT,
  ADD COLUMN "emailDomainIndex" TEXT,
  ADD COLUMN "phoneIndex" TEXT,
  ADD COLUMN "phoneLast8Index" TEXT,
  ADD COLUMN "phoneLast9Index" TEXT,
  ADD COLUMN "whatsappIndex" TEXT,
  ADD COLUMN "whatsappLast8Index" TEXT,
  ADD COLUMN "whatsappLast9Index" TEXT;

-- CreateIndex
CREATE INDEX "Contact_emailIndex_idx" ON "Contact"("emailIndex");
CREATE INDEX "Contact_emailDomainIndex_idx" ON "Contact"("emailDomainIndex");
CREATE INDEX "Contact_phoneIndex_idx" ON "Contact"("phoneIndex");
CREATE INDEX "Contact_phoneLast8Index_idx" ON "Contact"("phoneLast8Index");
CREATE INDEX "Contact_phoneLast9Index_idx" ON "Contact"("phoneLast9Index");
CREATE INDEX "Contact_whatsappIndex_idx" ON "Contact"("whatsappIndex");
CREATE INDEX "Contact_whatsappLast8Index_idx" ON "Contact"("whatsappLast8Index");
CREATE INDEX "Contact_whatsappLast9Index_idx" ON "Contact"("whatsappLast9Index");
