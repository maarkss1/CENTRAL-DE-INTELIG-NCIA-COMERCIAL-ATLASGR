# Atlas Market Intelligence v0.5

Site executivo para mapear oportunidade comercial da Atlas GR no Brasil, seguindo o Manual de Identidade Visual da marca.

## Camadas

1. Oportunidade Atlas (triagem inicial)
2. RNTRC municipal
3. ICP / CNPJ municipal
4. Demanda combinada RNTRC + ICP
5. MDF-e / fluxo real de cargas
6. Pressão concorrencial
7. White Space operacional, somente com censo competitivo COMPLETO
8. Need / Risco securitário
9. Atlas Market Opportunity Score v1
10. Simulador de território e ROI do vendedor

## Governança

- Um censo competitivo `PARCIAL` nunca é interpretado como ausência de concorrência.
- White Space e Opportunity Score v1 exigem `censo_status=COMPLETO` para o município.
- Need/Risco prioriza a granularidade municipal do Sinesp; quando ela não existe, o uso de proxy por UF é sinalizado.
- As premissas de custo do vendedor, ticket, margem, penetração e win rate são editáveis e não são tratadas como fatos da Atlas.

## Fórmula Atlas Opportunity Score v1

- ICP / base empresarial: 25%
- RNTRC: 20%
- MDF-e: 15%
- Need / Risco: 15%
- Espaço competitivo: 20%
- Eficiência territorial: 5%

## ETLs incluídos

- `etl_cnpj_atlas.py`: Receita Federal / CNPJ -> ICP municipal
- `etl_mdfe_atlas.py`: normalização de exportações MDF-e
- `etl_risco_sinesp.py`: Sinesp VDE -> risco municipal / proxy UF

## Arquivos de apoio

- `modelo_atlas_icp_municipios.csv`
- `modelo_atlas_mdfe_fluxo.csv`
- `modelo_atlas_concorrencia.csv`
- `modelo_atlas_risco_municipios.csv`
- `concorrencia_seed_verificada.csv`
- `METODOLOGIA_WHITESPACE.md`
- `METODOLOGIA_RISCO_TERRITORIO.md`

## Execução

O site é estático. Abra `index.html` ou publique a pasta em um host estático. O mapa utiliza Leaflet/OpenStreetMap e, portanto, precisa de conexão para os tiles/cartografia.
