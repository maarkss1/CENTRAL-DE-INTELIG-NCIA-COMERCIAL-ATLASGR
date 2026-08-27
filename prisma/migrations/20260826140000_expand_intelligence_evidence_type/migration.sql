-- CPI — item "Enum de evidencia incompleto": IntelligenceEvidenceType tinha só FACT/INFERENCE/
-- RECOMMENDATION. O LDR real produz também estimativa, desconhecido e conflito de fontes, sem
-- valor correto para gravar esses casos hoje. Operação puramente aditiva — ALTER TYPE ... ADD
-- VALUE é permitida dentro de transação a partir do PostgreSQL 12 (aqui roda pg16), desde que o
-- valor novo não seja *usado* na mesma transação (esta migração só o adiciona; nenhum código desta
-- mudança grava linha usando os novos valores). IF NOT EXISTS torna a migração reexecutável sem
-- quebrar em bancos que já a receberam. Nenhum valor existente foi removido/renomeado.
--
-- Escrita à mão (não via `prisma migrate dev`) por limitação de ambiente: este worktree não tem
-- Postgres/shadow database disponível (mesmo workaround já usado nas migrations
-- 20260819120000_cadence_state_machine_completion e 20260802140000_automation_action_ligar_sdr_voz
-- deste repositório). NÃO validada contra um banco real — antes de aplicar em produção, rodar
-- `prisma migrate dev` (ou `prisma migrate deploy` num ambiente de staging real) para confirmar
-- que o Prisma aceita o arquivo e que o `ALTER TYPE` aplica limpo contra o schema atual.
ALTER TYPE "IntelligenceEvidenceType" ADD VALUE IF NOT EXISTS 'ESTIMATE';
ALTER TYPE "IntelligenceEvidenceType" ADD VALUE IF NOT EXISTS 'UNKNOWN';
ALTER TYPE "IntelligenceEvidenceType" ADD VALUE IF NOT EXISTS 'CONFLICT';
