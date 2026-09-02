-- Auditoria da plataforma (subagentes): Prospect.cnpj era `@unique` GLOBAL (criado na migration
-- 20260726013952_add_ai_engine_setting), não escopado por tenant como Company.cnpj já é desde
-- 20260830120000. Efeito real: se a Organização A já tinha um Prospect com um CNPJ, a
-- Organização B nunca conseguia criar um Prospect com o mesmo CNPJ — colisão indevida entre
-- tenants diferentes (não é vazamento de dado, mas um bloqueio funcional incorreto). Mesmo
-- padrão e mesmas justificativas de 20260830120000_company_organization_cnpj_unique, adaptado
-- para Prospect.

-- 1) Remove a constraint global antiga antes de criar a nova composta.
DROP INDEX IF EXISTS "Prospect_cnpj_key";

-- 2) Normaliza os dados existentes: remove tudo que não é dígito, e trata string vazia (depois
--    de remover a pontuação) como ausência de CNPJ (NULL), nunca ''. Um UNIQUE trata '' como
--    valor igual entre linhas — sem isto, dois prospects sem CNPJ colidiriam na constraint
--    abaixo; NULL nunca colide com outro NULL.
UPDATE "Prospect"
SET cnpj = NULLIF(regexp_replace(cnpj, '\D', '', 'g'), '')
WHERE cnpj IS NOT NULL;

-- 3) Guarda de segurança: mesmo padrão de 20260830120000 — se sobrar duplicata real dentro da
--    mesma organização depois de normalizar, a migration falha alto com a contagem em vez de
--    decidir sozinha qual linha apagar/mesclar (decisão de negócio, não de schema). Query de
--    diagnóstico pra listar os grupos, se esta guarda disparar:
--    SELECT "organizationId", cnpj, array_agg(id) FROM "Prospect"
--    WHERE cnpj IS NOT NULL GROUP BY "organizationId", cnpj HAVING count(*) > 1;
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT "organizationId", cnpj
    FROM "Prospect"
    WHERE cnpj IS NOT NULL
    GROUP BY "organizationId", cnpj
    HAVING count(*) > 1
  ) duplicates;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      '% grupo(s) de CNPJ duplicado em Prospect (mesma organizationId + cnpj normalizado) sobrevivem à normalização — resolva manualmente (merge ou remoção da linha errada) antes de aplicar esta migration. Query de diagnóstico no comentário acima do bloco DO.',
      dup_count;
  END IF;
END $$;

-- 4) Só chega aqui se não houver duplicata real — a constraint passa a ser por tenant, do mesmo
--    jeito que já vale para Company.
CREATE UNIQUE INDEX "Prospect_organizationId_cnpj_key" ON "Prospect"("organizationId", "cnpj");
