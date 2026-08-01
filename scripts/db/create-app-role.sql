-- N1 (docs/auditoria-divida-tecnica/08-PLANO-DE-SEGURANCA.md): a aplicacao sempre conectava como
-- superusuario do Postgres, o que faz TODAS as politicas RLS do projeto serem ignoradas (Postgres
-- nunca aplica RLS a um superusuario, nem com FORCE ROW LEVEL SECURITY). Este script cria um papel
-- de aplicacao NOSUPERUSER e transfere a posse dos objetos existentes para ele, o que faz o FORCE
-- ROW LEVEL SECURITY (ja presente nas migrations) passar a valer de verdade.
--
-- Deve ser executado conectado ao banco alvo, autenticado como o superusuario de bootstrap
-- (o POSTGRES_USER de cada ambiente). Requer a variavel psql "app_password":
--   psql -h <host> -p <port> -U <superusuario> -d <database> -v app_password=<senha> \
--     -f scripts/db/create-app-role.sql
--
-- Idempotente: seguro rodar de novo (ex.: apos criar uma extensao nova) sem quebrar nada.

DO $$
DECLARE
    v_password text := :'app_password';
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'prospector_app') THEN
        EXECUTE format(
            'CREATE ROLE prospector_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
            v_password
        );
    ELSE
        EXECUTE format('ALTER ROLE prospector_app WITH PASSWORD %L', v_password);
    END IF;
END
$$;

-- CREATE EXTENSION exige superusuario; roda aqui (com a conexao ainda autenticada como
-- superusuario de bootstrap) pra garantir que exista antes de qualquer coisa depender dela.
CREATE EXTENSION IF NOT EXISTS vector;

-- Transfere a posse de tudo que o superusuario de bootstrap possui neste banco (tabelas,
-- sequences, etc.) para o papel de aplicacao. Sem isso, prospector_app so teria os GRANTs
-- explicitos abaixo, mas continuaria isento de RLS onde a policy usa FORCE — FORCE ROW LEVEL
-- SECURITY so restringe quem e o DONO do objeto, nao quem so tem GRANT.
REASSIGN OWNED BY CURRENT_USER TO prospector_app;

GRANT ALL PRIVILEGES ON SCHEMA public TO prospector_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO prospector_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO prospector_app;
