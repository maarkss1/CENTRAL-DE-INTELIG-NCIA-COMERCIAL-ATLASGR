# DICIONÁRIO DE DADOS - Atlas Market Intelligence

## Convenções globais

| Campo/estado | Tipo | Definição |
|---|---:|---|
| `codigo_ibge` / `ibgeCode` | string(7) | Chave geográfica canônica do município. |
| `availability` | enum | `OBSERVADO`, `ESTIMADO`, `PROXY`, `PREMISSA_EDITAVEL`, `NAO_DISPONIVEL`. |
| `confidence` | enum/number | Confiança executiva (`ALTO`, `MEDIO`, `BAIXO`, `BLOQUEADO`) e, internamente, fator 0-1. |
| `competence` | string | Período de referência do dado, nunca presumido pela data de download. |
| `downloadedAt` | datetime | Momento em que o snapshot foi obtido. |
| `sha256` | string | Hash do arquivo bruto ou derivado quando aplicável. |
| `evidenceIds` | string[] | Chaves das evidências que sustentam o registro/score. |

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

## RNTRC

| Campo | Tipo | Definição |
|---|---:|---|
| `rntrc.transporters` | integer/null | Transportadores RNTRC ativos agregados no município. |
| `rntrc.etc` | integer/null | Empresas de Transporte Rodoviário de Cargas. |
| `rntrc.tac` | integer/null | Transportadores Autônomos de Cargas. |
| `rntrc.ctc` | integer/null | Cooperativas de Transporte Rodoviário de Cargas. |
| `rntrc.etcEquiparada` | integer/null | ETC equiparada quando o campo estiver disponível/identificável. |
| `rntrc.activeVehicles` | integer/null | Veículos ativos observados em fonte oficial. Não inferido. |
| `rntrc.tractionVehicles` | integer/null | Veículos de tração. |
| `rntrc.implements` | integer/null | Implementos rodoviários. |

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
| `NAO_DISPONIVEL` | Dataset utilizável não foi obtido/publicado. |

## Regra de NULL

`null` significa ausência/não aplicabilidade/bloqueio conforme o campo e metadado. Nunca deve ser convertido em zero apenas para facilitar gráfico, ranking ou cálculo.