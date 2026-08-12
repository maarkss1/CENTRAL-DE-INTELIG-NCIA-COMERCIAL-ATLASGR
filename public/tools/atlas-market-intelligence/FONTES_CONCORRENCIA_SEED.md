# Seed competitivo verificado — Atlas Market Intelligence v0.6

**Datas de verificação:** 11/08/2026 (seed original) e 12/08/2026 (censo dirigido às 16 praças da triagem nacional).

Este arquivo documenta as presenças incluídas em `concorrencia_seed_verificada.csv`.

> O seed é propositalmente pequeno e **não representa um censo nacional**. Ele existe para validar o pipeline, a rastreabilidade de fontes e o cálculo relativo de pressão concorrencial. Mesmo com pesquisa pública dirigida (buscas cruzadas por "gerenciadora de risco", "monitoramento de cargas", "rastreamento" + praça, checagem de páginas "onde estamos" dos principais players nacionais e consulta a diretórios de CNPJ), **nenhum município atingiu o padrão de censo local presencial exigido para `censo_status=COMPLETO`**. Por isso todas as linhas abaixo permanecem `PARCIAL` — o motor de White Space e o Opportunity Score v1 continuam bloqueados até uma diligência local mais profunda (visitas, SEST/SENAT, sindicatos patronais, contato direto com transportadoras da praça).

## Rio Verde / GO

### Consultebras
- Categoria: Gerenciadora de Riscos
- Evidência: a própria empresa se apresenta como gerenciadora de risco voltada ao transporte rodoviário de cargas e informa que surgiu em Rio Verde/GO em 2017.
- Fonte: https://www.consultebras.com.br/
- Confiança: alta

## Uberlândia / MG

### Insígnia GR
- Categoria: Gerenciadora de Riscos
- Evidência: a empresa informa ter sido criada em Uberlândia/MG, atuação em gerenciamento de riscos logísticos, central 24/7 e cobertura nacional.
- Fonte: https://www.insigniagr.com/empresa
- Confiança: alta

### Gertran
- Categoria: Gerenciadora de Riscos
- Evidência: a empresa declara atuação em gerenciamento de riscos logísticos, monitoramento e rastreamento; informa escritório comercial em Uberlândia/MG.
- Fonte: https://gertran.com.br/quem-somos/
- Confiança: alta

## Cuiabá / MT

### Rondon GR
- Categoria: Gerenciadora de Riscos
- Evidência: a empresa informa ter sido criada em Rondonópolis em 2004 e estar atualmente sediada em Cuiabá/MT, com postos avançados pelo Brasil, especializada em GR e monitoramento logístico para o agronegócio.
- Fonte: https://rondongr.com/
- Confiança: alta

## Rondonópolis / MT

### Global Rastreamento
- Categoria: Gerenciadora de Riscos
- Evidência: site institucional apresenta equipe de gestão de risco, monitoramento/rastreamento e identifica “Central Rondonópolis-MT”.
- Fonte: https://grglobal.com.br/institucional
- Confiança: alta

### América SAT
- Categoria: Rastreamento
- Evidência: oferece rastreamento de veículos, equipamentos e cargas e informa endereço em Rondonópolis/MT.
- Fonte: https://americasat.com.br/
- Confiança: alta

### MT Trac / Autotrac
- Categoria: Rastreamento / gestão de frotas
- Evidência: concessionário Autotrac sediado em Rondonópolis, com atuação comercial no sul de Mato Grosso e soluções de rastreamento, monitoramento, telemetria e gestão de frotas.
- Fonte: https://mttrac.com.br/sobre
- Confiança: alta

## Chapecó / SC — NOVO (12/08/2026)

### Angel Lira
- Categoria: Gerenciadora de Riscos
- Evidência: sede em Chapecó/SC (R. Mal. Deodoro, 1186D), com unidades adicionais em São Paulo/SP e Canoas/RS; a própria empresa foi premiada como gerenciadora de risco referência no Oeste Catarinense.
- Fonte: https://angellira.com/
- Confiança: alta

### Vetta GR
- Categoria: Gerenciadora de Riscos
- Evidência: página institucional "onde estamos" lista sede em São Paulo/SP (Brooklin) e filial em Chapecó/SC.
- Fonte: http://www.vettagr.com.br/ondeestamos.html
- Confiança: alta

## Cascavel / PR — NOVO (12/08/2026)

### Gerensat
- Categoria: Gerenciadora de Riscos
- Evidência: "Gerensat Monitoramento e Gerenciamento de Riscos de Veículos e Cargas Ltda", CNPJ 08.718.709/0001-39, registrada em Cascavel/PR (base de dados CNPJ pública).
- Fonte: https://www.econodata.com.br/consulta-empresa/08718709000139-gerensat-monitoramento-e-gerenciamento-de-riscos-de-veiculos-e-cargas-ltda
- Confiança: média-alta (fonte é agregador de CNPJ, não site institucional próprio)

## Goiânia / GO — NOVO (12/08/2026)

### Federal Soluções Técnicas em Gestão de Riscos
- Categoria: Gerenciadora de Riscos
- Evidência: empresa (CNPJ 12.492.733/0001-70) sediada em Goiânia/GO, confirmada em múltiplos registros públicos (Econodata, CNPJ.biz, LinkedIn) e site institucional próprio.
- Fonte: https://www.federalst.com.br/
- Confiança: alta

## Praças pesquisadas sem concorrente direto confirmado (12/08/2026)

Busca dirigida (múltiplos termos: "gerenciadora de risco", "monitoramento de cargas", "rastreamento", "escolta armada" + nome da praça; checagem de páginas "onde estamos" dos principais players nacionais: Buonny, Tecnorisk, Mundial Risk, NGO GR, GRIS, Control Risk, Skymark) **não confirmou** GR/monitoramento com sede ou filial local nas seguintes praças da triagem: Luís Eduardo Magalhães/Barreiras (BA), Balsas (MA), Sinop/Sorriso (MT), Feira de Santana (BA), Suape/Cabo/Recife (PE), Dourados (MS), Marabá/Parauapebas (PA), Campo Grande/Três Lagoas (MS), Fortaleza/Maracanaú (CE) e Barcarena/Santarém (PA).

**Isso não é prova de ausência de concorrência** (regra 4 abaixo). É um sinal de baixo risco relativo dentro da metodologia adotada, que deve ser validado com diligência local antes de qualquer decisão final de contratação.

## Regra de utilização

1. A presença é contabilizada somente quando existe fonte verificável.
2. `presenca_peso` representa intensidade de presença, não participação de mercado.
3. Empresas de GR direta recebem maior peso que rastreamento/telemática isolados.
4. Ausência de registro nunca deve ser interpretada como ausência de concorrência.
5. O White Space só é calculado em municípios incluídos em um censo competitivo considerado completo para o escopo da análise.
