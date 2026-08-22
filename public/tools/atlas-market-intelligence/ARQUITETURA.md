# ARQUITETURA — Atlas GR National Market & Territory Intelligence System

**Atualizado em:** 22/08/2026

## Princípio

O navegador é camada de decisão e exploração, não motor de ingestão de bases públicas gigantes.

```text
FONTES OFICIAIS / PRIMÁRIAS
↓
DOWNLOAD + COMPETÊNCIA + HASH
↓
RAW CACHE fora do bundle
↓
ETL PYTHON
↓
CHAVE IBGE + VALIDADORES
↓
SQLITE / DUCKDB / PARQUET quando justificado
↓
AGREGAÇÕES MUNICIPAIS / CORREDORES / CONTAS / CONCORRÊNCIA
↓
SCORES + CONFIANÇA + EVIDÊNCIAS
↓
DATASETS COMPACTOS / VIEWS MATERIALIZADAS
↓
REACT + TYPESCRIPT
↓
BOARD / TERRITÓRIOS / MAPA / ECONOMICS / EMPRESAS
```

## 1. Fontes ativas

- IBGE Localidades + BCIM para geografia;
- ANTT RNTRC para presença de transportadores;
- SENATRAN para frota municipal por tipo;
- Receita Federal para CNPJ/ICP;
- ANTT CIOT como proxy reproduzível de intensidade de fluxo MDF-e;
- MJSP/Sinesp para risco, atualmente `PROXY_UF`;
- fontes empresariais primárias e registros públicos para concorrência;
- DNIT/aeroportos oficiais previstos para Hub Suitability.

O recurso histórico `RNTRC-Dados de Veículos` não é a fonte municipal ativa de frota.

## 2. Raw cache

```text
.cache/market-intelligence/raw/<dataset>/<competencia>/
```

O cache bruto é ignorado pelo Git e nunca publicado em `public/`.

Cada snapshot deve registrar:

```text
source
source_url
resource_id quando existir
competence
downloaded_at
last_modified quando existir
raw_bytes
sha256
license quando aplicável
```

## 3. Geografia canônica

```text
ibgeCode
```

é a chave municipal final.

Nome + UF serve como lookup de contingência quando a fonte não oferece código. Municípios homônimos nunca são unidos apenas pelo nome.

## 4. Camada analítica

Grãos principais:

```text
município
corredor origem-destino
território
conta ICP
competidor/presença
cobertura de censo
```

Estruturas conceituais:

```text
dim_municipio
fact_rntrc_municipio
fact_frota_municipio
fact_icp_municipio
fact_fluxo_municipio
fact_fluxo_corredor
fact_risco_uf
fact_competicao_presenca
fact_competicao_cobertura
score_municipio
territorio_candidato
territorio_otimizado
```

## 5. Pipeline competitivo

```text
concorrencia_seed_verificada.csv
+ concorrencia_censo_cobertura.csv
+ municipios.json
↓
etl_concorrencia_censo.py
↓
validação do protocolo competition-census-v1
↓
competicao_municipios.json
+ metadata
↓
CENSO_COMPLETO ou rebaixamento automático
↓
Competitive Pressure
↓
White Space
```

Uma flag manual isolada não pode liberar `CENSO_COMPLETO`.

## 6. Scoring

Scores persistidos carregam:

```text
value
confidence
availability
methodologyVersion/evidenceIds quando aplicável
```

Existem duas camadas decisórias distintas:

```text
Core Evidence → priorização exploratória
Final Opportunity → contratação
```

White Space é `null` enquanto concorrência não satisfizer o gate.

## 7. Datasets do frontend

Entrada:

```text
public/tools/atlas-market-intelligence/data/manifest.json
```

Derivados atuais:

```text
municipios.json
municipios_scored.json
icp_municipios.json
rntrc_municipios.json
senatran_frota_municipios.json
mdfe_origens_municipios.json
mdfe_destinos_municipios.json
mdfe_corredores.json
risco_uf.json
territorios.json
```

Derivados planejados/condicionais:

```text
competicao_municipios.json
competidores.json
evidencias.json
mapa_municipios_resumo.json ou equivalente
```

O manifest é carregado antes dos derivados e declara saúde, competência e bloqueios.

## 8. Frontend

Feature nativa:

```text
src/pages/MarketIntelligence.tsx
src/features/market-intelligence/
  domain/
  components/
  server/
  marketIntelligence.data.ts
  marketIntelligence.api.ts
```

O HTML histórico permanece como baseline, não arquitetura-alvo.

### Regra de carregamento

- `territorios.json` materializado atende a Board sem baixar o dataset municipal de ~11 MB;
- perfil municipal/mapa deve carregar dados sob demanda ou usar resumo compacto;
- filtros e economics podem ser recalculados no cliente porque operam sobre dados derivados/premissas pequenas;
- bruto nunca é processado no browser.

## 9. Mapa

Requisitos:

- 5.570+ municípios sem milhares de DOM markers;
- cluster/heatmap via Canvas/WebGL ou estratégia equivalente;
- GeoJSON simplificado por nível de zoom;
- carregamento progressivo;
- layers: Opportunity, White Space, ICP, RNTRC, frota, fluxo, Need, concorrência, territórios;
- radius overlay;
- seleção municipal e territorial;
- filtros serializáveis em URL quando útil.

Nenhuma biblioteca cartográfica deve ser adicionada apenas por aparência. A escolha precisa justificar bundle e manutenção.

## 10. Territory Optimizer

Entrada:

```text
municípios elegíveis
scores ajustados
ICP
RNTRC
frota
fluxo
coordenadas
raios [100,150,200,250,300,400]
headcount [1,2,3,5,10,20]
```

Etapas atuais:

1. gerar cidade-base × raio;
2. cobertura geodésica por Haversine/grid;
3. agregar valor territorial;
4. penalizar baixa confiança;
5. selecionar cobertura incremental com overlap reduzido.

### Evolução obrigatória antes da decisão final

```text
Hub Suitability =
materialidade da base
+ conectividade rodoviária
+ tempo de deslocamento
+ acesso aeroportuário quando relevante
+ custo operacional
+ centralidade/satélites
```

Haversine não é tempo rodoviário.

## 11. TAM / SAM / SOM e economics

TAM parte da população aderente, mas SAM exige regras reais de atendibilidade e Product Fit. SOM exige horizonte/penetração.

Seller economics pode ser calculado no navegador a partir de `PREMISSA_EDITAVEL`, incluindo custo mensal, break-even, pipeline, payback e ROI.

Sem premissa válida, saída = `null`/pendente.

## 12. Performance

Princípios:

- agregações pré-calculadas;
- views materializadas para rankings;
- lazy loading;
- cache HTTP/local quando adequado;
- evitar recalcular percentis nacionais no cliente;
- evitar JSON bruto gigantesco no caminho crítico;
- particionar catálogo empresarial por território/consulta.

## 13. Segurança e privacidade

- zero secrets/tokens no frontend/datasets;
- bruto fora de `public/`;
- sem dados pessoais de sócios como requisito;
- catálogo empresarial separado do CRM operacional;
- evidências públicas e hashes permitem auditoria sem republicar bases brutas.

## 14. QA

A arquitetura é protegida por:

- testes Python de ETL;
- testes unitários TypeScript;
- typecheck específico;
- smoke sobre snapshots nacionais;
- drift check de `territorios.json`;
- CI global com lint/typecheck/unit/integration/E2E/build;
- Playwright da rota real.

Validação visual só pode ser declarada depois de execução real no navegador.

## 15. Gate final

`manifest.decisionReady=true` somente quando a plataforma possui evidência suficiente para responder as dez perguntas executivas da missão, incluindo concorrência, White Space, Hub Suitability e economics.

Enquanto isso:

```text
Core Evidence = utilizável para investigação
Vendedor 01 = BLOQUEADO
```
