-- Promove o sinal de extração Bitrix parcial (achou o teto de segurança de páginas antes de
-- esgotar o portal para ao menos uma entidade) de um workaround em `errorMessage` para um valor
-- de enum de verdade. Resolve o handoff
-- .agents/handoffs/roadmap-v2-onda-1/06-para-01-status-extracao-parcial.md.
--
-- ALTER TYPE ... ADD VALUE é permitido dentro de transação a partir do PostgreSQL 12, desde que o
-- valor novo não seja *usado* na mesma transação — esta migração só o adiciona. IF NOT EXISTS
-- torna a migração reexecutável sem quebrar em bancos que já a receberam.
ALTER TYPE "BitrixExtractionStatus" ADD VALUE IF NOT EXISTS 'completed_partial';
