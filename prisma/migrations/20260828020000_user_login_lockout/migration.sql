-- Bloqueio de conta por tentativas de login malsucedidas — ver hooks.before/after em
-- src/lib/auth.ts. Complementa o rate limit por IP (AUTH_RATE_LIMIT_MAX) com um limite por
-- CONTA.
ALTER TABLE "user"
  ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3);
