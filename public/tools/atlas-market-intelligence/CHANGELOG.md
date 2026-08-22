# CHANGELOG — Atlas Market Intelligence

Categorias: `CORRIGIDO`, `MELHORADO`, `NOVO`, `REMOVIDO`, `DADOS ATUALIZADOS`, `METODOLOGIA ALTERADA`.

## 22/08/2026 — National Market & Territory Intelligence

### CORRIGIDO

- `manifest.decisionReady` voltou a representar **decisão final de contratação**, e não mera capacidade de gerar ranking Core Evidence;
- loader de runtime passa a bloquear decisão final se concorrência não estiver finalizada, se finalistas não tiverem `CENSO_COMPLETO`, ou se SAM/MRR/break-even ainda estiverem indisponíveis;
- E2E foi alinhado ao comportamento fail-closed: Board bloqueada, candidatos Core Evidence preservados na visão de Territórios;
- `DATA_LINEAGE.md`, `README.md` e `PLANO_EXPANSAO_ATLAS.md` foram reconciliados com os snapshots realmente publicados em 22/08;
- documentação deixou de tratar a antiga tentativa de frota municipal via `RNTRC-Dados de Veículos` como fonte ativa;
- CIOT permanece explicitamente identificado como proxy reproduzível de fluxo MDF-e, sem preencher `manifests` como se fosse contagem literal de MDF-e.

### MELHORADO

- auditoria de estado atual reescrita sobre a `main` vigente, incluindo arquitetura React/TypeScript, datasets, fórmulas, inconsistências, dívida técnica e riscos metodológicos;
- separação formal entre **Exploration Ready** e **Final Decision Ready**;
- documentação explicita o viés de cidade-base do otimizador atual e a necessidade de `Hub Suitability` antes da recomendação final de residência/lotação;
- adicionados comandos read-only de QA: `lint:check`, `typecheck`, `typecheck:market-intelligence` e `test:market-intelligence`;
- governança reforçada para não converter `NAO_DISPONIVEL`, `PROXY` ou `PREMISSA_EDITAVEL` em fato observado;
- compatibilidade do pipeline CNPJ com identificadores alfanuméricos passou a ser protegida por teste regressivo, evitando coerção silenciosa para dígitos;
- QA E2E da rota real passa a validar overflow e responsividade em 1920×1080, 1440×900, 1366×768, tablet e mobile.

### NOVO

- teste unitário `finalDecisionReadiness.test.ts` protege o gate final contra regressões;
- bloqueadores econômicos explícitos para SAM, MRR potencial e break-even dos finalistas;
- requisito formal de `HubSuitability` no plano final, incluindo materialidade da base, conectividade, tempo de deslocamento, aeroportos quando relevantes e custo operacional;
- `etl_concorrencia_censo.py`, que materializa cobertura competitiva e rebaixa automaticamente falso `CENSO_COMPLETO`;
- `concorrencia_censo_cobertura.csv`, protocolo versionado `competition-census-v1` para documentar pesquisa local, provedores nacionais, fontes primárias, registros empresariais, mapas, evidência negativa, revisão, data e confiança;
- testes Python do censo competitivo para protocolo incompleto, protocolo integral e presença concorrencial isolada;
- testes de compatibilidade CNPJ alfanumérico para segmento básico e ordem do estabelecimento;
- screenshots de QA responsivo anexadas ao relatório Playwright em cada viewport obrigatório.

### DADOS ATUALIZADOS / CONFIRMADOS

- **IBGE:** cadastro nacional publicado com 5.571 municípios e centroides derivados da BCIM quando disponíveis;
- **RNTRC jul/2026:** 1.158.159 linhas processadas, 899.249 transportadores ativos, 5.422 municípios com presença RNTRC e 391 linhas ativas sem match IBGE, 0,0435%;
- **SENATRAN frota jul/2026:** 5.535 municípios, 37 linhas sem match, 0,6640%; `cargoFleet` = caminhão + caminhão-trator + reboque + semirreboque;
- **CNPJ/ICP ago/2026:** 5.554 municípios com estabelecimentos ICP, 6.639.808 registros candidatos processados e 15.231 sem match IBGE, 0,2294%;
- **CNPJ alfanumérico:** a Receita Federal emitiu o primeiro CNPJ no novo formato em 31/07/2026; o pipeline Atlas preserva caracteres alfanuméricos e agora possui regressão automatizada;
- **CIOT jul/2026:** 676.267 de 690.063 linhas casadas com IBGE, 1,9992% sem match, 318.162 operações interestaduais e 1.210 grupos NCM observados;
- **Sinesp jan-jul/2026:** 27 UFs, usado como `PROXY_UF` para roubo de carga, roubo de veículo e furto de veículo no recorte processado;
- **Concorrência:** permanece `PARCIAL`; nenhum White Space final é liberado.

### METODOLOGIA ALTERADA

- Core Evidence v1.1 passa a ser definido formalmente como **ranking exploratório**;
- pesos Core permanecem ICP 35%, RNTRC 25%, CIOT 20% e Need 20%; White Space e eficiência territorial permanecem indisponíveis, não iguais a zero;
- `decisionReady=true` passa a exigir o gate final, incluindo concorrência suficiente dos finalistas e economics necessários;
- `CENSO_COMPLETO` passa a exigir protocolo de cobertura auditável; encontrar concorrentes não é suficiente para provar completude;
- cidades como Guarujá, Miracatu e Ilhabela no topo do snapshot Core são tratadas como evidência de viés geométrico a corrigir, não como recomendação de lotação;
- os 16 clusters históricos continuam `HIPOTESES_DE_TRIAGEM` sem bônus metodológico;
- TAM, SAM, SOM e MRR continuam exigindo elegibilidade e premissas comerciais explícitas;
- risco estadual continua `PROXY_UF`;
- CIOT continua proxy documentado de intensidade de fluxo, não MDF-e literal.

---

## Histórico consolidado anterior

### CORRIGIDO

- preservação de baseline histórico antes da migração;
- remoção do iframe como implementação principal de Market Intelligence;
- remoção da tentativa de carregar RNTRC bruto no navegador;
- normalização municipal por código IBGE;
- workflows e pipelines de dados passaram a registrar competência/hash e falhar de forma explícita em recursos inválidos.

### NOVO

- feature React/TypeScript `src/features/market-intelligence/`;
- Board View;
- Saúde dos Dados;
- simulador econômico;
- consulta empresarial separada do CRM;
- Territory Optimizer com raios 100/150/200/250/300/400 km e cenários 1/2/3/5/10/20 vendedores;
- ETLs nacionais de geografia, RNTRC, CNPJ/ICP, frota SENATRAN, fluxo e risco;
- documentação obrigatória de arquitetura, metodologia, lineage, fontes e plano de expansão.

### v0.5

- camada Need/Risco;
- Opportunity Score condicionado a dados;
- simulador por raio;
- importadores CSV no navegador.

### v0.4

- demanda combinada RNTRC + ICP;
- MDF-e/fluxo;
- concorrência;
- White Space preliminar.

### v0.1

- triagem qualitativa de 16 clusters brasileiros;
- planilha explicitamente inadequada para decisão final de contratação.
