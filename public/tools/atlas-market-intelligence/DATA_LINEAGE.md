# DATA LINEAGE - Atlas GR National Market & Territory Intelligence System

**Objetivo:** permitir que qualquer número exibido pela plataforma seja rastreado de volta à fonte, competência, transformação e regra metodológica que o produziu.

## Regra geral

```text
Fonte
↓
Snapshot bruto + metadata + hash
↓
ETL versionado
↓
Chave geográfica canônica IBGE
↓
Tabela/agregado intermediário
↓
Indicador componente
↓
Score + confiança
↓
Território
↓
Recomendação executiva
↓
Interface / exportação
```

Nenhuma etapa pode substituir `NÃO DISPONÍVEL` por zero sem uma regra de negócio explícita e documentada.

---

## 1. Geografia IBGE

```text
IBGE API de Localidades
↓
.cache/market-intelligence/raw/ibge/municipios.json
↓
normalização para lookup UF + município
↓
codigo_ibge como chave canônica
↓
dim_municipio
↓
joins RNTRC / CNPJ / MDF-e / risco / concorrência
↓
municipios.json
```

### Transformações

- preservação do nome oficial para apresentação;
- normalização textual apenas para lookup de contingência;
- código IBGE como chave final;
- município homônimo nunca é unido apenas pelo nome;
- parser aceita tanto a hierarquia histórica `microrregiao -> mesorregiao -> UF` quanto `regiao-imediata -> regiao-intermediaria -> UF`;
- o lookup é rejeitado se não cobrir pelo menos 5.500 municípios;
- latitude/longitude devem vir de fonte documentada e não de inferência textual -- resolvido via
  IBGE BCIM (camada `lim_municipio_a`, join por código IBGE `geocodigo`, centroide geométrico do
  polígono municipal). Ver `FONTES.md` seção 5 e `etl_municipios_ibge.py`.

---

## 2. RNTRC - transportadores

```text
ANTT / recurso oficial RNTRC Jul/2026
↓
transportadores_rntrc_07_2026.csv
↓
.cache/market-intelligence/raw/rntrc/2026-07/
↓
etl_rntrc_atlas.py
↓
filtro de situação ativa
↓
lookup município + UF → codigo_ibge
↓
agregação ETC / TAC / CTC / ETC equiparada
↓
rntrc_municipios.json
+ rntrc_municipios.metadata.json
↓
Demand Score / Territory Optimizer
↓
Interface
```

### Snapshot publicado

- competência: `2026-07`;
- atualização declarada do recurso: `2026-08-10`;
- bruto: `158.740.046` bytes;
- linhas processadas: `1.158.159`;
- transportadores ativos: `899.249`;
- municípios com presença RNTRC: `5.422`;
- linhas ativas sem match IBGE: `391` (`0,0435%`);
- SHA-256 bruto e derivado persistidos em metadata.

### Controles

- SHA-256 do bruto e do derivado;
- total de linhas processadas;
- total de linhas ativas;
- linhas sem casamento IBGE;
- taxa de unmatched;
- competência;
- URL e resource id oficiais;
- dataset bruto nunca entra no bundle web.

---

## 3. RNTRC - frota

O dicionário oficial do recurso `RNTRC-Dados de Veículos` define os campos públicos como:

```text
Categoria do Transportador
Tipo de Veículo
UF do Veículo
Categoria
Carroceria
Ano de Fabricação do Veículo
Quantidade
```

Ele **não fornece município nem número RNTRC individual**. Portanto a linhagem correta é:

```text
ANTT / RNTRC-Dados de Veículos
+ dicionário oficial
↓
probe de disponibilidade e integridade do recurso corrente
↓
SE payload nacional válido:
    CSV bruto
    ↓
    etl_rntrc_veiculos_atlas.py
    ↓
    soma de Quantidade por UF
    + Tipo de Veículo: Tração / Implemento
    + Categoria do Transportador: ETC / ETC Equiparada / TAC / CTC
    + ano médio ponderado quando disponível
    ↓
    rntrc_frota_uf.json
    + rntrc_frota_uf.metadata.json
    ↓
    indicador observado em UF
    ↓
    município = PROXY_UF somente quando metodologicamente permitido
SE payload inválido/indisponível:
    NÃO publicar valores de frota
    ↓
    rntrc_frota_uf.metadata.json = NAO_DISPONIVEL
    ↓
    manifest = NAO_DISPONIVEL
    ↓
    decisão registra bloqueio
```

### Estado auditado em 14/08/2026

- recurso histórico Jul/2026: catálogo declarava aproximadamente `10,5 MiB`, porém o arquivo físico retornou HTTP 404/HTML no CI;
- recurso vigente Ago/2026: sujeito a `probe` automatizado; payload abaixo do piso de integridade é registrado como `NAO_DISPONIVEL`, não como zero;
- granularidade permitida: `UF`;
- uso municipal: `PROXY_UF`;
- a camada de frota nunca é estimada a partir do número de transportadores.

---

## 4. CNPJ / ICP Atlas

```text
Receita Federal / Dados Abertos do CNPJ
↓
Empresas*.zip
+ Estabelecimentos*.zip
+ Municipios.zip
+ Cnaes.zip
↓
.cache/market-intelligence/raw/cnpj/<competencia>/
↓
etl_cnpj_atlas.py / pipeline nacional
↓
DuckDB/SQLite/Parquet intermediário
↓
situação cadastral ativa
+ matriz/filial
+ porte
+ capital social quando útil
+ CNAE principal
+ CNAEs secundários quando viável
↓
taxonomia ICP A/B/C versionada
↓
join município Receita → codigo_ibge
↓
fact_icp_municipio
+ lista empresarial de prospecção, quando publicada
↓
ICP Score / TAM / SAM / Product Fit
↓
Interface
```

### Regra de privacidade

O front recebe agregações empresariais e, futuramente, uma lista de contas B2B estritamente necessária. Dados pessoais de sócios não são requisito deste produto.

---

## 5. MDF-e / fluxo logístico real

**Implementado via CIOT** (proxy documentado -- o portal MDF-e da ANTT só expõe dashboard
interativo, sem exportação reproduzível; ver `FONTES.md` seção 3). `sourceKind` no metadata e a
`note` do dataset `mdfe` deixam a distinção CIOT-vs-MDF-e explícita em todo lugar que o dado
aparece; `manifests` (contagem de MDF-e) permanece `null` quando a fonte é CIOT.

```text
ANTT / Movimentação de Cargas (CIOT como proxy documentado; MDF-e oficial quando/se existir)
↓
descoberta automática do CSV mensal (API CKAN) ou exportação oficial informada manualmente
↓
etl_mdfe_atlas.py
↓
normalização de origem / destino / UF
↓
chaves IBGE
↓
fact_mdfe_fluxo
↓
agregações:
  origem municipal
  destino municipal
  corredores
  interestadualidade
  viagens/MDF-e
  toneladas
  TKU quando disponível
  tipo de carga quando disponível
↓
mdfe_municipios.json / corredores.json
↓
Logistics Intensity / Need Atlas / Territory Optimizer
↓
Interface
```

RNTRC mede **estoque logístico**. MDF-e mede **fluxo logístico observado**. Os dois permanecem separados no modelo.

---

## 6. Need Atlas / risco

**Implementado em `etl_sinesp_risco.py`** (`risco_uf.json`). Achado real ao processar o
`bancovde-2026.xlsx` oficial: para os 3 indicadores usados (roubo de carga, roubo de veículo,
furto de veículo), a fonte só publica granularidade **UF** -- 100% das linhas relevantes têm
`municipio = "NÃO INFORMADO"` (crimes contra a pessoa, no mesmo arquivo, têm município real; só
estes 3 indicadores de propriedade não têm). Não é limitação do parser, é a fonte oficial.

```text
MJSP / Sinesp VDE (bancovde-<ano>.xlsx)
↓
descoberta automática do ano vigente + parser stdlib em streaming (iterparse)
↓
roubo de carga
+ roubo de veículo
+ furto de veículo
↓
soma por UF (granularidade municipal não existe na fonte para estes indicadores)
↓
risco_uf.json (geography: PROXY_UF)
↓
etl_municipal_aggregate.py aplica o valor de UF a cada município da UF,
availability: PROXY (nunca OBSERVADO), confiança reduzida
↓
Risk Score (scores.risk) -- calculado
Need Score (componente do Opportunity Score) -- fórmula risco→Need ainda não definida
↓
Opportunity Score -- permanece bloqueado até Need existir
↓
Interface
```

Proxy estadual nunca é rotulado como observação municipal.

---

## 7. Concorrência

```text
Site institucional / página de contato / rede de unidades
+ registro público quando necessário
+ evidência comercial verificável
↓
registro de presença
↓
empresa
+ município/UF
+ tipo de presença
+ produtos/serviços
+ cobertura remota/nacional
+ URL
+ data de verificação
+ confiança
↓
fact_competicao_presenca
↓
status do município:
  NAO_PESQUISADO
  PESQUISA_PARCIAL
  CENSO_COMPLETO
↓
Competitive Pressure
↓
White Space SOMENTE quando CENSO_COMPLETO
↓
Opportunity Score
```

Ausência de registro nunca significa ausência de concorrência.

---

## 8. White Space

```text
Demand Score
+ Need Atlas
+ Logistics Intensity
+ Competitive Pressure
+ confidence
↓
verificação census_status
↓
se != CENSO_COMPLETO:
  White Space = NULL / BLOQUEADO
se == CENSO_COMPLETO:
  transformação versionada
↓
White Space Score
↓
Opportunity Score
```

A fórmula final deve ser acompanhada de análise de sensibilidade e `methodology_version`.

---

## 9. Opportunity Score

**Implementado em `etl_municipal_aggregate.py`** (`municipios_scored.json`, publicado via
`market-intelligence-aggregate.yml`), espelhando `calculateOpportunityScore` de `scoreEngine.ts`.

- **ICP component**: percentil nacional ponderado por tier ICP (peso A=3, B=2, C=1) sobre o
  snapshot CNPJ/ICP. Metodologia validada explicitamente com o usuário, não é uma escolha
  arbitrária da IA.
- **RNTRC component**: percentil nacional da contagem de transportadores ativos, mesma técnica.
- **MDF-e component**: percentil nacional de viagens CIOT (origem + destino) por município,
  quando `mdfe_origens/destinos_municipios.json` existem; caso contrário `NAO_DISPONIVEL`.
- **Risk (`scores.risk`, fora do Opportunity Score)**: percentil nacional (roubo de carga + roubo
  de veículo + furto de veículo) por UF, quando `risco_uf.json` existe; sempre `PROXY` (nunca
  `OBSERVADO`), pois a fonte só publica granularidade UF para estes indicadores.
- **Need / White Space / Territorial Efficiency**: `NAO_DISPONIVEL` até serem definidos (Need é a
  fórmula que converte risco em sinal de oportunidade -- ainda não definida, mesmo com o risco já
  disponível; White Space depende de `CENSO_COMPLETO`; Territorial Efficiency ainda não tem
  fórmula definida).

Como o Opportunity Score exige todos os componentes ponderados presentes, ele permanece
**bloqueado (`null`) para todo município** enquanto Need, White Space e Territorial Efficiency não
forem definidos — isso é esperado e correto, não um bug: o sistema não converte lacuna de dados em
oportunidade.

```text
ICP component
RNTRC component
MDF-e component
Need component
White Space component
Territorial Efficiency component
↓
normalização sobre universo nacional definido
↓
Raw Opportunity Score
↓
Confidence Aggregate
↓
Confidence-adjusted Opportunity Score
↓
explicabilidade por componente
↓
ranking municipal / território
```

Uma recomendação bloqueada por governança não pode ser liberada apenas por multiplicação de confiança.

---

## 10. Territory Optimizer

```text
municipios.json
↓
base candidata × raio [100,150,200,250,300,400]
↓
matriz de cobertura municipal
↓
contas ICP + scores + confiança + logística + custos
↓
territorio_candidato
↓
cenários 1/2/3/5/10/20 vendedores
↓
penalização de sobreposição
↓
territorios.json
↓
Plano Nacional de Expansão
↓
Board View
```

Haversine, quando usado, é apenas distância geodésica. Não é tempo rodoviário.

---

## 11. TAM / SAM / SOM e seller economics

```text
contas ICP observadas
+ elegibilidade de produto/território
↓
TAM
↓
restrições Atlas / portfólio / cobertura
↓
SAM
↓
premissas editáveis:
  penetração
  ticket
  win rate
  margem
  churn
  sales cycle
  ramp-up
↓
SOM / MRR potencial
↓
custos do vendedor
↓
break-even / pipeline / payback / ROI
↓
Plano Nacional de Expansão
```

Premissas comerciais devem guardar versão/origem e nunca ser apresentadas como dado público observado.

---

## 12. Manifest e publicação

`public/tools/atlas-market-intelligence/data/manifest.json` é a porta de entrada da interface.

Ele contém:

```text
schemaVersion
generatedAt
methodologyVersion
decisionReady
decisionBlockers
datasets[]
files{}
```

O front consulta o manifest antes dos derivados. Portanto, um arquivo ausente, uma competência inválida, um recurso upstream inválido ou um dataset parcial aparece como estado de dados e não como tela silenciosamente vazia.

---

## 13. Evidência e auditoria

Cada recomendação final deve conseguir percorrer:

```text
cidade/território
→ score
→ componentes
→ evidences[]
→ dataset metadata
→ hash
→ snapshot oficial
→ URL da fonte
```

Esse percurso é o critério técnico para o botão **Ver evidências**.
