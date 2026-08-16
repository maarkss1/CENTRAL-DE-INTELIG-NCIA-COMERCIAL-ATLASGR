# ARQUITETURA - Atlas GR National Market & Territory Intelligence System

## Princípio

O navegador é camada de **decisão e exploração**, não motor de ingestão de bases públicas gigantes.

```text
FONTES OFICIAIS / PRIMÁRIAS
        ↓
DOWNLOAD + SNAPSHOT + HASH
        ↓
RAW CACHE (fora do bundle web)
        ↓
ETL PYTHON
        ↓
CHAVE CANÔNICA IBGE + VALIDAÇÃO
        ↓
SQLITE / DUCKDB / PARQUET quando justificado
        ↓
AGREGAÇÕES MUNICIPAIS / CORREDORES / CONTAS
        ↓
SCORING + CONFIANÇA + EVIDÊNCIAS
        ↓
JSON/CSV compactos e versionados
        ↓
REACT / TYPESCRIPT
        ↓
BOARD + MAPA + TERRITÓRIOS + UNIT ECONOMICS
```

## Camadas

### 1. Source adapters

Responsáveis por descobrir, baixar e registrar snapshots sem depender de URLs mensais hardcoded sempre que a fonte oferecer catálogo/API.

Fontes prioritárias:

- ANTT RNTRC;
- ANTT RNTRC veículos;
- ANTT MDF-e / Dados do TRC;
- Receita Federal CNPJ;
- IBGE;
- MJSP/Sinesp;
- DNIT;
- fontes empresariais primárias para concorrência.

Cada snapshot deve registrar:

```text
source_name
source_url
resource_id
competence
downloaded_at
last_modified
raw_bytes
sha256
license
```

### 2. Raw cache

Local sugerido:

```text
.cache/market-intelligence/raw/<dataset>/<competencia>/
```

O diretório deve ser ignorado pelo Git.

Nunca copiar RNTRC/CNPJ/MDF-e bruto para `public/`.

### 3. Geografia canônica

Chave de união nacional:

```text
codigo_ibge
```

Nome de município serve para apresentação e lookup de contingência, nunca como chave analítica final.

O cadastro canônico deve conter no mínimo:

```text
codigo_ibge
municipio
uf
regiao
latitude
longitude
```

Quando houver fonte adequada, acrescentar:

```text
regiao_imediata
regiao_intermediaria
mesorregiao_historica
microrregiao_historica
```

Observação: o projeto deve distinguir **município político-administrativo** de outras unidades especiais usadas por algumas estatísticas nacionais. A contagem do universo deve ser registrada no metadata do snapshot, não hardcoded na interface.

### 4. Camada analítica

Grãos principais:

```text
municipio
corredor origem-destino
territorio
conta ICP
competidor/presenca
```

Tabelas/intermediários conceituais:

```text
dim_municipio
fact_rntrc_municipio
fact_frota_municipio
fact_icp_municipio
fact_mdfe_fluxo
fact_mdfe_municipio
fact_risco_municipio
fact_competicao_presenca
fact_competicao_cobertura
score_municipio
territorio_candidato
territorio_otimizado
```

### 5. Scoring

O domínio React/TypeScript não deve recalcular dados brutos. Ele pode recalcular cenários econômicos editáveis, filtros e explicabilidade a partir de componentes pré-computados.

Scores persistidos devem carregar:

```text
value
confidence
availability
methodology_version
evidence_ids
```

White Space competitivo é `NULL/BLOQUEADO` se `census_status != CENSO_COMPLETO`.

### 6. Datasets públicos para o front

Diretório:

```text
public/tools/atlas-market-intelligence/data/
```

Arquivos previstos:

```text
manifest.json
municipios.json
territorios.json
evidencias.json
competidores.json
```

O `manifest.json` é carregado primeiro. Ele declara:

- versão do schema;
- data de geração;
- metodologia;
- datasets e competências;
- saúde dos dados;
- arquivos derivados;
- bloqueios de decisão.

A UI nunca deve inferir disponibilidade pela ausência silenciosa de um arquivo.

## Frontend

### Integração

A rota `src/pages/MarketIntelligence.tsx` passou a renderizar uma feature React nativa:

```text
src/features/market-intelligence/
  domain/
    MarketIntelligence.ts
  components/
    MarketIntelligenceApp.tsx
  marketIntelligence.data.ts
```

O HTML v0.5 permanece no histórico/branch de backup como referência de paridade e não é mais a arquitetura-alvo.

### Estado e URLs

Nas próximas ondas, filtros relevantes devem ser serializados em query string para permitir compartilhar recortes, especialmente:

```text
layer
uf
region
score_min
confidence
radius
scenario
seller_count
```

### Mapa

Requisitos arquiteturais:

- 5k+ polígonos/municípios sem DOM marker por item;
- clusterização/heatmap em canvas ou WebGL;
- carregamento progressivo;
- GeoJSON simplificado por nível de zoom;
- camadas ativáveis;
- overlay de raio comercial;
- seleção de município e território.

A escolha final da biblioteca deve considerar dependências já existentes e custo do bundle. Não será adicionada uma biblioteca cartográfica apenas para desenhar o protótipo.

## Territory Optimizer

Entrada:

```text
municipios elegiveis
scores ajustados por confiança
contas ICP
RNTRC/frota
fluxo
coordenadas
raios [100,150,200,250,300,400]
quantidade vendedores [1,2,3,5,10,20]
```

Saída:

```text
base
raio
municipios cobertos
massa ICP
score territorio
confianca
sobreposicao
custo/eficiencia
```

Estratégia inicial:

1. gerar todos os candidatos cidade-base x raio;
2. agregar municípios cobertos por Haversine como pré-filtro;
3. calcular valor territorial;
4. penalizar baixa confiança e dispersão;
5. selecionar conjuntos de territórios maximizando cobertura/valor e minimizando sobreposição;
6. refinar custo rodoviário quando matriz/rota oficial estiver disponível.

Haversine não será rotulado como tempo de viagem.

## Unit economics

Premissas ficam no navegador apenas para simulação e devem ser rotuladas `PREMISSA EDITÁVEL` até haver fonte comercial Atlas.

Valores base não serão inventados.

## Segurança e privacidade

- zero secrets no frontend/datasets;
- dados CNPJ brutos permanecem no pipeline, não no bundle;
- lista de prospecção deve conter dados empresariais necessários, sem coleta de dados pessoais excessivos;
- URLs de fontes são públicas;
- hashes permitem auditoria sem republicar bases gigantes.

## Estratégia de migração

1. preservar baseline em branch de backup;
2. criar domínio nativo e manifest;
3. remover iframe da rota;
4. portar funcionalidades úteis do HTML por módulos;
5. substituir importação manual bruta por derivados compactos;
6. validar paridade;
7. somente depois retirar dependência operacional do HTML antigo.

## Critério arquitetural de decisão pronta

`manifest.decisionReady = true` somente quando o pipeline de publicação verificar as regras mínimas definidas na metodologia. A interface não possui botão para burlar esta trava.