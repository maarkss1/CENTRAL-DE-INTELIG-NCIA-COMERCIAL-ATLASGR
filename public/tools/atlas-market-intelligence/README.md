# Atlas GR National Market & Territory Intelligence System

Plataforma de geointeligência, inteligência de mercado e planejamento territorial para responder com evidência:

> Onde a Atlas GR deve contratar o próximo vendedor consultor externo, qual território ele deve cobrir e qual capacidade econômica existe nesse território?

## Estado

A base empresarial detalhada está implementada no backend e no frontend. O sistema territorial
continua sem publicar um vencedor enquanto os datasets mínimos não sustentarem a decisão.

Os 16 clusters históricos são `HIPÓTESES DE TRIAGEM`, não ranking final.

## Arquitetura

```text
fontes oficiais/primárias
→ snapshot + competência + hash
→ cache bruto fora do bundle
→ ETL Python
→ código IBGE
→ agregações municipais/corredores/contas
→ scores + confiança + evidências
→ datasets compactos
→ React + TypeScript
→ Board / Mapa / Territórios / Economics
```

A rota Market Intelligence da Central é nativa React. O HTML v0.5 foi preservado no baseline/branch de backup para paridade, mas não é mais a arquitetura-alvo.

## Governança obrigatória

```text
OBSERVADO
ESTIMADO
PROXY
PREMISSA_EDITÁVEL
NÃO DISPONÍVEL
```

Concorrência:

```text
NÃO PESQUISADO
PESQUISA PARCIAL
CENSO COMPLETO
```

Somente `CENSO COMPLETO` libera White Space competitivo como indicador decisório.

## Camadas

1. geografia IBGE;
2. RNTRC / estoque logístico;
3. frota RNTRC;
4. CNPJ / ICP A-B-C;
5. MDF-e / fluxo logístico real;
6. Need Atlas / risco;
7. tipo/pressão de carga;
8. concorrência;
9. White Space;
10. Opportunity Score bruto e ajustado por confiança;
11. Territory Optimizer;
12. TAM / SAM / SOM;
13. seller economics;
14. Plano Nacional de Expansão.

## ETLs

### RNTRC

`etl_rntrc_atlas.py`

- descobre a competência mensal mais recente no CKAN oficial ANTT;
- baixa para `.cache/market-intelligence/`;
- registra SHA-256;
- cruza município/UF com IBGE;
- agrega ETC/TAC/CTC;
- publica apenas JSON municipal compacto.

Workflow: `.github/workflows/market-intelligence-rntrc.yml`.

### CNPJ / ICP

`etl_cnpj_atlas.py`

- descobre a competência do diretório oficial Receita;
- processa ZIPs em streaming;
- usa SQLite temporário;
- considera situação ativa;
- usa CNAE principal + secundários;
- aplica `icp_taxonomy.v1.json`;
- preserva matriz/filial e porte como sinais;
- publica agregado municipal por código IBGE.

Quando `--companies-output-dir` é informado, a mesma execução também produz a base empresarial
detalhada em CSV gzip particionado por UF, com Empresas + Estabelecimentos + Simples/MEI + tabelas
de domínio da Receita. O output é imutável por `competencia` e `datasetHash`; ICP e RNTRC
empresarial permanecem nulos quando não há evidência individual.

Prova de Ribeirão Preto, preparada para a competência realmente disponível na fonte:

```bash
python public/tools/atlas-market-intelligence/etl_cnpj_atlas.py \
  --competence YYYY-MM \
  --workdir .cache/market-intelligence/cnpj \
  --companies-output-dir .cache/market-intelligence/normalized/companies \
  --companies-uf SP \
  --companies-municipality-ibge 3543402
```

Carga em massa do manifest validado (requer `psql` e `DATABASE_URL`/`DIRECT_URL`):

```bash
python scripts/market_intelligence/import_companies.py \
  --manifest .cache/market-intelligence/normalized/companies/competencia=YYYY-MM/snapshot=HASH/manifest.json
```

O importador usa `COPY` para uma tabela temporária, valida contagens e só então troca o
`publicationSlot=CNPJ_ACTIVE` em transação. Reexecutar o mesmo hash é idempotente.

A taxonomia é regra de modelo versionada e ainda deve ser calibrada com dados comerciais Atlas.

### MDF-e

`etl_mdfe_atlas.py` existe como normalizador legado e será promovido a pipeline nacional de fluxo/corredores antes de liberar a camada.

### Risco

`etl_risco_sinesp.py` existe como base inicial. A versão nacional deverá registrar granularidade e usar `PROXY_UF` quando não houver observação municipal.

## Frontend

Feature:

```text
src/features/market-intelligence/
  components/CompanyExplorer.tsx
  components/MarketIntelligenceApp.tsx
  domain/MarketIntelligence.ts
  domain/territoryOptimizer.ts
  marketIntelligence.data.ts
  marketIntelligence.api.ts
  server/marketIntelligence.routes.ts
  server/marketIntelligence.service.ts
```

Já implementado:

- consulta empresarial real e separada do CRM;
- paginação e filtros server-side;
- detalhe por CNPJ com proveniência;
- Board View com gate de decisão;
- Saúde dos Dados;
- simulador econômico sem defaults inventados;
- contratos tipados de dados/evidência/confiança;
- Territory Optimizer com raios 100/150/200/250/300/400 km;
- cenários 1/2/3/5/10/20 vendedores;
- penalização de overlap por valor incremental.

## Datasets do frontend

Entrada canônica:

`public/tools/atlas-market-intelligence/data/manifest.json`

Derivados previstos:

```text
municipios.json
territorios.json
evidencias.json
competidores.json
rntrc_municipios.json
icp_municipios.json
```

Bases brutas CNPJ/RNTRC/MDF-e nunca devem entrar em `public/`.

## Documentação

- `AUDITORIA_ESTADO_ATUAL.md`
- `ARQUITETURA.md`
- `METODOLOGIA.md`
- `DATA_LINEAGE.md`
- `FONTES.md`
- `DICIONARIO_DADOS.md`
- `CHANGELOG.md`
- `PLANO_EXPANSAO_ATLAS.md`
- `METODOLOGIA_WHITESPACE.md` (histórico)
- `METODOLOGIA_RISCO_TERRITORIO.md` (histórico)

## Testes

A feature possui testes unitários para:

- gate do censo competitivo;
- scores 0-100;
- divisão por zero;
- seller break-even;
- distância Haversine;
- exclusão de municípios bloqueados;
- minimização de sobreposição territorial.

O projeto só será marcado como concluído após lint, typecheck, unit, integration, build, E2E real e screenshots nos breakpoints definidos.

## Segurança

- sem secrets/tokens no Market Intelligence;
- cache bruto ignorado pelo Git;
- catálogo empresarial detalhado em tabelas próprias, somente leitura para tenants autenticados e
  separado do CRM; exports brutos não são publicados no bundle;
- nenhuma necessidade de dados pessoais de sócios;
- hashes e evidências permitem auditoria sem republicar bases públicas gigantes.

## Antes de usar para contratação

Consulte `data/manifest.json` e `PLANO_EXPANSAO_ATLAS.md`. Se `decisionReady=false`, qualquer cidade ainda é hipótese e não decisão executiva.
