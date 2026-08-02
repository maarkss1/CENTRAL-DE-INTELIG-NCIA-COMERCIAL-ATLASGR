-- Nova ação de automação: disparar uma ligação do SDR de voz (Birth Voices Hub) para o lead.
--
-- ALTER TYPE ... ADD VALUE é permitido dentro de transação a partir do PostgreSQL 12 (aqui roda
-- pg16), desde que o valor novo não seja *usado* na mesma transação — esta migração só o adiciona.
-- IF NOT EXISTS torna a migração reexecutável sem quebrar em bancos que já a receberam.
ALTER TYPE "AutomationAction" ADD VALUE IF NOT EXISTS 'Ligar via SDR de Voz';
