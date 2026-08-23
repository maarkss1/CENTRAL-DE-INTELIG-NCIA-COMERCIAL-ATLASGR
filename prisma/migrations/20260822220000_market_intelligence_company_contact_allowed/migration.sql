-- Decisão de produto (AtlasGR, 2026-08-22): o catálogo nacional de empresas do Market
-- Intelligence passa a persistir telefone/fax/e-mail cadastrais da Receita Federal na tabela
-- global, revertendo a restrição adicionada em 20260818190000_market_intelligence_catalog_guardrails.
-- O contato continua rotulado como "DADO_CADASTRAL_PUBLICO_NAO_VALIDADO" (ver
-- MarketIntelligenceCompany.dataOrigin / docs/market-intelligence/ETAPA-2-BASE-EMPRESARIAL.md) —
-- só a obrigatoriedade de redação global foi removida.

ALTER TABLE "MarketIntelligenceCompany"
    DROP CONSTRAINT IF EXISTS "MarketIntelligenceCompany_global_contact_redaction_check";
