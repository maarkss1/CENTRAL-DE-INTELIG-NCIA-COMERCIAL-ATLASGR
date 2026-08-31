-- Onda 43: Company.cnpj já foi gravado em pelo menos 3 formatos diferentes (dígitos puros,
-- pontuado, ou o que o usuário digitou sem normalizar) dependendo de qual write path criou o
-- registro — achado real, ver src/lib/cnpj.ts (normalização unificada aplicada em todo write path
-- nesta mesma onda). Sem normalizar os dados existentes primeiro, duas linhas com o mesmo CNPJ
-- real gravado em formatos diferentes não colidiriam na constraint abaixo, que compara string
-- crua.

-- 1) Normaliza os dados existentes: remove tudo que não é dígito, e trata string vazia (depois de
--    remover a pontuação) como ausência de CNPJ (NULL), nunca ''. Um UNIQUE trata '' como valor
--    igual entre linhas — sem isto, duas empresas sem CNPJ colidiriam na constraint abaixo; NULL
--    nunca colide com outro NULL.
UPDATE "Company"
SET cnpj = NULLIF(regexp_replace(cnpj, '\D', '', 'g'), '')
WHERE cnpj IS NOT NULL;

-- 2) Guarda de segurança: se sobrar duplicata real depois de normalizar (a mesma empresa
--    cadastrada duas vezes com o CNPJ em formatos diferentes por dois write paths diferentes
--    antes desta correção), a migration falha alto com a contagem em vez de decidir sozinha qual
--    linha apagar/mesclar — isso é decisão de negócio, não de schema. Query de diagnóstico pra
--    listar os grupos, se esta guarda disparar:
--    SELECT "organizationId", cnpj, array_agg(id) FROM "Company"
--    WHERE cnpj IS NOT NULL GROUP BY "organizationId", cnpj HAVING count(*) > 1;
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT "organizationId", cnpj
    FROM "Company"
    WHERE cnpj IS NOT NULL
    GROUP BY "organizationId", cnpj
    HAVING count(*) > 1
  ) duplicates;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Onda 43: % grupo(s) de CNPJ duplicado em Company (mesma organizationId + cnpj normalizado) sobrevivem à normalização — resolva manualmente (merge ou soft-delete da linha errada) antes de aplicar esta migration. Query de diagnóstico no comentário acima do bloco DO.',
      dup_count;
  END IF;
END $$;

-- 3) Só chega aqui se não houver duplicata real — a constraint passa a impedir novas duplicatas
--    em nível de banco (antes só a aplicação evitava isso, em companyIdentity.service.ts, sem
--    nenhuma trava no schema). Cobre inclusive linhas com soft delete (deletedAt preenchido) de
--    propósito — mesmo comportamento que resolveCompanyIdentity já usa pra achar duplicata (não
--    reabre o CNPJ de uma empresa só porque foi soft-deletada).
CREATE UNIQUE INDEX "Company_organizationId_cnpj_key" ON "Company"("organizationId", "cnpj");
