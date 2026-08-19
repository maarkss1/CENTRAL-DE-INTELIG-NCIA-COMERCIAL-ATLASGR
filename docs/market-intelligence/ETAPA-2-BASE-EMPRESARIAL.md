# Etapa 2 — Base empresarial detalhada

## Auditoria anterior à implementação

| Componente | Estado encontrado | Evidência |
|---|---|---|
| Prisma/PostgreSQL | FUNCIONA | migrations versionadas, client compartilhado e contexto RLS já existentes |
| `Company` do CRM | FUNCIONA | entidade tenant-scoped em `prisma/schema.prisma`; não foi reutilizada |
| Market Intelligence territorial | PARCIAL | React consumia `manifest.json`; não havia empresas detalhadas |
| ETL CNPJ | PARCIAL | streaming + SQLite, porém filtrava empresas ICP ativas e só agregava município |
| IBGE/crosswalk municipal | PARCIAL | lookup oficial existia no ETL, mas não era persistido nem auditável no PostgreSQL |
| RNTRC municipal | FUNCIONA | snapshot ANTT Jul/2026, hash e metadados no bundle |
| RNTRC empresarial | NÃO IMPLEMENTADO | nenhuma fonte individual válida; corretamente mantido nulo nesta etapa |
| `icp_taxonomy.v1.json` | PARCIAL | regras A/B/C territoriais existem, sem calibração comercial para tier empresarial definitivo |
| Score/otimizador territorial | PARCIAL | funciona com gates de confiança, mas não é fonte de classificação empresarial desta etapa |
| Parquet/PyArrow/DuckDB | NÃO IMPLEMENTADO | não fazem parte das dependências atuais; CSV gzip + SQLite preserva processamento em disco sem ampliar a stack |
| SQL/extensões | FUNCIONA | scripts de papel/RLS já existiam; `pg_trgm` passou a ser versionado para busca textual |
| Docker/CI | PARCIAL | infraestrutura existe, mas o workflow CNPJ publicava apenas agregado municipal |
| Variáveis/produção | PARCIAL | contratos de ambiente existem; credencial de importação continua externa ao repositório e produção não foi acessada |
| Snapshot CNPJ publicado | NÃO IMPLEMENTADO | manifest registrava `NAO_DISPONIVEL`; nenhum arquivo empresarial no checkout |
| API de empresas | NÃO IMPLEMENTADO | nenhuma rota `/api/market-intelligence/*` |
| ICP empresarial | PARCIAL | taxonomia A/B/C territorial não calibrada; nenhum tier definitivo foi atribuído |
| Interface empresarial | NÃO IMPLEMENTADO | tela continha Board, Territórios, Simulador e Saúde dos Dados |
| Workflow CNPJ | PARCIAL | cron agregava CNPJ/ICP municipal; não publicava base detalhada no PostgreSQL |

## Arquitetura implementada

`MarketIntelligenceCompany` é independente de `Company` (CRM). A chave lógica é
`(datasetId, cnpj)`, permitindo manter snapshots históricos sem misturar competências. Somente o
dataset `READY` com `publicationSlot=CNPJ_ACTIVE` é consultado.

O CNPJ aceita os registros numéricos legados e o formato alfanumérico vigente, sempre normalizado
em 14 posições sem pontuação. Os dois dígitos verificadores finais continuam numéricos.

Fluxo:

```text
ZIPs oficiais Receita + localidades IBGE
→ streaming/SQLite em disco
→ CSV gzip particionado por UF + manifest SHA-256
→ validação de cabeçalho/hash/contagem
→ COPY para TEMP staging
→ INSERT SELECT no dataset PROCESSING
→ reconciliação de contagens
→ READY + troca atômica do snapshot ativo
```

## Segurança e semântica

- leitura exige sessão e tenant válidos no backend;
- RLS bloqueia acesso direto sem contexto da aplicação;
- escrita exige `app.bypass_rls=on` e credencial de banco do importador;
- `pageSize` máximo é 200;
- ordenação usa allowlist, e todos os valores são parametrizados;
- contato da Receita é rotulado como cadastral público não validado;
- ICP é `DERIVED` quando calculado e `null` enquanto não houver taxonomia definitiva;
- RNTRC municipal nunca é atribuído a uma empresa; ele aparece como indicador territorial
  observado, com competência e fonte próprias, nos territórios e no ranking `RNTRC_TERRITORIAL`;
- os dados cadastrais da Receita são `OBSERVED`.

## Operação

Consulte os comandos no README do módulo. A execução nacional omite os filtros de UF/IBGE. O
pipeline escreve snapshots imutáveis por hash e não coloca ZIPs/CSVs brutos em `public/`.

O importador requer o cliente PostgreSQL `psql`. Em falha, marca o novo dataset como `FAILED`; o
snapshot anteriormente ativo permanece publicado.

## Endpoints

- `GET /api/market-intelligence/companies`
- `GET /api/market-intelligence/companies/:cnpj`
- `GET /api/market-intelligence/territories`
- `GET /api/market-intelligence/rankings`
- `GET /api/market-intelligence/sources`

## Validação de Ribeirão Preto

O alvo canônico é `UF=SP`, `municipioIbge=3543402`, `situacaoCadastral=ATIVA`. Números, CNPJs e
tempos só devem ser registrados depois de uma execução real contra uma competência oficial; este
documento não preenche placeholders com dados simulados.
