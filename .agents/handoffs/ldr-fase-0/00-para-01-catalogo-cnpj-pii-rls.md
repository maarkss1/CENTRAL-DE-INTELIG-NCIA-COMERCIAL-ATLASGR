- De: 00 — Coordenador
- Para: 01 — Plataforma, Segurança e Dados
- Onda: LDR Fase 0 → Fase 1
- Status: resolvido
- Prioridade: bloqueador

## Problema

No início da auditoria, o working tree continha migração não commitada para
`MarketIntelligenceCompany`. A tabela incluía `email`, `telefone1`, `telefone2` e `fax`, mas a RLS
permitia SELECT a qualquer request com `app.current_tenant_id` não vazio. Isso criaria um catálogo
global de dados pessoais entre tenants. A mudança transitória desapareceu quando outra sessão
avançou a mesma branch; o risco deve ser tratado antes de qualquer reintrodução do catálogo.

No incremento transitório também havia `pg_trgm` duplicado em
`scripts/db/02-enable-extensions.sql` e o check de CNPJ aceitava letras nos 12 primeiros caracteres.

## Arquivos envolvidos

- `prisma/schema.prisma`
- `prisma/migrations/20260818123000_market_intelligence_companies/migration.sql`
- `scripts/db/02-enable-extensions.sql`
- `scripts/db/create-app-role.sql`

## Alteração necessária

1. Separar cadastro público de dados de contato pessoais; não publicar PII global.
2. Definir RLS segura para catálogo oficial e dado enriquecido por tenant.
3. Tornar CNPJ estritamente numérico e validar conforme a estratégia do importador.
4. Remover a extensão duplicada.
5. Definir promoção idempotente do catálogo para `Company`.

## Teste esperado

- Migração em banco limpo e no schema atual.
- Tenant A não lê PII enriquecido pelo tenant B.
- Importador publica snapshot com bypass; request comum não grava/ativa dataset.
- CNPJ alfanumérico é rejeitado.
- `prisma validate`, typecheck e testes de RLS ficam verdes.

## Contexto adicional

Não restaurar automaticamente o incremento transitório. Se o catálogo for reintroduzido, fazê-lo
sob ownership exclusivo do Agente 01 e com as correções acima desde a primeira migração versionada.

## Resolução

O catálogo global transitório `MarketIntelligenceCompany` não foi restaurado. Em seu lugar, a
fundação persistente do LDR foi ligada às entidades reais do CRM por sete agregados tenant-scoped:
`AccountIntelligenceSnapshot`, `AccountSignal`, `DecisionMaker`, `IntelligenceEvidence`,
`AccountScore`, `AccountRecommendation` e `EconomicRelationship`.

Todos exigem `organizationId` e possuem `FORCE ROW LEVEL SECURITY`, policy com filtro de tenant
tanto em `USING` quanto em `WITH CHECK`, além de FKs compostas que impedem vínculos entre
Company/snapshot/score de organizações diferentes mesmo sob bypass administrativo.

`DecisionMaker` referencia um `Contact` real da mesma Company e organização por FK composta e não
duplica e-mail ou telefone. A validação Prisma e o typecheck desta fundação foram executados pelo
Coordenador na branch de integração.
