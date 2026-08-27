-- Onda 39 (auditoria CPI — "AIPendingAction cobre agent/tenant/decision/approval/timestamp, mas
-- não tem approvedBy/userId de quem aprovou"): registra qual usuário aprovou/descartou uma ação
-- proposta pelo enxame de IA. Aditivo, nullable — nenhuma linha existente precisa de backfill
-- (ações já aprovadas/descartadas antes desta migration simplesmente não têm essa informação,
-- tratado como dado ausente, nunca inferido).
ALTER TABLE "AIPendingAction" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "AIPendingAction" ADD COLUMN "discardedBy" TEXT;
