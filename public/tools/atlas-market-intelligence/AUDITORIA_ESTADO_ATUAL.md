# AUDITORIA DO ESTADO ATUAL — Atlas GR National Market & Territory Intelligence System

**Data de corte:** 22/08/2026  
**Baseline auditado:** `main` @ `617b392fa6fe42bbd9bb17eb5df1b201170e24a3`  
**Branch de trabalho:** `codex/atlas-national-territory-finalization-20260822`  
**Regra de governança:** nenhum dado ausente pode ser interpretado como zero; estimativas, proxies e premissas devem permanecer explicitamente rotulados.

## Resumo executivo

O projeto deixou de ser apenas um HTML de triagem e hoje já possui uma feature React/TypeScript nativa, domínio tipado, pipelines de dados públicos, snapshots nacionais por município, Quality Gate específico e materialização de territórios. A evolução é substancial.

Entretanto, a plataforma ainda **não pode emitir uma ordem final de contratação** que responda plenamente à tese de White Space da Atlas GR. O principal bloqueador é o censo competitivo nacional, que continua `PARCIAL`. Há também dois problemas metodológicos relevantes na versão `national-v1.1-core-evidence`:

1. `manifest.json` declara `decisionReady=true` apesar de o próprio `PLANO_EXPANSAO_ATLAS.md` manter a decisão final bloqueada por concorrência incompleta;
2. o Territory Optimizer atual privilegia massa agregada dentro de raios geométricos e pode escolher cidades-base pouco adequadas como hub comercial. O snapshot atual materializa, entre os primeiros candidatos, Guarujá/SP, Miracatu/SP e Ilhabela/SP, sinal de que a qualidade da cidade-base ainda não está suficientemente modelada.

A correção recomendada é separar formalmente **prontidão exploratória** de **prontidão decisória final**, preservar o Core Evidence como priorização investigativa, bloquear a página “Onde contratar agora?” até o gate competitivo/econômico aplicável e endurecer os critérios de cidade-hub.

---

# 1. Arquitetura existente

## 1.1 Aplicação

A Central de Inteligência Comercial é React 19 + TypeScript + Vite, com backend Express e Prisma/Postgres. Market Intelligence está integrado nativamente em:

```text
src/pages/MarketIntelligence.tsx
src/features/market-intelligence/
```

A arquitetura antiga em HTML monolítico foi superada como interface principal, mas seus recursos históricos devem ser preservados para comparação funcional.

## 1.2 Domínio atual

O domínio `MarketIntelligence.ts` já modela:

- disponibilidade: `OBSERVADO`, `ESTIMADO`, `PROXY`, `PREMISSA_EDITAVEL`, `NAO_DISPONIVEL`;
- confiança: `ALTO`, `MEDIO`, `BAIXO`, `BLOQUEADO`;
- concorrência: `NAO_PESQUISADO`, `PESQUISA_PARCIAL`, `CENSO_COMPLETO`;
- população ICP A/B/C;
- RNTRC;
- fluxo logístico;
- risco;
- concorrência;
- scores;
- TAM/SAM/SOM e unit economics;
- evidências e metadados de datasets.

## 1.3 Dados e processamento

Arquitetura atual:

```text
Fonte oficial/primária
→ download/cache fora do bundle
→ ETL Python
→ normalização por código IBGE
→ agregação municipal/corredor
→ JSON compacto/materializado
→ domínio TypeScript
→ React
```

Há Quality Gate específico em `.github/workflows/market-intelligence-ci.yml`, com fixtures Python, typecheck específico, testes unitários, smoke sobre snapshots nacionais, verificação de drift de `territorios.json` e build.

---

# 2. Funcionalidades existentes

Confirmadas no estado atual:

1. feature Market Intelligence nativa em React/TypeScript;
2. Board View territorial;
3. Saúde dos Dados;
4. simulador econômico;
5. cenários comerciais Conservador/Base/Agressivo;
6. ramp-up econômico;
7. consulta empresarial separada do CRM;
8. Account 360 / LDR;
9. Territory Optimizer com raios 100/150/200/250/300/400 km;
10. cenários de 1/2/3/5/10/20 vendedores no domínio do otimizador;
11. penalização de sobreposição;
12. explicabilidade municipal básica;
13. manifest de datasets;
14. snapshots nacionais materializados;
15. testes unitários específicos de Market Intelligence;
16. pipelines de atualização de dados por GitHub Actions.

Ainda incompletos ou insuficientes para a missão final:

- mapa geográfico nacional nativo com clusters/heatmap/layers e radius overlay;
- perfil municipal completo em drawer;
- comparador lado a lado de até quatro territórios;
- censo competitivo nacional suficientemente completo;
- White Space decisório nacional;
- cidade-hub com malha viária/aeroportos/tempo de deslocamento;
- Product Fit Score por produto Atlas comprovado;
- lista Top 50/100/500 por território em escala nacional;
- exportação executiva completa CSV/XLSX/PDF;
- análise de sensibilidade publicada dos pesos;
- plano nacional final com MRR/ROI usando premissas Atlas aprovadas;
- E2E visual comprovado nos breakpoints requeridos nesta rodada.

---

# 3. Datasets localizados

## 3.1 Publicados no bundle otimizado

Em `public/tools/atlas-market-intelligence/data/` existem, entre outros:

```text
manifest.json
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

Há arquivos `.metadata.json` associados às principais camadas.

## 3.2 Cobertura informada pelo manifest

- IBGE: 5.571 municípios no cadastro publicado;
- RNTRC jul/2026: 5.422 municípios com transportadores; 391 linhas ativas sem match IBGE, 0,0435%;
- SENATRAN jul/2026: 5.535 municípios; 37 linhas sem match, 0,6640%;
- CNPJ ago/2026: 5.554 municípios com estabelecimentos ICP; 15.231 de 6.639.808 candidatos sem match, 0,2294%;
- CIOT jul/2026: 676.267 de 690.063 linhas casadas com IBGE, 1,9992% sem match;
- Sinesp jan-jul/2026: 27 UFs, usado como `PROXY_UF` para os indicadores disponíveis;
- concorrência: `PARCIAL`.

## 3.3 Acervo histórico recuperado

Foram recuperadas versões anteriores da experiência HTML e a planilha `Mapa_Oportunidade_Comercial_AtlasGR_v0.1.xlsx`. Os 16 clusters originais permanecem hipóteses de triagem e não devem receber bônus na metodologia nacional.

---

# 4. Fontes

Fontes primárias/estruturantes já utilizadas ou documentadas:

1. IBGE — cadastro/limites municipais;
2. ANTT — RNTRC;
3. Receita Federal — Dados Abertos do CNPJ;
4. ANTT — fluxo de cargas, com CIOT atualmente utilizado como proxy documentado para fluxo origem-destino;
5. SENATRAN — frota municipal por tipo;
6. MJSP/Sinesp — risco, atualmente com granularidade de UF para os indicadores utilizados;
7. fontes empresariais primárias e registros públicos — concorrência.

A camada concorrencial ainda não possui cobertura suficiente para inferir baixa pressão competitiva nacional.

---

# 5. Fórmulas e metodologia vigentes

## 5.1 Core Evidence v1.1

A metodologia materializada usa:

```text
ICP / CNPJ       35%
RNTRC            25%
CIOT / fluxo     20%
Need / risco     20%
White Space       0%
Eficiência        0%
```

O score ajustado multiplica o score-base pela confiança agregada.

Isso é válido como **priorização exploratória**, mas não como resposta final à pergunta de White Space, porque concorrência e eficiência territorial estão fora da função objetivo.

## 5.2 White Space

A regra histórica correta deve permanecer:

```text
CENSO_COMPLETO → pode calcular White Space competitivo
PESQUISA_PARCIAL → White Space indisponível
NAO_PESQUISADO → White Space indisponível
```

Ausência de concorrente encontrado nunca equivale a concorrência zero.

## 5.3 Unit economics

O domínio já calcula custo mensal, contribuição, break-even e oportunidades qualificadas a partir de premissas editáveis. Não deve preencher ticket, margem, win rate, churn, salário ou custos com números inventados.

---

# 6. Bugs e falhas funcionais

## P0 — semântica de `decisionReady`

`manifest.json` declara `decisionReady=true`, enquanto:

- concorrência está `PARCIAL`;
- White Space está indisponível;
- `PLANO_EXPANSAO_ATLAS.md` declara decisão bloqueada;
- economia territorial final ainda contém `null` em SAM/SOM/MRR/break-even no ranking materializado.

Isso cria duas verdades executivas dentro do mesmo produto.

**Correção:** separar `explorationReady` de `finalDecisionReady` e fazer a Board View final respeitar o segundo gate.

## P0 — cidade-base geométrica pode não ser hub comercial

O algoritmo exige apenas quartil superior de ICP da cidade-base e maximiza valor agregado no raio. Isso não modela adequadamente:

- centralidade comercial real;
- peso próprio da cidade no território;
- RNTRC próprio;
- conectividade rodoviária;
- aeroportos;
- custo/tempo de deslocamento.

Resultado observado no snapshot atual: bases como Miracatu e Ilhabela aparecem à frente de hubs comercialmente mais plausíveis. Isso deve ser tratado como viés de modelo.

## P1 — TAM inflado semanticamente

`tamAccounts` territorial atualmente deriva da soma de `icp.total` no raio. É população ICP modelada, não necessariamente total de contas economicamente aderentes com capacidade de compra comprovada. A UI/documentação deve manter essa distinção.

## P1 — “MDF-e” versus CIOT

O manifest já corrige a semântica: a camada atual usa CIOT como proxy documentado de fluxo e mantém `manifests=null`. Qualquer UI antiga que rotule isso como contagem literal de MDF-e deve ser corrigida.

## P1 — performance

`municipios_scored.json` possui aproximadamente 11,6 MB. O caminho materializado de `territorios.json` reduz o custo do Board, mas perfil municipal/mapa nacional exigirão carregamento progressivo e/ou datasets derivados mais enxutos.

## P1 — lint global possui `--fix`

`npm run lint` executa `eslint src --fix`, portanto não é um gate puramente read-only. Para CI/auditoria, o ideal é um script `lint:check` sem mutação.

---

# 7. Inconsistências

1. README afirma que o sistema não publica vencedor enquanto os dados mínimos não sustentarem a decisão; manifest declara `decisionReady=true`.
2. `PLANO_EXPANSAO_ATLAS.md` está bloqueado, mas a Board View pode exibir “Top 5 territórios calculados” sob `decisionReady=true`.
3. White Space está corretamente bloqueado, porém o nome genérico `Opportunity Score` pode ser interpretado como score final quando, na v1.1, é Core Evidence.
4. `mdfe` é o identificador de domínio, mas a observação disponível é CIOT proxy. A interface deve expor a proveniência sem ambiguidade.
5. confiança territorial `ALTO` hoje pode significar alta confiança nos componentes Core, não alta confiança na decisão final. Esses conceitos precisam ser separados.

---

# 8. Dívida técnica

- ausência de modelo explícito de `HubSuitability`;
- ausência de `FinalDecisionGate` separado do Core Evidence;
- mapa nacional ainda não nativo na feature React;
- performance do dataset municipal detalhado pode ser melhorada com resumo/lazy-load;
- exportações incompletas;
- ausência de teste específico que impeça `finalDecisionReady=true` com competição incompleta;
- ausência de teste que rejeite hubs cuja própria materialidade seja residual em relação ao território;
- falta de camada oficial de malha/tempo de viagem no otimizador.

---

# 9. Dados simulados

Não foi encontrada necessidade metodológica de manter números simulados como observação nacional. Os números econômicos sem fonte devem permanecer `PREMISSA_EDITAVEL` e os componentes indisponíveis devem permanecer `null`/`NAO_DISPONIVEL`.

Os 16 clusters históricos e seus scores qualitativos devem permanecer apenas como **hipóteses históricas**.

---

# 10. Dados reais / observados

Atualmente há evidência publicada para:

- geografia municipal IBGE;
- população ICP derivada de CNPJ oficial e taxonomia versionada;
- transportadores RNTRC;
- frota municipal SENATRAN;
- fluxo CIOT origem/destino como proxy de intensidade logística;
- risco Sinesp em nível UF, explicitamente `PROXY_UF`.

Concorrência não é observação nacional completa.

---

# 11. Recursos incompletos

Prioridade de conclusão:

1. separar ranking exploratório e decisão final;
2. corrigir seleção de hub;
3. censo competitivo dos finalistas e depois expansão nacional;
4. White Space final;
5. camada de conectividade/eficiência territorial;
6. sensibilidade de pesos;
7. Product Fit;
8. mapa nacional moderno;
9. perfil municipal e comparador;
10. exportações;
11. QA visual e E2E completo.

---

# 12. Riscos metodológicos

1. **Viés metropolitano:** raios próximos a megamercados podem vencer por capturar massa de cidades vizinhas.
2. **Viés de centro geométrico:** uma cidade pequena pode ser escolhida por posição espacial, não por qualidade operacional como base.
3. **Risco estadual:** todos os municípios da UF recebem o mesmo proxy de risco.
4. **CIOT como proxy de MDF-e:** mede fluxo contratado observado pela fonte disponível, não é contagem literal de MDF-e.
5. **Taxonomia ICP não calibrada:** tiers ainda precisam de validação com ganhos/perdas, ticket e ciclo reais Atlas.
6. **Concorrência parcial:** impede inferência confiável de White Space.
7. **TAM/SAM/SOM:** quantidade de CNPJ não pode virar receita sem elegibilidade e premissas econômicas explícitas.
8. **Séries temporais:** competências diferentes precisam permanecer visíveis e nunca ser misturadas silenciosamente.

---

# 13. Melhorias recomendadas e ordem de execução

## Imediatas

- introduzir `explorationReady` e `finalDecisionReady`;
- bloquear decisão final enquanto não houver censo competitivo suficiente nos finalistas;
- renomear a saída v1.1 para “Core Evidence / Prioridade de Investigação” na UI;
- introduzir Hub Suitability e participação mínima da cidade-base na massa do território;
- atualizar README, metodologia, plano de expansão, lineage e changelog para a semântica única.

## Próxima camada de dados

- concluir censo competitivo dos territórios candidatos com sede/filial/representante/remoto/nacional separados;
- incorporar DNIT/rodovias e aeroportos oficiais para eficiência territorial;
- recalcular White Space e executar sensibilidade dos pesos.

## Gate final

A plataforma somente poderá responder “Vendedor 01 = cidade X” quando, no mínimo:

```text
Core Evidence válido
+ finalistas com CENSO_COMPLETO comparável
+ White Space disponível
+ Hub Suitability aprovado
+ SAM calculável
+ premissas econômicas Atlas preenchidas
+ QA automatizado e visual aprovado
```

Até lá, o produto pode mostrar **candidatos para investigação**, nunca uma recomendação final de contratação.
