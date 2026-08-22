# Hub Suitability v1 — metodologia auditável

**Data de corte:** 22/08/2026  
**Status:** `PARCIAL / NÃO DECISÓRIO`  
**Objetivo:** qualificar a cidade-base de um território comercial sem confundir massa econômica dentro de um raio geodésico com adequação real para lotação de um vendedor externo.

## 1. Problema que esta camada resolve

O Territory Optimizer Core Evidence consegue localizar áreas com grande massa de ICP/RNTRC/CIOT, mas uma cidade no centro geométrico dessa massa não é automaticamente um bom hub comercial.

Exemplos que motivaram esta camada: cidades como Guarujá/SP, Miracatu/SP e Ilhabela/SP podem aparecer bem posicionadas em um algoritmo de raio por Haversine mesmo sem demonstrar, por esse fato isolado, centralidade urbana, conectividade rodoviária, acesso aeroportuário ou materialidade própria compatíveis com uma base de vendedor.

**Regra:** Haversine mede distância geodésica. Não mede tempo rodoviário, qualidade da malha, centralidade comercial ou custo operacional.

## 2. Componentes v1

Cada componente é materializado separadamente em escala percentil nacional 0–100. O dado bruto e a evidência permanecem rastreáveis.

| Componente | Fonte primária | Direção | Status esperado |
|---|---|---|---|
| `icpMateriality` | Receita/CNPJ + taxonomia ICP Atlas | maior = melhor | observado/modelado na base atual |
| `rntrcMateriality` | ANTT RNTRC | maior = melhor | observado |
| `cargoFleetMateriality` | SENATRAN | maior = melhor | observado |
| `urbanCentrality` | IBGE REGIC | maior hierarquia = melhor | observado após ingestão REGIC |
| `roadAccessibility` | IBGE REGIC rotas + DNIT/SNV | menor distância/conectividade melhor = maior percentil | pendente de ingestão |
| `airportAccessibility` | ANAC, cadastro de aeródromos públicos | menor distância = melhor | pendente de ingestão |

### 2.1 Materialidade própria da cidade-base

A cidade-base deve ter sinais próprios. Uma cidade residual não deve vencer somente por estar dentro de um grande mercado vizinho.

Nesta versão não existe uma mistura escondida de ICP + RNTRC + frota. Os três sinais permanecem independentes para permitir análise de sensibilidade posterior.

### 2.2 Centralidade urbana — IBGE REGIC

A REGIC estrutura a rede urbana por hierarquia dos centros e regiões de influência. A ingestão preserva o rótulo oficial e produz um ordinal técnico apenas para normalização nacional.

Fonte de referência:

`https://www.ibge.gov.br/geociencias/cartas-e-mapas/redes-geograficas/15798-regioes-de-influencia-das-cidades.html`

Bases relevantes:

- `REGIC2018_Municipios_Hierarquia_e_regiao.xlsx`
- `REGIC2018_Rotas_Brasil.xlsx`

Diretório oficial:

`https://geoftp.ibge.gov.br/organizacao_do_territorio/divisao_regional/regioes_de_influencia_das_cidades/Regioes_de_influencia_das_cidades_2018_Resultados_definitivos/base_tabular/`

A idade da REGIC deve ser exibida. Ela é uma evidência estrutural da rede urbana, não um retrato mensal de 2026.

### 2.3 Acesso rodoviário — REGIC + DNIT/SNV

O DNIT informa que o SNV vigente está atualizado até 28/07/2026. A camada georreferenciada deve ser usada para validar presença/conectividade com a malha federal atual, enquanto a base de rotas REGIC fornece referência de distâncias entre cidades.

Fonte oficial SNV:

`https://www.gov.br/dnit/pt-br/assuntos/atlas-e-mapas/pnv-e-snv`

Regra v1:

- não converter distância geodésica em tempo;
- não afirmar “X horas” sem fonte de roteamento/tempo observável;
- manter distância rodoviária e proximidade da malha como campos distintos quando ambos existirem.

### 2.4 Acesso aeroportuário — ANAC

A ANAC mantém o cadastro oficial dos aeródromos civis públicos. Hub Suitability deve considerar apenas aeródromos públicos elegíveis segundo o contrato de ingestão; helipontos/helidecks ou aeródromos privados não entram automaticamente.

Referência:

`https://www.anac.gov.br/acesso-a-informacao/dados-abertos/areas-de-atuacao/aerodromos/lista-de-aerodromos-publicos-v2`

Diretório de dados abertos apontado pela ANAC:

`https://sistemas.anac.gov.br/dadosabertos/Aerodromos/Aer%C3%B3dromos%20P%C3%BAblicos/Lista%20de%20aer%C3%B3dromos%20p%C3%BAblicos/`

## 3. Normalização

A função `materializeHubSuitabilityComponents` usa ranking percentil nacional.

Para métricas em que **maior é melhor**:

```text
ICP próprio
RNTRC próprio
frota de carga própria
```

o percentil cresce com o valor.

Para métricas em que **menor é melhor**:

```text
ordinal de hierarquia REGIC
km rodoviários até centralidade de referência
km até aeródromo público elegível
```

o percentil é invertido.

Empates recebem a mesma posição média. Ausência de dado permanece `NAO_DISPONIVEL`; nunca vira zero.

## 4. Score agregado

**Não existe peso default em Hub Suitability v1.**

O domínio só calcula `overall` quando recebe `HubSuitabilityPolicy` explícita e versionada contendo:

- pesos por componente;
- componentes obrigatórios;
- confiança mínima;
- score mínimo.

Sem política:

```text
HubSuitabilityRecord.overall.value = null
HubSuitabilityRecord.overall.availability = NAO_DISPONIVEL
```

Isso é proposital. A política deve nascer de análise de sensibilidade e decisão Atlas, não do código silenciosamente.

## 5. Gate final

Hub Suitability não substitui White Space nem economics.

Para a plataforma liberar uma ordem final de contratação, continuam obrigatórios simultaneamente:

```text
censo competitivo completo
+ White Space auditável
+ Hub Suitability ATUALIZADO
+ evidência hub-suitability nos territórios finalistas
+ SAM / MRR / break-even autorizados
```

Enquanto qualquer um desses pontos faltar, `decisionReady=false`.

## 6. Próximos passos de dados

1. ingerir REGIC hierarquia por código IBGE;
2. ingerir REGIC rotas/distâncias;
3. ingerir cadastro ANAC de aeródromos públicos;
4. validar conectividade na malha SNV vigente;
5. publicar componentes municipais com hashes/metadados;
6. executar análise de sensibilidade de pesos;
7. somente depois versionar uma `HubSuitabilityPolicy` candidata;
8. rematerializar os territórios e comparar estabilidade do Top 5/Top 10.
