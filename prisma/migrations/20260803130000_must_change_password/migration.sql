-- Força a troca de senha no próximo login quando um admin define uma senha temporária/padrão
-- pra outra pessoa (ver POST /api/auth-extra/change-password).
ALTER TABLE "user" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
