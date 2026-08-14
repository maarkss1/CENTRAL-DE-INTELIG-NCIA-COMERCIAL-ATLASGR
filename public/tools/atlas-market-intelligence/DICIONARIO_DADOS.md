# DICIONÁRIO DE DADOS - Atlas Market Intelligence

## Convenções globais

| Campo/estado | Tipo | Definição |
|---|---:|---|
| `codigo_ibge` / `ibgeCode` | string(7) | Chave geográfica canônica do município. |
| `availability` | enum | `OBSERVADO`, `ESTIMADO`, `PROXY`, `PREMISSA_EDITAVEL`, `NAO_DISPONIVEL`. |
| `confidence` | enum/number | Confiança executiva (`ALTO`, `MEDIO`, `BAIXO`, `BLOQUEADO`) e, internamente, fator 0-1. |
| `competence` | string | Período de referência do dado, nunca presumido pela data de download. |
| `downloadedAt` | datetime | Momento em que o snapshot foi obtido. |
| `probedAt` | datetime | Momento em que um recurso foi testado quanto à disponibilidade/integridade, mesmo sem snapshot utilizável. |
| `sha256` | string | Hash do arquivo bruto ou derivado quando aplicável. |
| `evidenceIds` | string[] | Chaves das evidências que sustentam o registro/score. |
| `geographyLevel` | enum | Granularidade observada: `MUNICIPIO`, `UF`, `REGIAO`, conforme dataset. |
| `municipalUse` | enum/null | Regra de uso municipal de dado supramunicipal; `PROXY_UF` quando o valor observado é estadual. |

## Geografia

| Campo | Tipo | Definição |
|---|---:|---|
| `name` | string | Nome oficial/apresentável do município. |
| `uf` | string(2) | Unidade da Federação. |
| `region` | string | Região brasileira. |
| `latitude` | number/null | Latitude documentada da referência municipal. |
| `longitude` | number/null | Longitude documentada da referência municipal. |
| `baseCity` | string | Cidade-base de um território comercial candidato/otimizado. |
| `radiusKm` | enum | Raio analisado: 100, 150, 200, 250, 300 ou 400 km. |
| `municipalityCodes` | string[] | Municípios pertencentes ao território calculado. |

## ICP

| Campo | Tipo | Definição |
|---|---:|---|
| `icp.total` | integer/null | Total de contas/estabelecimentos elegíveis segundo a versão da taxonomia. |
| `icp.tierA` | integer/null | Aderência máxima: transporte, logística, grandes frotas e operações diretamente expostas. |
| `icp.tierB` | integer/null | Indústrias/embarcadores com alta exposição logística. |
| `icp.tierC` | integer/null | Mercados adjacentes com exposição rodoviária relevante. |
| `productFit` | object | Aderência relativa da conta/segmento aos produtos Atlas comprovadamente existentes. |

## RNTRC - transportadores municipais

Dataset derivado: `rntrc_municipios.json`. Competência publicada na ONDA 2: `2026-07`.

| Campo | Tipo | Definição |
|---|---:|---|
| `transporters` | integer | Transportadores RNTRC ativos agregados no município. |
| `etc` | integer | Empresas de Transporte Rodoviário de Cargas. |
| `tac` | integer | Transportadores Autônomos de Cargas. |
| `ctc` | integer | Cooperativas de Transporte Rodoviário de Cargas. |
| `etcEquiparada` | integer | ETC equiparada quando identificável no campo oficial. |
| `ibgeCode` | string(7) | Município canônico resultante do join município + UF contra o IBGE. |

## RNTRC - frota por UF

Dataset derivado quando disponível: `rntrc_frota_uf.json`. Metadata de saúde: `rntrc_frota_uf.metadata.json`.

O dicionário oficial ANTT do recurso de veículos contém `Categoria do Transportador`, `Tipo de Veículo`, `UF do Veículo`, `Categoria`, `Carroceria`, `Ano de Fabricação do Veículo` e `Quantidade`. Não contém município nem RNTRC individual. Por isso estes campos são **observados em UF**:

| Campo | Tipo | Definição |
|---|---:|---|
| `uf` | string(2) | UF do veículo informada na base oficial. |
| `geographyLevel` | literal `UF` | Granularidade factual do recurso público. |
| `municipalUse` | literal `PROXY_UF` | Proíbe apresentação do valor estadual como observação municipal. |
| `fleetTotal` | integer | Soma de `Quantidade` na UF. |
| `tractionVehicles` | integer | Soma de `Quantidade` para `Tipo de Veículo = Tração`. |
| `implements` | integer | Soma de `Quantidade` para `Tipo de Veículo = Implemento`. |
| `otherVehicleType` | integer | Quantidade em tipo não mapeado, mantida separada e nunca redistribuída. |
| `fleetByTransporterCategory.ETC` | integer | Frota associada à categoria ETC. |
| `fleetByTransporterCategory.ETC_EQUIPARADA` | integer | Frota associada à ETC equiparada. |
| `fleetByTransporterCategory.TAC` | integer | Frota associada à categoria TAC. |
| `fleetByTransporterCategory.CTC` | integer | Frota associada à categoria CTC. |
| `averageManufactureYear` | number/null | Ano médio de fabricação ponderado por `Quantidade`, quando disponível. |
| `estimatedAverageVehicleAgeYears` | number/null | Derivado aritmético do ano médio de fabricação; deve ser rotulado como derivado, não campo bruto. |

### Regra de indisponibilidade

Se o recurso oficial vigente não entregar payload nacional válido:

```text
status = NAO_DISPONIVEL
fleetTotal = não publicado
tractionVehicles = não publicado
implements = não publicado
```

Nunca usar número de transportadores como substituto de frota.

## MDF-e / movimentação

| Campo | Tipo | Definição |
|---|---:|---|
| `mdfe.trips` | integer/null | Viagens observadas na competência definida, conforme schema oficial. |
| `mdfe.manifests` | integer/null | Quantidade de MDF-e quando separável de viagens. |
| `mdfe.tonnes` | number/null | Toneladas movimentadas. |
| `mdfe.tku` | number/null | Tonelada-quilômetro útil quando disponibilizada/calculável com fonte adequada. |
| `mdfe.interstateShare` | number/null | Participação de fluxo interestadual, 0-100 ou 0-1 conforme contrato do dataset publicado. |
| `originIbgeCode` | string | Código IBGE da origem. |
| `destinationIbgeCode` | string | Código IBGE do destino. |
| `corridor` | string/id | Par origem-destino ou corredor logístico agregado. |

## Risco / Need Atlas

| Campo | Tipo | Definição |
|---|---:|---|
| `risk.cargoRobbery` | number/null | Roubo de carga observado na granularidade registrada. |
| `risk.vehicleRobbery` | number/null | Roubo de veículo. |
| `risk.vehicleTheft` | number/null | Furto de veículo. |
| `risk.geography` | enum | `MUNICIPIO`, `PROXY_UF`, `NAO_DISPONIVEL`. |
| `riskScore` | 0-100/null | Componente de Need/risco segundo metodologia versionada. |
| `cargoPressure` | 0-100/null | Pressão relativa decorrente do mix/tipo de carga quando observável. |

## Concorrência

| Campo | Tipo | Definição |
|---|---:|---|
| `censusStatus` | enum | `NAO_PESQUISADO`, `PESQUISA_PARCIAL`, `CENSO_COMPLETO`. |
| `verifiedPresences` | integer | Presenças concorrenciais verificadas, não “número total de concorrentes” quando o censo não é completo. |
| `directRiskManagement` | integer | Presenças com oferta comprovada de gerenciamento de risco. |
| `tracking` | integer | Oferta comprovada de rastreamento. |
| `monitoring` | integer | Oferta comprovada de monitoramento. |
| `readyResponse` | integer | Oferta comprovada de pronta resposta. |
| `nationalRemoteCoverage` | integer | Concorrentes com atendimento nacional/remoto comprovado aplicável ao território. |
| `presenceType` | enum | Sede, filial, representante, presença comercial, remoto ou nacional, conforme evidência. |

## Scores

Todos os scores quantitativos utilizam escala 0-100 quando não bloqueados.

| Campo | Definição |
|---|---|
| `demand` | Força de demanda potencial combinando componentes observáveis. |
| `risk` | Need Atlas / pressão securitária. |
| `competitionPressure` | Pressão competitiva comprovada, não ausência de registros. |
| `whiteSpace` | Oportunidade residual após demanda/Need/logística/pressão competitiva. Fica `null` se censo não for completo. |
| `territorialEfficiency` | Eficiência de cobertura da cidade-hub/raio. |
| `rawOpportunity` | Opportunity Score antes do ajuste de confiança. |
| `confidenceAdjustedOpportunity` | Score bruto penalizado pela confiança, sem contornar bloqueios duros. |

Cada componente é representado por:

```ts
{
  value: number | null,
  confidence: number,
  availability: DataAvailability,
  reason?: string
}
```

## Território

| Campo | Tipo | Definição |
|---|---:|---|
| `territory.id` | string | Identificador estável da combinação base/raio/versão. |
| `municipalityCount` | integer | Municípios cobertos. |
| `opportunityScore` | number/null | Valor territorial calculado. |
| `overlapAccounts` | integer/null | Contas cobertas por mais de um vendedor no cenário. |
| `coverageEfficiency` | number/null | Cobertura única em relação à soma bruta de cobertura. |
| `sellerCountScenario` | enum | 1, 2, 3, 5, 10 ou 20 vendedores. |

## TAM / SAM / SOM

| Campo | Definição |
|---|---|
| `tamAccounts` | Contas economicamente aderentes no universo definido. |
| `samAccounts` | Contas do TAM atendíveis pelo portfólio/território/restrições. |
| `somAccounts` | Parcela capturável do SAM no horizonte e cenário. |
| `potentialMrr` | MRR de cenário derivado de SOM e premissas comerciais explícitas. Não é receita observada. |

## Seller economics

| Campo | Definição |
|---|---|
| `salary` | Salário mensal, premissa Atlas. |
| `payrollCharges` | Encargos mensais. |
| `benefits` | Benefícios. |
| `vehicle` | Custo mensal de veículo. |
| `fuel` | Combustível. |
| `lodging` | Hospedagem. |
| `tolls` | Pedágios. |
| `commission` | Comissão/custo variável incluído na simulação. |
| `tools` | Ferramentas. |
| `administration` | Rateio administrativo. |
| `averageMrrTicket` | Ticket MRR médio do cenário. |
| `grossMarginPct` | Margem bruta usada para contribuição. |
| `winRatePct` | Win Rate usado para converter oportunidades em contratos. |
| `penetrationPct` | Penetração esperada do SAM. |
| `monthlyChurnPct` | Churn mensal do cenário. |
| `salesCycleDays` | Ciclo de vendas em dias. |
| `monthlyCost` | Soma dos custos mensais definidos. |
| `breakEvenContracts` | Contratos necessários para cobrir custo recorrente do vendedor pela contribuição. |
| `breakEvenMrr` | MRR correspondente ao break-even de contratos. |
| `requiredQualifiedOpportunities` | Oportunidades qualificadas necessárias dado o Win Rate. |

## Saúde dos dados

| Status | Definição |
|---|---|
| `ATUALIZADO` | Snapshot/derivado com competência e qualidade dentro do critério vigente. |
| `PARCIAL` | Fonte ou cobertura existe, mas não satisfaz integralmente o critério de decisão. |
| `DESATUALIZADO` | Competência excede a tolerância metodológica. |
| `NAO_DISPONIVEL` | Dataset utilizável não foi obtido/publicado; pode ser falha/ausência na fonte upstream e não erro de software. |

## Regra de NULL

`null` significa ausência/não aplicabilidade/bloqueio conforme o campo e metadado. Nunca deve ser convertido em zero apenas para facilitar gráfico, ranking ou cálculo.
