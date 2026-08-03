-- IA-005: "aprovar" uma AIPendingAction só marcava `approved = true` — nada consumia essa flag
-- depois, então nenhuma ação aprovada era executada de verdade. Estes campos permitem ao executor
-- real (aiPendingAction.service.ts) registrar se o envio de fato aconteceu, quando, e o motivo
-- quando falhar (SMTP fora do ar etc.) — sem isso a tela não teria como distinguir "aprovado e
-- enviado" de "aprovado e nada aconteceu".

ALTER TABLE "AIPendingAction" ADD COLUMN "executed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AIPendingAction" ADD COLUMN "executedAt" TIMESTAMP(3);
ALTER TABLE "AIPendingAction" ADD COLUMN "executionError" TEXT;
