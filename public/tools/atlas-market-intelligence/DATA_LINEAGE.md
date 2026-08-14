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
- latitude/longitude devem vir de fonte documentada e não de inferência textual.

---

## 2. RNTRC - transportadores

```text
ANTT CKAN / pacote RNTRC
↓
descoberta automática do recurso mensal mais recente
↓
transportadores_rntrc_MM_AAAA.csv
↓
.cache/market-intelligence/raw/rntrc/<competencia>/
↓
etl_rntrc_atlas.py
↓
filtro de situação ativa quando disponível
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

```text
ANTT / perfil do TRC / recurso oficial de veículos
↓
validação de integridade do recurso
↓
SE payload válido:
    snapshot bruto
    ↓
    join transportador → município
    ↓
    tração / implementos / frota ativa
    ↓
    fact_frota_municipio
SE payload vazio/inválido:
    status = NÃO DISPONÍVEL ou PARCIAL
    ↓
    decisão registra bloqueio
```

A camada de frota não será estimada a partir do número de transportadores.

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

```text
ANTT / Movimentação de Cargas baseada em MDF-e
↓
snapshot/exportação oficial com competência
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

```text
MJSP / Sinesp VDE
+ fontes oficiais complementares quando justificadas
↓
snapshot por competência
↓
etl_risco_sinesp.py
↓
roubo de carga
+ roubo de veículo
+ furto de veículo
↓
join geográfico
↓
se municipal: OBSERVADO MUNICÍPIO
se apenas estadual: PROXY_UF
↓
combinação com exposição MDF-e / carga, conforme metodologia versionada
↓
Risk / Need Score + confidence
↓
Opportunity Score
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

O front consulta o manifest antes dos derivados. Portanto, um arquivo ausente, uma competência inválida ou um dataset parcial aparece como estado de dados e não como tela silenciosamente vazia.

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