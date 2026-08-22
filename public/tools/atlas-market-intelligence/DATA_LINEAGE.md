# DATA LINEAGE — Atlas GR National Market & Territory Intelligence System

**Atualizado em:** 22/08/2026  
**Objetivo:** permitir que qualquer número exibido pela plataforma seja rastreado até a fonte, competência, transformação e regra metodológica que o produziu.

## Regra geral

```text
Fonte primária/oficial
↓
Arquivo bruto em cache + competência + URL + SHA-256
↓
ETL versionado
↓
Normalização e chave IBGE
↓
Tabela/agregado intermediário
↓
Indicador + disponibilidade + confiança
↓
Score de componente
↓
Core Evidence / White Space
↓
Território
↓
Gate final de decisão
↓
Interface / exportação
```

`NAO_DISPONIVEL` nunca vira zero. `PROXY` nunca vira `OBSERVADO`. `PREMISSA_EDITAVEL` nunca vira fato público.

---

## 1. Geografia municipal

```text
IBGE Localidades
+ IBGE BCIM / limite municipal
↓
cache bruto
↓
etl_municipios_ibge.py
↓
join por geocódigo IBGE
↓
centroide geométrico quando há polígono válido
↓
municipios.json
+ municipios.metadata.json
↓
base canônica para todos os joins municipais
```

### Estado publicado

- cadastro: 5.571 municípios;
- três registros permanecem sem centroide quando o polígono não casa;
- município homônimo nunca é unido somente por nome.

---

## 2. RNTRC — estoque/presença logística

```text
ANTT / RNTRC transportadores
↓
snapshot mensal oficial
↓
.cache/market-intelligence/raw/rntrc/<competencia>/
↓
etl_rntrc_atlas.py
↓
filtro de situação ativa
↓
município + UF → código IBGE
↓
agregação ETC / TAC / CTC / ETC equiparada
↓
rntrc_municipios.json
+ rntrc_municipios.metadata.json
↓
percentil nacional de presença logística
↓
Core Evidence / Territory Optimizer
```

### Estado publicado

- competência: `2026-07`;
- 5.422 municípios com transportadores;
- 391 linhas ativas sem match IBGE, 0,0435%;
- bruto permanece fora do bundle web.

RNTRC mede presença/estoque logístico. Não substitui fluxo de carga.

---

## 3. Frota municipal — SENATRAN

A tentativa histórica de obter frota municipal pelo recurso `RNTRC-Dados de Veículos` foi abandonada porque aquele recurso tem outra granularidade. A camada municipal atual usa a fonte oficial da SENATRAN.

```text
SENATRAN / Frota por Município e Tipo
↓
snapshot mensal oficial
↓
ETL de frota
↓
município + UF → código IBGE
↓
por tipo de veículo
↓
cargoFleet = CAMINHAO + CAMINHAO TRATOR + REBOQUE + SEMI-REBOQUE
↓
senatran_frota_municipios.json
+ metadata
↓
indicador municipal OBSERVADO
```

### Estado publicado

- competência: `2026-07`;
- 5.535 municípios processados;
- 37 linhas sem match IBGE, 0,6640%;
- `cargoFleet` é soma documentada dos quatro tipos acima;
- demais tipos permanecem disponíveis em `byType`.

---

## 4. CNPJ / ICP Atlas

```text
Receita Federal / Dados Abertos do CNPJ
↓
Empresas*.zip
+ Estabelecimentos*.zip
+ Municipios.zip
+ Cnaes.zip
+ Simples quando necessário
↓
.cache/market-intelligence/raw/cnpj/<competencia>/
↓
etl_cnpj_atlas.py
↓
processamento em streaming + SQLite/intermediários
↓
situação ativa
+ matriz/filial
+ porte
+ capital social
+ CNAE principal/secundários
↓
icp_taxonomy.v1.json
↓
município Receita → código IBGE
↓
icp_municipios.json
+ metadata
↓
municipios_scored.json
+ catálogo empresarial particionado quando publicado
```

### Estado publicado

- competência: `2026-08`;
- 5.554 municípios com estabelecimentos ICP;
- 6.639.808 registros candidatos processados;
- 15.231 sem match IBGE, 0,2294%;
- taxonomia `1.0.0` ainda é `REGRA_DE_MODELO_NAO_CALIBRADA` contra ganhos/perdas Atlas.

A taxonomia atual fornece população ICP modelada. Ela não prova capacidade econômica individual nem substitui SAM.

---

## 5. Fluxo logístico — CIOT como proxy documentado de MDF-e

A plataforma desejada pede MDF-e. No snapshot reproduzível publicado, a observação usada é CIOT da ANTT como **proxy de fluxo origem-destino**. Por isso:

```text
manifests = null
sourceKind = CIOT_PROXY
```

Nunca preencher `manifests` com a contagem CIOT como se fosse MDF-e literal.

```text
ANTT / fluxo CIOT
↓
snapshot 2026-07
↓
etl_mdfe_atlas.py / normalização de fluxo
↓
origem + destino + UF
↓
join IBGE
↓
mdfe_origens_municipios.json
+ mdfe_destinos_municipios.json
+ mdfe_corredores.json
+ mdfe.metadata.json
↓
trips por município
↓
percentil nacional de intensidade de fluxo
↓
Core Evidence
```

### Estado publicado

- competência: `2026-07`;
- 676.267 de 690.063 linhas casadas com IBGE;
- unmatched: 1,9992%;
- 318.162 operações interestaduais no snapshot;
- 1.210 grupos NCM observados;
- toneladas/TKU/MDF-e literal permanecem `NAO_DISPONIVEL` quando a fonte não os fornece.

---

## 6. Need / risco

```text
MJSP / Sinesp VDE
↓
bancovde-<ano>.xlsx / recurso oficial
↓
ETL Sinesp
↓
roubo de carga
+ roubo de veículo
+ furto de veículo
↓
agregação por UF
↓
risco_uf.json
↓
percentil de risco por UF
↓
propagação aos municípios com availability=PROXY
confidence reduzida
↓
Need v1 = sinal de risco PROXY_UF
↓
Core Evidence
```

### Estado publicado

- competência: `2026-01 a 2026-07`;
- 27 UFs;
- 1.134 linhas relevantes;
- a fonte utilizada não fornece município real para esses três indicadores no recorte processado;
- a UI deve exibir `PROXY_UF`, nunca “risco municipal observado”.

---

## 7. Concorrência

```text
site institucional / página de unidades / contato
+ registro público quando necessário
+ evidência comercial verificável
↓
empresa + município/UF
+ sede/filial/representante
+ atendimento remoto/nacional
+ GR/rastreamento/monitoramento/pronta resposta/PGR
+ URL
+ data de verificação
+ confiança
↓
concorrencia_seed_verificada.csv / base evolutiva
↓
status de cobertura:
  NAO_PESQUISADO
  PESQUISA_PARCIAL
  CENSO_COMPLETO
↓
Competitive Pressure
↓
White Space SOMENTE se CENSO_COMPLETO
```

### Estado atual

`PESQUISA_PARCIAL` / dataset `PARCIAL`.

Logo:

```text
White Space final = NAO_DISPONIVEL
Decisão final de contratação = BLOQUEADA
```

Uma cidade sem registro de concorrente não recebe concorrência zero.

---

## 8. Scores municipais

### 8.1 Demand/ICP

```text
ICP A×3 + B×2 + C×1
↓
percentil nacional
↓
Demand Score
```

A regra é versão de modelo e deve ser calibrada contra resultados comerciais reais.

### 8.2 RNTRC

```text
transportadores ativos por município
↓
percentil nacional
↓
RNTRC component
```

### 8.3 Fluxo

```text
CIOT origem + destino por município
↓
percentil nacional
↓
Flow component
availability = OBSERVADO quanto ao CIOT
semântica = PROXY de MDF-e/intensidade de fluxo
```

### 8.4 Need

```text
Sinesp por UF
↓
percentil
↓
Need component
availability = PROXY
confidence = reduzida
```

---

## 9. Core Evidence v1.1

O ranking exploratório nacional atualmente materializado usa:

```text
ICP       35%
RNTRC     25%
CIOT      20%
Need      20%
White Space 0%
Eficiência territorial 0%
```

```text
componentes disponíveis
↓
Raw Core Evidence Score
↓
confiança agregada
↓
Confidence-adjusted Core Evidence
↓
buildCoreTerritories()
↓
territorios.json
```

**Interpretação obrigatória:** esse resultado é uma lista de **candidatos para investigação**, não a ordem final de contratação.

---

## 10. White Space final

```text
Demanda
× Need
× Intensidade logística
× Baixa pressão competitiva
↓
gate census_status
↓
se != CENSO_COMPLETO:
  White Space = NULL
se == CENSO_COMPLETO:
  transformação versionada + sensibilidade
↓
White Space Score
```

O White Space não entra como zero no Core Evidence. Ele simplesmente ainda não está autorizado como componente final.

---

## 11. Territory Optimizer

```text
municípios com score válido + coordenadas
↓
cidade-base × raio [100,150,200,250,300,400]
↓
Haversine para cobertura geométrica
↓
contas ICP + Core Evidence + confiança
↓
candidatos
↓
penalização de sobreposição
↓
cenários 1/2/3/5/10/20 vendedores
```

### Limitação aberta

Haversine mede distância geodésica, não tempo de viagem. A qualidade da **cidade-hub** ainda precisa incorporar:

- malha rodoviária DNIT;
- tempos/deslocamentos;
- aeroportos quando relevantes;
- materialidade própria da cidade-base;
- custo operacional estimado.

Por isso `territorios.json` atual não é autorização final de lotação.

---

## 12. TAM / SAM / SOM

```text
população ICP modelada
↓
TAM candidato
↓
restrições de produto + capacidade econômica + cobertura Atlas
↓
SAM
↓
penetração + horizonte
↓
SOM
```

CNPJ × ticket nunca é receita factual.

---

## 13. Seller economics

```text
salário + encargos + benefícios + veículo + combustível + hospedagem
+ pedágio + comissão + ferramentas + administrativo
↓
custo mensal

Ticket MRR × margem
↓
contribuição por contrato

custo / contribuição
↓
break-even contratos

break-even / win rate
↓
oportunidades necessárias
↓
pipeline / payback / ROI / ramp-up
```

As entradas comerciais são `PREMISSA_EDITAVEL` ou calibração interna explicitamente aprovada.

---

## 14. Gate final de contratação

`manifest.json → decisionReady` representa **decisão final**, não mera capacidade de ranquear candidatos.

O loader revalida em runtime:

```text
CIOT origem/destino presente
+ territórios presentes
+ concorrência nacional/finalistas adequada
+ CENSO_COMPLETO nos finalistas
+ SAM disponível
+ MRR potencial disponível
+ break-even disponível
↓
decisionReady=true
```

Se qualquer condição obrigatória falhar:

```text
decisionReady=false
+ decisionBlockers[]
```

Esse gate impede que um snapshot antigo ou parcial libere “Vendedor 01” por acidente.

---

## 15. Manifest e interface

```text
data/manifest.json
↓
loadMarketManifest()
↓
territorios.json materializado quando presente
+ fluxo CIOT runtime para fail-closed
↓
validateRuntimeReadiness()
↓
Board View
```

A aba Territórios pode continuar mostrando candidatos Core Evidence mesmo quando a Board final está bloqueada.

---

## 16. Evidência

A trilha desejada para qualquer recomendação final é:

```text
território
→ município
→ score/componente
→ evidenceIds
→ metadata
→ SHA-256
→ snapshot
→ URL oficial
→ competência
```

Esse percurso é o contrato do recurso **Ver evidências**.
