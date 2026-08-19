-- Etapa 2 / guardrail de privacidade do catálogo empresarial global.
--
-- MarketIntelligenceCompany representa o universo oficial compartilhado entre tenants. Os campos
-- de contato existem no schema por compatibilidade com o layout da Receita, mas NÃO podem ser
-- persistidos no catálogo global: telefone/e-mail/fax exigem um fluxo de enriquecimento escopado
-- ao tenant. O CHECK abaixo transforma essa regra de governança em invariante do banco.

UPDATE "MarketIntelligenceCompany"
SET
    "ddd1" = NULL,
    "telefone1" = NULL,
    "ddd2" = NULL,
    "telefone2" = NULL,
    "dddFax" = NULL,
    "fax" = NULL,
    "email" = NULL
WHERE
    "ddd1" IS NOT NULL
    OR "telefone1" IS NOT NULL
    OR "ddd2" IS NOT NULL
    OR "telefone2" IS NOT NULL
    OR "dddFax" IS NOT NULL
    OR "fax" IS NOT NULL
    OR "email" IS NOT NULL;

ALTER TABLE "MarketIntelligenceCompany"
    DROP CONSTRAINT IF EXISTS "MarketIntelligenceCompany_global_contact_redaction_check";

ALTER TABLE "MarketIntelligenceCompany"
    ADD CONSTRAINT "MarketIntelligenceCompany_global_contact_redaction_check"
    CHECK (
        "ddd1" IS NULL
        AND "telefone1" IS NULL
        AND "ddd2" IS NULL
        AND "telefone2" IS NULL
        AND "dddFax" IS NULL
        AND "fax" IS NULL
        AND "email" IS NULL
    );

COMMENT ON CONSTRAINT "MarketIntelligenceCompany_global_contact_redaction_check"
ON "MarketIntelligenceCompany" IS
'Catálogo CNPJ global não persiste telefone, fax ou e-mail; contatos devem ser enriquecidos em contexto de tenant.';
