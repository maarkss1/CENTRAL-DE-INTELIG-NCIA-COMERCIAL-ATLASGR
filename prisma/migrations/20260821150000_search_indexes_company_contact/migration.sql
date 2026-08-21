-- Fase 1 do plano "melhorar busca": índices ausentes nos campos usados pela busca
-- ILIKE/contains de Empresas (tradeName) e Contatos (name, role, phone, whatsapp), que hoje
-- fazem full scan. Segue o mesmo padrão trigram já usado em MarketIntelligenceCompany
-- (20260818123000_market_intelligence_companies).

-- Idempotente: a extensão já deve existir (criada na migration de Market Intelligence), mas
-- garante em bases onde ela não rodou.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Company.tradeName: usado no OR/ILIKE de PrismaCompanyRepository, sem índice até agora.
CREATE INDEX "Company_tradeName_trgm_idx" ON "Company" USING GIN ("tradeName" gin_trgm_ops);
CREATE INDEX "Company_tradeName_idx" ON "Company"("tradeName");

-- Contact: name/role fazem busca textual (ILIKE) tolerante a substring — trigram.
-- phone/whatsapp são buscados por igualdade/prefixo — índice b-tree simples basta.
CREATE INDEX "Contact_name_trgm_idx" ON "Contact" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Contact_role_trgm_idx" ON "Contact" USING GIN ("role" gin_trgm_ops);
CREATE INDEX "Contact_name_idx" ON "Contact"("name");
CREATE INDEX "Contact_role_idx" ON "Contact"("role");
CREATE INDEX "Contact_phone_idx" ON "Contact"("phone");
CREATE INDEX "Contact_whatsapp_idx" ON "Contact"("whatsapp");
