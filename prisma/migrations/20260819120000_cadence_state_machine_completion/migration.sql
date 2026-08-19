-- CYC-002 (onda 22): completa a máquina de estados da cadência conforme roadmap
-- (SPRINT-06-CADENCIA-CICLO-RECEITA.md) — 5 estados de run (Active/Paused/Stopped/Completed/Failed,
-- eram só 3), 5 motivos de parada (+ PolicyGuardrail) e o número de tentativa como coluna própria
-- em CadenceTouchAttempt (antes só reconstituível contando linhas). Ver
-- src/features/cadence/domain/cadence.ts para a lógica que usa estes valores.
--
-- Escrita à mão (não via `prisma migrate dev`) por limitação de ambiente no shadow database
-- (permissão negada para criar banco) — mesmo workaround já usado na Onda 5 para a persistência
-- 3CX (ver `.agents/runs/onda-5.md`). Aplicada e validada contra Postgres real neste ambiente.

-- AlterEnum
ALTER TYPE "CadenceRunStatus" ADD VALUE 'Completed';
ALTER TYPE "CadenceRunStatus" ADD VALUE 'Failed';

-- AlterEnum
ALTER TYPE "CadenceStopReason" ADD VALUE 'PolicyGuardrail';

-- AlterTable
ALTER TABLE "CadenceTouchAttempt" ADD COLUMN "attemptNumber" INTEGER NOT NULL DEFAULT 1;
