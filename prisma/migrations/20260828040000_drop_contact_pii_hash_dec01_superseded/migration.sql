-- Contact.phoneHash/whatsappHash/emailHash (DEC-01/onda-42, migration
-- 20260827210000_onda42_decisoes_schema) implementavam só o mecanismo de busca determinística
-- (HMAC-SHA256 de valor normalizado), com Contact.phone/email/whatsapp continuando em TEXTO PURO
-- — o próprio handoff daquela rodada (.agents/handoffs/onda-42/01-para-00-pii-hash-fields.md)
-- registrava isso como passo intermediário, deixando reativar a cifra AES-256-GCM como trabalho
-- futuro. Este PR completa exatamente esse handoff — reativa a cifra e substitui o índice único
-- por hash/campo (`emailIndex`/`emailDomainIndex`/`phoneIndex`/`phoneLast8Index`/`phoneLast9Index`/
-- `whatsappIndex`/`whatsappLast8Index`/`whatsappLast9Index`, ver migration
-- 20260828013314_contact_pii_encryption_blind_index), que cobre tudo que o hash único cobria mais
-- os dois casos que DEC-01 documentou como fora de escopo (domínio de e-mail, sufixo de telefone).
-- Removidas aqui em vez de editar a migration já aplicada (nunca reescrever histórico já aplicado).
DROP INDEX "Contact_phoneHash_idx";
DROP INDEX "Contact_whatsappHash_idx";
DROP INDEX "Contact_emailHash_idx";

ALTER TABLE "Contact"
  DROP COLUMN "phoneHash",
  DROP COLUMN "whatsappHash",
  DROP COLUMN "emailHash";
