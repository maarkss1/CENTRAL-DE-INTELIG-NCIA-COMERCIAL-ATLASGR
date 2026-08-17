/*
  Warnings:

  - The `role` column on the `user` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'GESTOR', 'CLOSER', 'SDR', 'VISUALIZADOR');

-- DropForeignKey
ALTER TABLE "CallSuppression" DROP CONSTRAINT "CallSuppression_leadId_fkey";

-- DropIndex
DROP INDEX "DocumentChunk_vector_idx";

-- AlterTable
ALTER TABLE "AIPendingAction" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user" DROP COLUMN "role",
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'VISUALIZADOR';
