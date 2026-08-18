- De: 00 — Coordenador
- Para: 01 — Plataforma, Segurança e Dados
- Onda: LDR Fase 0 → Fase 1
- Status: aberto
- Prioridade: bloqueador

## Problema

O working tree contém uma migração ainda não commitada para `MarketIntelligenceCompany`. A tabela
inclui `email`, `telefone1`, `telefone2` e `fax`, mas a RLS proposta permite SELECT a qualquer request
com `app.current_tenant_id` não vazio. Isso transforma dados pessoais em catálogo global entre
tenants e viola minimização/isolamento previstos em `AGENTS.md`.

Também foram encontrados dois defeitos mecânicos no incremento: `pg_trgm` aparece duas vezes em
`scripts/db/02-enable-extensions.sql` e o check de CNPJ aceita letras nos 12 primeiros caracteres.

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma`
- `prisma/migrations/20260818123000_market_intelligence_companies/migration.sql`
- `scripts/db/02-enable-extensions.sql`
- `scripts/db/create-app-role.sql`

## Alteração necessária

1. Separar campos públicos do cadastro CNPJ de dados de contato pessoais; não publicar PII global.
2. Definir política RLS segura para catálogo oficial e para qualquer dado enriquecido por tenant.
3. Tornar o CNPJ estritamente numérico e validar dígitos conforme a estratégia do importador.
4. Remover a declaração duplicada de `pg_trgm`.
5. Documentar crosswalk/promoção idempotente de `MarketIntelligenceCompany` para `Company`.

## Teste esperado

- Migração sobe em banco limpo e em banco com o schema atual.
- Request autenticada do tenant A não lê PII enriquecido pelo tenant B.
- Importador com bypass publica snapshot; request comum não grava nem ativa dataset.
- Busca por CNPJ rejeita valor alfanumérico e mantém paginação/indexação prevista.
- `prisma validate`, typecheck e testes de RLS/migração ficam verdes.

## Contexto adicional

Não descartar as alterações locais existentes. Elas são trabalho em andamento no checkout
`codex/etapa-2-market-intelligence` e precisam ser estabilizadas pelo dono exclusivo do schema antes
de integração.
