# AUDITORIA DO ESTADO ATUAL - Atlas Market Intelligence / Territory Intelligence

**Data da auditoria:** 2026-08-13  
**Branch auditada:** `main`  
**Commit baseline preservado:** `098aef11401b291fb3fe04ec4c79267a4805652a`  
**Branch de backup:** `backup/market-intelligence-pre-national-20260813`  
**Branch de evolução:** `feat/atlas-national-territory-intelligence`

## Resumo executivo

O projeto já contém um protótipo funcional de inteligência territorial, mas ainda não é um sistema nacional auditável capaz de sustentar uma decisão de contratação. A versão atual combina um HTML monolítico, importadores de CSV executados no navegador, três ETLs Python, um seed concorrencial parcial e uma triagem manual de 16 clusters.

Há boas decisões de governança que devem ser preservadas: ausência de dado concorrencial não é tratada como concorrência zero; White Space e Opportunity Score são bloqueados quando o censo competitivo não é completo; risco estadual é identificado como proxy; e premissas comerciais são editáveis.

O principal problema é que a camada executiva ainda mistura **hipóteses de triagem** com a aparência de ranking quantitativo. Os 16 clusters e respectivos scores estão hardcoded no front, enquanto os datasets reais necessários para revalidá-los nacionalmente ainda não estão versionados como agregações reproduzíveis. O front também referencia arquivos locais que não existem na árvore atual, inclusive `atlas_icp_municipios.csv` e `transportadores_rntrc_07_2026.csv`.

A recomendação arquitetural é migrar o módulo de um iframe contendo HTML monolítico para uma feature React/TypeScript nativa, mantendo Python + DuckDB/SQLite/Parquet para ingestão e agregação offline. O navegador deve receber apenas datasets compactos por município/território.

---

# 1. Arquitetura existente

## 1.1 Aplicação principal

A Central AtlasGR é uma aplicação React 19 + TypeScript + Vite 6, com backend Express, Prisma/Postgres e ampla suíte de dependências já instalada.

O módulo Market Intelligence está integrado em `src/pages/MarketIntelligence.tsx`, mas a integração é apenas uma casca React que renderiza:

```text
iframe -> /tools/atlas-market-intelligence/index.html
```

Portanto, apesar de aparecer como rota nativa na Central, o módulo continua tecnicamente isolado em um documento HTML monolítico.

## 1.2 Módulo atual

Diretório principal:

```text
public/tools/atlas-market-intelligence/
```

Componentes confirmados:

```text
index.html
README.md
METODOLOGIA_WHITESPACE.md
METODOLOGIA_RISCO_TERRITORIO.md
FONTES_CONCORRENCIA_SEED.md
etl_cnpj_atlas.py
etl_mdfe_atlas.py
etl_risco_sinesp.py
modelo_atlas_icp_municipios.csv
modelo_atlas_mdfe_fluxo.csv
modelo_atlas_concorrencia.csv
modelo_atlas_risco_municipios.csv
concorrencia_seed_verificada.csv
atlas-logo-positive.png
atlas-logo-negative.png
atlas-symbol-positive.png
atlas-symbol-negative.png
```

## 1.3 Arquitetura de dados atual

```text
Fonte externa/manual
    -> download/exportação pelo usuário
    -> ETL Python ou importador JS
    -> CSV
    -> FileReader/fetch no navegador
    -> arrays JavaScript em memória
    -> normalização relativa
    -> mapa/ranking/simulador
```

Não existe ainda uma camada formal de dados intermediários em DuckDB/Parquet, catálogo de metadados, hashes, data lineage executável ou pipeline reprodutível de atualização nacional.

---

# 2. Funcionalidades existentes

A v0.5 já possui:

1. mapa Leaflet/OpenStreetMap;
2. filtros por região, UF, classificação e score;
3. ranking dos 16 clusters iniciais;
4. camada RNTRC importável;
5. camada ICP/CNPJ importável;
6. demanda combinada RNTRC + ICP;
7. camada MDF-e importável;
8. concorrência importável;
9. White Space condicionado a censo completo;
10. camada Need/Risco;
11. Opportunity Score v1 condicionado à disponibilidade das camadas;
12. simulador de território por raio;
13. premissas de custo, ticket, margem, penetração e win rate;
14. cálculo preliminar de SAM, SOM, MRR, break-even e pipeline;
15. logos Atlas oficiais já armazenados no módulo;
16. fallback visual caso Leaflet/CDN não carregue.

Recursos requeridos pela missão e ainda ausentes ou incompletos:

- Board View `Onde contratar agora?`;
- Territory Optimizer multi-vendedores com minimização de sobreposição;
- ranking nacional dos 5.570 municípios;
- heatmap/clusterização WebGL/canvas;
- perfil municipal completo em painel lateral;
- comparador de até 4 territórios;
- Plano Nacional de Expansão calculado;
- cenários Conservador/Base/Agressivo;
- ramp-up mensal do vendedor;
- Product Fit Score;
- lista de prospecção por território;
- evidências por recomendação;
- Saúde dos Dados;
- Data Lineage navegável;
- exportações estruturadas CSV/XLSX/PDF executivo;
- testes automatizados do módulo/ETLs;
- metadados de competência e hashes por dataset.

---

# 3. Datasets localizados

## 3.1 Dentro do repositório

### Concorrência

`concorrencia_seed_verificada.csv`

- 11 presenças competitivas verificadas;
- todos os registros com `censo_status=PARCIAL`;
- cobre apenas parte dos clusters iniciais;
- não constitui censo nacional.

### Modelos de schema

`modelo_atlas_icp_municipios.csv`  
`modelo_atlas_mdfe_fluxo.csv`  
`modelo_atlas_concorrencia.csv`  
`modelo_atlas_risco_municipios.csv`

São templates de cabeçalho/exemplo, não bases observadas completas.

### Arquivos referenciados, porém não encontrados no commit baseline

O front tenta carregar automaticamente:

```text
atlas_icp_municipios.csv
transportadores_rntrc_07_2026.csv
```

Ambos retornam ausência na árvore atual. Portanto a experiência auto-load não é reproduzível a partir do repositório.

## 3.2 Acervo anterior recuperado

Foi localizado no acervo do projeto:

`Mapa_Oportunidade_Comercial_AtlasGR_v0.1.xlsx`

A planilha possui quatro abas:

- `Resumo`;
- `Triagem Brasil v0.1`;
- `Metodologia`;
- `Fontes`.

O próprio arquivo declara que os scores são hipóteses de triagem e que a decisão final exige RNTRC, CNPJ, MDF-e e censo competitivo municipal.

## 3.3 Versões solicitadas e não localizadas até o baseline

Não foram localizados na árvore `main` nem na busca do acervo disponível pelos nomes exatos:

```text
atlas-market-intelligence-site-v0.5.zip
atlas-market-intelligence-site-v0.4.zip
atlas-market-intelligence-site-v0.3.zip
index.v0.4.backup.html
index.v0.3.backup.html
```

A ausência desses nomes não prova que nunca tenham existido. O histórico Git do `index.html` será preservado como fonte de versões anteriores durante a migração, e nenhum recurso será removido sem comparação funcional.

---

# 4. Fontes existentes

As fontes já referenciadas no projeto incluem:

- ANTT / RNTRC;
- ANTT / Movimentação de Cargas com MDF-e;
- Receita Federal / Dados Abertos do CNPJ;
- MJSP / Sinesp VDE;
- Atlas GR institucional;
- fontes governamentais estaduais/portuárias usadas na triagem;
- sites institucionais de concorrentes;
- um agregador empresarial em um caso do seed competitivo.

Problema atual: as fontes aparecem distribuídas entre XLSX, Markdown, HTML e CSV, mas ainda não existe um `FONTES.md` canônico com competência, data de acesso, transformação, limitação e dataset derivado.

---

# 5. Fórmulas atuais

## 5.1 Triagem v0.1

A planilha anterior usa notas qualitativas 1-5:

```text
30% Demanda
20% Need Atlas
35% Baixa concorrência
15% Acesso comercial
```

A própria planilha determina que esse score é somente de triagem.

## 5.2 Demanda combinada v0.4

```text
58% ICP/CNPJ + 42% RNTRC
```

## 5.3 White Space provisório v0.4

```text
45% Demanda
25% MDF-e
30% (100 - Pressão Concorrencial)
```

Há inner join entre demanda, MDF-e e concorrência, evitando transformar ausência de censo em zero concorrência.

## 5.4 Need/Risk v0.5

```text
crime_raw = roubo_carga * 5
          + roubo_veiculo * 0,60
          + furto_veiculo * 0,25

Need/Risk = 60% crime
          + 20% MDF-e
          + 20% cargo mix
```

## 5.5 Opportunity Score v1

```text
25% ICP
20% RNTRC
15% MDF-e
15% Need/Risco
20% espaço competitivo
 5% eficiência territorial
```

O score só deveria ser liberado com todas as camadas e `censo_status=COMPLETO`.

## 5.6 Simulador comercial

A implementação atual calcula, de forma simplificada:

```text
SAM contas = soma de contas ICP no raio com pesos simplificados
SOM contas = SAM * penetração
MRR potencial = SOM * ticket MRR
Break-even contratos = custo mensal / (ticket MRR * margem)
Pipeline em oportunidades = break-even contratos / win rate
```

Ainda não modela ramp-up, churn, ciclo de vendas, comissão variável, CAC comercial completo, fluxo de caixa, payback temporal nem ROI 12/24 meses de forma adequada.

---

# 6. Bugs e falhas funcionais identificadas

## P0 - dados referenciados e ausentes

`index.html` tenta auto-carregar `atlas_icp_municipios.csv` e `transportadores_rntrc_07_2026.csv`, mas os arquivos não existem no baseline.

## P0 - arquivo RNTRC bruto no navegador

O front foi desenhado para carregar um RNTRC declarado no próprio código como aproximadamente 150 MB. Isso conflita com a necessidade de fluidez, aumenta memória/tempo de parse e viola a regra de não colocar datasets gigantes no front.

## P0 - ranking inicial hardcoded

Os 16 clusters, scores, notas e narrativas continuam embutidos no JavaScript. Eles são hipóteses de triagem e não podem ocupar o papel de ranking nacional final.

## P1 - iframe dentro da aplicação React

A rota React contém um iframe do HTML estático. Consequências:

- duplicação de design system;
- isolamento de acessibilidade;
- dificuldade de deep link/state;
- testes mais difíceis;
- bundle e estado desconectados;
- impossibilidade de reaproveitar componentes existentes da Central;
- experiência mobile/altura dependente do container pai.

## P1 - renderização cartográfica limitada

O mapa usa `L.circleMarker` e corta datasets não-opportunity em 400 pontos. Isso evita colapso imediato, mas impede exploração nacional real e não implementa clusters/heatmap/WebGL.

## P1 - geocodificação incompleta

Os ETLs atuais não consolidam um cadastro canônico de município com `codigo_ibge`, latitude, longitude, mesorregião/região imediata/intermediária e validação de homônimos.

## P1 - ETL MDF-e apenas normaliza

`etl_mdfe_atlas.py` reconhece aliases e regrava CSV, porém não executa o pipeline necessário de:

- tipagem numérica robusta;
- códigos IBGE;
- deduplicação;
- agregação municipal origem/destino;
- corredores;
- interestadualidade;
- NCM/carga;
- concentração;
- Parquet/DuckDB;
- metadados de competência.

## P1 - ICP v0.1 insuficiente

`etl_cnpj_atlas.py`:

- usa apenas CNAE principal;
- possui taxonomia reduzida;
- não usa CNAEs secundários;
- não combina RNTRC/MDF-e/risco para classificar contas;
- não produz `codigo_ibge` canônico;
- não diferencia explicitamente conta jurídica versus estabelecimento como métrica de negócio;
- usa pesos ainda não calibrados com ganhos/perdas Atlas;
- não gera Product Fit.

## P1 - risco pode perder grafia canônica do município

O ETL de risco normaliza o nome municipal para comparação e depois usa `.title()` para saída. Isso não é substituto de chave IBGE e pode gerar divergências de grafia/acentuação. A união deve ser por código geográfico oficial quando disponível.

## P2 - dependência de CDN em produção

Leaflet CSS/JS e Montserrat são carregados externamente. Há fallback parcial de mapa, mas a disponibilidade e política de CSP precisam ser tratadas no deploy.

---

# 7. Inconsistências

1. `README.md` identifica o site como v0.5, enquanto `FONTES_CONCORRENCIA_SEED.md` se apresenta como v0.6.
2. A Central chama a rota de nativa, mas tecnicamente ela permanece iframe.
3. O seed concorrencial é corretamente marcado como PARCIAL, porém o ranking hardcoded possui classificações como `ATACAR` provenientes da triagem anterior. A semântica visual pode induzir a decisão antes da liberação do score final.
4. O front mistura `score` qualitativo dos 16 hubs com índices normalizados de datasets importados.
5. O simulador usa `icpData` georreferenciado, mas o schema do ETL CNPJ não inclui latitude/longitude. Logo a cobertura por raio depende de enriquecimento externo não formalizado.
6. Não há competência visível e consistente para todas as camadas simultaneamente.
7. O modelo concorrencial registra presença, mas ainda não separa de forma estruturada sede, filial, representante, cobertura remota e atendimento nacional em dimensões independentes.

---

# 8. Dívida técnica

## Arquitetura

- HTML/CSS/JS monolítico;
- lógica de dados, UI, mapa e cálculo no mesmo arquivo;
- iframe na aplicação React;
- ausência de contratos TypeScript para datasets;
- ausência de camada de domínio para scores/territórios.

## Dados

- CSV como principal formato intermediário;
- ausência de catálogo local DuckDB/Parquet;
- ausência de manifest de datasets;
- ausência de hashes e lineage;
- ausência de código IBGE como chave universal;
- falta de fixtures formais para ETLs.

## Qualidade

- sem unit tests específicos dos scores;
- sem testes de propriedade 0-100;
- sem testes de joins municipais;
- sem QA automatizado de NULL/divisão por zero;
- sem E2E específico do módulo;
- sem acessibilidade automatizada específica da feature.

## Operação

- atualização de bases depende de passos manuais;
- ausência de cache/versionamento de snapshots;
- ausência de comando único para atualizar datasets públicos.

---

# 9. Dados simulados / hipotéticos

Devem ser explicitamente classificados como **HIPÓTESE DE TRIAGEM**, não como observação:

- ranking dos 16 clusters;
- notas 1-5 de demanda, Need, concorrência e acesso da v0.1;
- scores hardcoded dos hubs;
- narrativas de classificação `ATACAR`, `VALIDAR`, `MERCADO GRANDE` quando não recalculadas sobre datasets completos;
- pesos atuais de ICP;
- pesos do score final ainda não calibrados;
- parâmetros econômicos do vendedor antes de receber valores reais Atlas.

---

# 10. Dados reais / verificáveis já presentes

1. estrutura e regras de governança do código;
2. logos oficiais armazenados no diretório do módulo;
3. Manual de Identidade Visual Atlas localizado no acervo;
4. seed competitivo com URLs e datas de verificação, sempre PARCIAL;
5. scripts ETL executáveis como ponto de partida;
6. planilha v0.1 com fontes e declaração explícita de limitações;
7. URLs oficiais já documentadas para ANTT, Receita e Sinesp.

Importante: presença de uma URL/fonte no projeto não significa que o snapshot bruto correspondente esteja atualmente disponível ou atualizado.

---

# 11. Recursos incompletos

- RNTRC: ingestão existe no front, mas falta pipeline oficial para estoque + frota agregados e snapshot compacto.
- CNPJ: ETL existe, mas taxonomia e modelo de dados são v0.1.
- MDF-e: normalizador existe, não o ETL analítico completo.
- Risco: ETL existe, falta consolidar chave IBGE, confiança e cobertura geográfica nacional observada.
- Concorrência: seed existe, porém nenhum município atingiu CENSO COMPLETO.
- White Space: metodologia existe, mas por governança não pode ser considerada nacional/confiável enquanto o censo for parcial.
- Opportunity Score: fórmula existe, mas não há sensibilidade/calibração.
- Territory Optimizer: não existe; há apenas simulador de um hub selecionado.
- TAM/SAM/SOM: há aproximação de SAM/SOM, sem metodologia econômica completa.
- ROI vendedor: parcial.
- Plano Nacional de Expansão: inexistente como resultado calculado.

---

# 12. Riscos metodológicos

## 12.1 Viés de tamanho

Sem transformação adequada, grandes metrópoles podem vencer por volume absoluto mesmo com saturação elevada.

## 12.2 Viés de ausência concorrencial

Já mitigado parcialmente pela trava de `censo_status`, mas ainda é o maior risco para um ranking final.

## 12.3 Normalização relativa instável

Índices 0-100 recalculados apenas sobre o arquivo importado mudam se o universo muda. O score nacional deve ser normalizado sobre universo e competência definidos.

## 12.4 Mistura temporal

RNTRC, CNPJ, MDF-e, risco e concorrência podem possuir competências distintas. O sistema precisa exibir e penalizar defasagem/confiança, não misturar silenciosamente.

## 12.5 CNPJ como demanda

Quantidade de CNPJs mede população potencial, não intenção, ticket ou capacidade logística real. Precisa ser combinada com porte, frota, fluxo e evidências de logística.

## 12.6 Crime como Need

Ocorrência policial não equivale a sinistro securitário ou demanda comercial. Proxy UF deve reduzir confiança e nunca aparecer como dado municipal.

## 12.7 Distância euclidiana versus território real

Haversine é adequado para shortlist, mas não captura tempo rodoviário, pedágios, barreiras geográficas ou malha efetiva. O optimizer deve distinguir distância geodésica de custo/tempo rodoviário quando dados oficiais permitirem.

## 12.8 Receita potencial

Contagem de contas não pode ser convertida em MRR sem ticket, penetração, mix de produtos, win rate, ciclo e ramp-up explicitamente editáveis.

---

# 13. Melhorias recomendadas e plano de evolução

## Onda 1 - arquitetura/UX

1. substituir iframe por feature React/TypeScript nativa;
2. separar `domain`, `data`, `scores`, `territory`, `components` e `pages`;
3. aplicar Design System Atlas com logos oficiais e Montserrat;
4. preservar recursos funcionais do HTML durante migração;
5. criar contratos Zod/TypeScript para datasets compactos.

## Onda 2-6 - dados

Criar pipeline reproduzível:

```text
DOWNLOAD
-> raw/ versionado por metadata, não necessariamente por Git
-> DuckDB/Parquet
-> validação
-> agregação IBGE municipal
-> compact datasets
-> manifest/hash
-> front
```

Chave canônica: `codigo_ibge`.

## Onda 7 - scores

Separar e documentar:

```text
Demand Score
Risk Score
Competitive Pressure
White Space Score
Territorial Efficiency
Raw Opportunity Score
Confidence-adjusted Opportunity Score
Product Fit Score
```

Executar análise de sensibilidade dos pesos e impedir ranking final quando a confiança mínima não for atendida.

## Onda 8 - Territory Optimizer

O optimizer deve resolver cenários de 1, 2, 3, 5, 10 e 20 vendedores, testar raios de 100-400 km e penalizar sobreposição. A saída deve conter território, municípios, massa ICP, score, cobertura e confiança.

## Onda 9 - economia

Formalizar TAM/SAM/SOM e unit economics com premissas editáveis, cenários e ramp-up. Nenhuma premissa comercial será rotulada como dado observado até receber fonte Atlas.

## Onda 10 - Plano Nacional

Gerar ordem calculada de contratação, não uma cópia dos 16 clusters iniciais. Os 16 hubs serão reavaliados contra todos os municípios brasileiros.

## Onda 11 - QA

Adicionar lint/typecheck/unit/integration/build/E2E, fixtures de ETL, validação de IBGE/homônimos/NULL/encoding e QA visual real em múltiplos breakpoints.

---

# Decisão de arquitetura decorrente da Onda 0

**O HTML monolítico atingiu o limite de manutenção para a missão nacional.**

A evolução deve ocorrer como módulo React/TypeScript nativo da Central, com processamento pesado fora do browser. O HTML atual será preservado na branch de backup e usado como checklist de paridade durante a migração.

# Estado de conclusão da Onda 0

- [x] baseline identificado;
- [x] branch de backup criada;
- [x] branch de trabalho criada;
- [x] arquitetura atual auditada;
- [x] ETLs existentes revisados;
- [x] metodologias atuais revisadas;
- [x] seed competitivo revisado;
- [x] planilha v0.1 recuperada e comparada conceitualmente;
- [x] Manual de Identidade Visual Atlas localizado e regras críticas confirmadas;
- [x] dados simulados versus reais classificados;
- [x] bugs/dívida/riscos metodológicos registrados;
- [ ] snapshots oficiais nacionais atualizados e processados - inicia na Onda 2;
- [ ] censo nacional competitivo - Onda 6.

A partir deste documento, toda recomendação executiva deverá ser rastreável a dados observados, proxies declarados ou premissas editáveis.