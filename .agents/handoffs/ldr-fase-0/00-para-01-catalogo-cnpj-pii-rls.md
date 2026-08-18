- De: 00 — Coordenador
- Para: 01 — Plataforma, Segurança e Dados
- Onda: LDR Fase 0 → Fase 1
- Status: resolvido
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

## Resolução

Resolvido na estabilização da Etapa 2 em 18/08/2026:

1. O catálogo global passa a ter um guardrail no próprio PostgreSQL que obriga `ddd1`, `telefone1`,
   `ddd2`, `telefone2`, `dddFax`, `fax` e `email` a permanecerem `NULL`. A carga usa staging efêmero
   via `COPY`, mas não persiste esses campos em `MarketIntelligenceCompany`. A API também usa
   `select` explícito sem campos de contato. Enriquecimento de contato continua pertencendo a um
   contexto de tenant/CRM, não ao catálogo compartilhado.
2. A RLS existente permanece apropriada para o catálogo empresarial não sensível e somente leitura:
   tenants autenticados consultam o mesmo snapshot oficial; publicação/escrita exige
   `app.bypass_rls=on`.
3. O pedido original para tornar CNPJ estritamente numérico foi **superseded por mudança oficial da
   Receita Federal**. Em 31/07/2026 foi gerado o primeiro CNPJ alfanumérico e os sistemas devem
   aceitar letras/números nas 12 primeiras posições, preservando dois dígitos verificadores
   numéricos. O contrato `^[A-Z0-9]{12}[0-9]{2}$` é mantido e ganhou teste dedicado.
4. A duplicidade de `pg_trgm` foi removida de `scripts/db/02-enable-extensions.sql`.
5. O catálogo continua separado de `Company`: consulta/listagem/detalhe não promovem empresa para o
   CRM. Promoção continua sendo ação explícita do fluxo comercial já existente em Prospecção.
6. RNTRC municipal não é transformado em atributo do CNPJ. O loader mantém os campos individuais
   nulos enquanto não existir fonte individual rastreável.

### Evidência esperada atualizada

- migration de guardrail sobe após a migration base e zera contato global preexistente;
- loader valida SHA-256, usa `COPY`, staging e publicação atômica `CNPJ_ACTIVE`;
- CNPJ numérico e alfanumérico válido são aceitos; formato incompleto é rejeitado;
- API pagina server-side e nunca devolve telefone/fax/e-mail;
- a nova aba Empresas deixa explícita a separação Market Intelligence × CRM e a proveniência.
