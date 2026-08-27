-- Onda 40 (auditoria CPI): duas correções de rastreabilidade independentes, agrupadas na mesma
-- migration por serem pequenas e aditivas.

-- 1. BitrixExtractionRun.schemaVersion — carimba qual versão de BITRIX_FIELD_MAP (bitrixFieldMap.ts)
-- estava em vigor quando a extração rodou. Nullable: extrações anteriores não têm esse dado.
ALTER TABLE "BitrixExtractionRun" ADD COLUMN "schemaVersion" TEXT;

-- 2. Lead.savedSearchId — fecha o elo "funil quebra no primeiro elo (busca→lead)": nenhum Lead
-- promovido a partir de um candidato de SavedSearch guardava de qual busca salva ele veio.
ALTER TABLE "Lead" ADD COLUMN "savedSearchId" TEXT;

CREATE INDEX "Lead_savedSearchId_idx" ON "Lead"("savedSearchId");

ALTER TABLE "Lead"
    ADD CONSTRAINT "Lead_savedSearchId_fkey"
    FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
