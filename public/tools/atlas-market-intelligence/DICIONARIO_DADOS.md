# DICIONÁRIO DE DADOS — Atlas Market Intelligence

**Atualizado em:** 22/08/2026

## Convenções globais

| Campo/estado | Tipo | Definição |
|---|---:|---|
| `ibgeCode` | string(7) | Chave geográfica canônica do município. |
| `availability` | enum | `OBSERVADO`, `ESTIMADO`, `PROXY`, `PREMISSA_EDITAVEL`, `NAO_DISPONIVEL`. |
| `confidence` | enum/number | `ALTO`, `MEDIO`, `BAIXO`, `BLOQUEADO` ou fator interno 0-1. |
| `competence` | string | Período de referência do dado. |
| `downloadedAt` | datetime | Data de download/processamento quando aplicável. |
| `sha256` | string | Hash do bruto/derivado quando aplicável. |
| `evidenceIds` | string[] | Evidências que sustentam registro/score. |
| `geographyLevel` | enum | `MUNICIPIO`, `UF`, `REGIAO`. |
| `municipalUse` | enum/null | Ex.: `PROXY_UF`. |

`null` nunca é convertido em zero apenas para facilitar gráfico ou ranking.

## Geografia

| Campo | Tipo | Definição |
|---|---:|---|
| `name` | string | Município. |
| `uf` | string(2) | UF. |
| `region` | string | Região brasileira. |
| `latitude` | number/null | Centroide municipal documentado. |
| `longitude` | number/null | Centroide municipal documentado. |
| `baseCity` | string | Cidade-base de território candidato. |
| `radiusKm` | enum | 100, 150, 200, 250, 300 ou 400 km. |
| `municipalityCodes` | string[] | Municípios cobertos pelo território. |

## ICP

| Campo | Tipo | Definição |
|---|---:|---|
| `icp.total` | integer/null | Estabelecimentos classificados pela versão da taxonomia ICP. |
| `icp.tierA` | integer/null | Aderência máxima. |
| `icp.tierB` | integer/null | Alta exposição logística. |
| `icp.tierC` | integer/null | Mercado adjacente. |
| `productFit` | object/null | Fit relativo por produto Atlas quando implementado/evidenciado. |

`icp.total` é população ICP modelada, não SAM automaticamente.

## RNTRC

Dataset: `rntrc_municipios.json`.

| Campo | Tipo | Definição |
|---|---:|---|
| `transporters` | integer | Transportadores ativos. |
| `etc` | integer | Empresas de Transporte Rodoviário de Cargas. |
| `tac` | integer | Transportadores Autônomos. |
| `ctc` | integer | Cooperativas. |
| `etcEquiparada` | integer | ETC equiparada quando identificável. |

## Frota municipal — SENATRAN

Dataset: `senatran_frota_municipios.json`.

| Campo | Tipo | Definição |
|---|---:|---|
| `byType` | object | Quantidade observada por tipo de veículo. |
| `cargoFleet` | integer | Derivado Atlas = caminhão + caminhão-trator + reboque + semirreboque. |
| `rntrc.activeVehicles` | integer/null | Na agregação municipal atual recebe `cargoFleet` SENATRAN quando disponível. |
| `rntrc.tractionVehicles` | integer/null | Caminhão + caminhão-trator. |
| `rntrc.implements` | integer/null | Reboque + semirreboque. |

A antiga fonte `RNTRC-Dados de Veículos` permanece apenas como histórico de auditoria para uso municipal.

## Fluxo CIOT / MDF-e

| Campo | Tipo | Definição |
|---|---:|---|
| `mdfe.trips` | integer/null | Operações/viagens derivadas da contagem CIOT no snapshot atual. |
| `mdfe.manifests` | integer/null | MDF-e literal; `null` quando a fonte ativa é CIOT. |
| `mdfe.tonnes` | number/null | Toneladas, apenas se observadas. |
| `mdfe.tku` | number/null | TKU, apenas se observável/calculável com fonte adequada. |
| `mdfe.interstateShare` | number/null | Participação interestadual quando materializada. |
| `originIbgeCode` | string | Origem. |
| `destinationIbgeCode` | string | Destino. |

CIOT é observado como CIOT e usado como **proxy documentado de intensidade de fluxo MDF-e**.

## Risco / Need

| Campo | Tipo | Definição |
|---|---:|---|
| `risk.cargoRobbery` | number/null | Roubo de carga na granularidade da fonte. |
| `risk.vehicleRobbery` | number/null | Roubo de veículo. |
| `risk.vehicleTheft` | number/null | Furto de veículo. |
| `risk.geography` | enum | `MUNICIPIO`, `PROXY_UF`, `NAO_DISPONIVEL`. |
| `scores.risk` | ScoreComponent | Percentil/Need conforme metodologia. |

No snapshot atual, os três indicadores utilizados são `PROXY_UF`.

## Concorrência

| Campo | Tipo | Definição |
|---|---:|---|
| `censusStatus` | enum | `NAO_PESQUISADO`, `PESQUISA_PARCIAL`, `CENSO_COMPLETO`. |
| `verifiedPresences` | integer | Presenças verificadas, não total de mercado se o censo não for completo. |
| `directRiskManagement` | integer | Oferta estruturada comprovada de GR. |
| `tracking` | integer | Rastreamento comprovado. |
| `monitoring` | integer | Monitoramento comprovado. |
| `readyResponse` | integer | Pronta resposta comprovada. |
| `nationalRemoteCoverage` | integer | Cobertura nacional/remota comprovada aplicável. |

### Protocolo de cobertura

Arquivo: `concorrencia_censo_cobertura.csv`.

| Campo | Definição |
|---|---|
| `protocol_version` | Deve ser `competition-census-v1` para liberar censo completo. |
| `local_business_search` | Pesquisa de oferta/local presence concluída. |
| `national_provider_search` | Cobertura de provedores nacionais/remotos concluída. |
| `primary_websites_reviewed` | Sites/fontes primárias verificados. |
| `business_registry_search` | Pesquisa de registros empresariais concluída. |
| `maps_search` | Pesquisa geográfica/local concluída. |
| `negative_evidence_recorded` | Ausências e buscas negativas documentadas. |
| `reviewed_by` | Identificador do revisor/analista, sem exigir dado pessoal desnecessário. |
| `verified_at` | Data/hora da verificação. |
| `confidence` | Deve ser `ALTO` para aceitar `CENSO_COMPLETO`. |
| `census_status` | Status solicitado. O ETL pode rebaixá-lo. |

`etl_concorrencia_censo.py` rebaixa qualquer `CENSO_COMPLETO` sem protocolo integral para `PESQUISA_PARCIAL`.

## ScoreComponent

```ts
{
  value: number | null,
  confidence: number,
  availability: DataAvailability,
  reason?: string
}
```

Scores quantitativos usam 0-100 quando disponíveis.

| Score | Definição |
|---|---|
| `demand` | Demanda/ICP. |
| `risk` | Need/pressão securitária. |
| `competitionPressure` | Pressão competitiva comprovada. |
| `whiteSpace` | Oportunidade residual; `null` sem `CENSO_COMPLETO`. |
| `territorialEfficiency` | Eficiência da cobertura/hub. |
| `rawOpportunity` | Score antes da confiança. |
| `confidenceAdjustedOpportunity` | Score ajustado, sem contornar bloqueios. |

## Território

| Campo | Tipo | Definição |
|---|---:|---|
| `territory.id` | string | Identificador. |
| `baseIbgeCode` | string | Código da cidade-base. |
| `baseCity` | string | Cidade-base candidata. |
| `radiusKm` | number | Raio. |
| `municipalityCount` | integer | Municípios cobertos. |
| `opportunityScore` | number/null | Valor territorial da metodologia ativa. |
| `confidence` | enum | Confiança dos componentes ativos, não substitui o gate final. |
| `overlapAccounts` | integer/null | Contas cobertas por mais de um território. |
| `coverageEfficiency` | number/null | Cobertura única / cobertura bruta. |

A cidade-base Core não é automaticamente `Hub Suitability` aprovado.

## TAM / SAM / SOM

| Campo | Definição |
|---|---|
| `tamAccounts` | Universo economicamente aderente conforme regra vigente. |
| `samAccounts` | Parte atendível pelo portfólio/território/restrições. |
| `somAccounts` | Parte capturável no horizonte/cenário. |
| `potentialMrr` | Cenário de MRR derivado, nunca receita observada. |

## Seller economics

| Campo | Definição |
|---|---|
| `salary` | Salário mensal. |
| `payrollCharges` | Encargos. |
| `benefits` | Benefícios. |
| `vehicle` | Veículo. |
| `fuel` | Combustível. |
| `lodging` | Hospedagem. |
| `tolls` | Pedágio. |
| `commission` | Comissão. |
| `tools` | Ferramentas. |
| `administration` | Custo administrativo. |
| `averageMrrTicket` | Ticket MRR. |
| `grossMarginPct` | Margem. |
| `winRatePct` | Win Rate. |
| `penetrationPct` | Penetração do SAM. |
| `monthlyChurnPct` | Churn. |
| `salesCycleDays` | Ciclo de vendas. |
| `monthlyCost` | Custo mensal total. |
| `breakEvenContracts` | Contratos para cobrir custo recorrente pela contribuição. |
| `breakEvenMrr` | MRR correspondente ao break-even. |
| `requiredQualifiedOpportunities` | Oportunidades necessárias pelo Win Rate. |

Parâmetros econômicos são `PREMISSA_EDITAVEL` ou calibração interna aprovada.

## Saúde dos dados

| Status | Definição |
|---|---|
| `ATUALIZADO` | Snapshot dentro da competência/qualidade exigida. |
| `PARCIAL` | Existe evidência, mas não satisfaz integralmente a decisão. |
| `DESATUALIZADO` | Competência excede tolerância. |
| `NAO_DISPONIVEL` | Dataset utilizável não foi obtido/publicado. |

## Prontidão

`manifest.decisionReady` significa **Final Decision Ready**.

Core Evidence pode existir com `decisionReady=false` para investigação, mas a ordem `Vendedor 01` só pode aparecer após os gates competitivos, territoriais e econômicos finais.
