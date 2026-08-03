-- Menções recentes na imprensa (fonte: GDELT, gratuito/sem chave), coletadas por
-- `news.service.ts` e persistidas junto do restante do enriquecimento em `enrichment.service.ts`.

ALTER TABLE "Company" ADD COLUMN "newsMentions" JSONB;
