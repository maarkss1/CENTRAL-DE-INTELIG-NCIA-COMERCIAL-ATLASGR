-- Fase 4 do roadmap de melhorias: a Matriz de Qualificação e a Matriz de Objeções viviam só em
-- memória (src/features/chatbook/constants/brandMatrices.ts), somente leitura, sem CRUD. RLS
-- habilitada já nesta migration (mesmo padrão de 20260821180000_assistant_message e
-- 20260820110000_ai_guardrail_event), não numa correção posterior.

-- CreateTable
CREATE TABLE "QualificationMatrixItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "questionCategory" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "idealAnswer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualificationMatrixItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectionMatrixItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "objectionTitle" TEXT NOT NULL,
    "objectionText" TEXT NOT NULL,
    "responseScript" TEXT NOT NULL,
    "keyDifferentiator" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectionMatrixItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QualificationMatrixItem_organizationId_brand_idx" ON "QualificationMatrixItem"("organizationId", "brand");

-- CreateIndex
CREATE INDEX "ObjectionMatrixItem_organizationId_brand_idx" ON "ObjectionMatrixItem"("organizationId", "brand");

-- AddForeignKey
ALTER TABLE "QualificationMatrixItem" ADD CONSTRAINT "QualificationMatrixItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectionMatrixItem" ADD CONSTRAINT "ObjectionMatrixItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RowLevelSecurity
ALTER TABLE "QualificationMatrixItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QualificationMatrixItem" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "QualificationMatrixItem" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

ALTER TABLE "ObjectionMatrixItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ObjectionMatrixItem" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "ObjectionMatrixItem" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

-- Seed: só o conteúdo real transcrito de reunião (9 objeções + 8 qualificações), descartando de
-- propósito as ~200 linhas geradas proceduralmente com texto genérico repetitivo que existiam em
-- brandMatrices.ts (decisão tomada com o usuário no planejamento da Fase 4). Semeado para TODA
-- organização já existente, não uma só — cada uma recebe a mesma base inicial, editável dali em
-- diante pela tela nova.
INSERT INTO "QualificationMatrixItem" ("id", "organizationId", "brand", "segment", "persona", "framework", "questionCategory", "questionText", "idealAnswer", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "Organization"."id", q.brand, q.segment, q.persona, q.framework, q."questionCategory", q."questionText", q."idealAnswer", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization"
CROSS JOIN (VALUES
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'SPIN', 'Situação', 'Qual o volume de cargas/mês ou faturamento mensal de frete gasto pela empresa hoje?', 'Resposta baseada nas operações do cliente.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'SPIN', 'Situação', 'A empresa possui frota própria dedicada ou 100% do frete é terceirizado/spot?', 'Resposta baseada nas operações do cliente.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'SPIN', 'Situação', 'Quais as rotas/praças onde a empresa tem maior índice de atraso ou devolução logística (SLA quebrado)?', 'Resposta baseada nas operações do cliente.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'SPIN', 'Situação', 'Qual TMS/ERP logístico vocês usam hoje para o roteiramento e expedição?', 'Resposta baseada nas operações do cliente.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'SPIN', 'Situação', 'Quais as regras de Gerenciamento de Risco (GR) exigidas pela sua apólice de seguro para este tipo de carga (Agro/Eletrônicos)?', 'Resposta baseada nas operações do cliente.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'SPIN', 'Situação', 'Quem assina as aprovações de novas transportadoras no comitê de compras da matriz?', 'Resposta baseada nas operações do cliente.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'SPIN', 'Situação', 'Quais os prazos mínimos que vocês precisam que a carga chegue no cliente final (Lead Time)?', 'Resposta baseada nas operações do cliente.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'SPIN', 'Situação', 'Qual a taxa de avaria tolerável hoje antes de gerar penalidades contratuais (multas) para a transportadora?', 'Resposta baseada nas operações do cliente.')
) AS q(brand, segment, persona, framework, "questionCategory", "questionText", "idealAnswer");

INSERT INTO "ObjectionMatrixItem" ("id", "organizationId", "brand", "segment", "persona", "objectionTitle", "objectionText", "responseScript", "keyDifferentiator", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "Organization"."id", o.brand, o.segment, o.persona, o."objectionTitle", o."objectionText", o."responseScript", o."keyDifferentiator", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization"
CROSS JOIN (VALUES
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'Objeção Mapeada em Reunião', 'O preço do frete de vocês está acima da média de mercado que pagamos hoje.', 'Entendo perfeitamente o seu lado. No entanto, analisando o cenário...', 'Análise consultiva baseada em histórico.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'Objeção Mapeada em Reunião', 'Já temos contratos de longo prazo e parceiros logísticos homologados, não queremos trocar agora.', 'Entendo perfeitamente o seu lado. No entanto, analisando o cenário...', 'Análise consultiva baseada em histórico.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'Objeção Mapeada em Reunião', 'O nosso sistema (TMS) não integra bem com transportadoras externas e geraríamos retrabalho manual.', 'Entendo perfeitamente o seu lado. No entanto, analisando o cenário...', 'Análise consultiva baseada em histórico.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'Objeção Mapeada em Reunião', 'Tivemos problemas graves com avarias de carga com parceiros anteriores, como garantem a segurança da nossa operação?', 'Entendo perfeitamente o seu lado. No entanto, analisando o cenário...', 'Análise consultiva baseada em histórico.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'Objeção Mapeada em Reunião', 'A matriz não aprova mudança de fornecedor de transporte sem um longo processo de homologação compliance (GR, Seguro, Ambiental).', 'Entendo perfeitamente o seu lado. No entanto, analisando o cenário...', 'Análise consultiva baseada em histórico.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'Objeção Mapeada em Reunião', 'Não vemos necessidade de terceirizar a frota para essa rota específica, preferimos nossa frota própria dedicada.', 'Entendo perfeitamente o seu lado. No entanto, analisando o cenário...', 'Análise consultiva baseada em histórico.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'Objeção Mapeada em Reunião', 'Vocês não possuem capilaridade na região Nordeste, que é onde temos os maiores gargalos de entrega hoje.', 'Entendo perfeitamente o seu lado. No entanto, analisando o cenário...', 'Análise consultiva baseada em histórico.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'Objeção Mapeada em Reunião', 'O prazo de pagamento de vocês é curto, nosso contas a pagar exige faturamento com 60 dias da emissão da fatura.', 'Entendo perfeitamente o seu lado. No entanto, analisando o cenário...', 'Análise consultiva baseada em histórico.'),
    ('atlasgr', 'Logística & Transportes', 'Diretor de Logística', 'Objeção Mapeada em Reunião', 'Estamos cortando custos de logística neste quarter, não há orçamento para testar novas modalidades premium.', 'Entendo perfeitamente o seu lado. No entanto, analisando o cenário...', 'Análise consultiva baseada em histórico.')
) AS o(brand, segment, persona, "objectionTitle", "objectionText", "responseScript", "keyDifferentiator");
