# Atlas Market Intelligence — Metodologia national-v1.1-core-evidence

## Objetivo

Responder de forma reproduzível à pergunta **"onde a Atlas GR deve contratar o próximo vendedor?"** mesmo quando a pesquisa competitiva nacional ainda não atingiu o padrão de `CENSO_COMPLETO`, sem transformar ausência de evidência em ausência de concorrência.

A versão anterior travava todo o ranking porque `White Space` e `territorialEfficiency` eram componentes obrigatórios do Opportunity Score. Isso fazia dados nacionais já disponíveis e rastreáveis (CNPJ/ICP, RNTRC, CIOT e Sinesp) não produzirem nenhuma recomendação operacional.

A v1.1 separa duas perguntas que não devem ser confundidas:

1. **Prioridade territorial baseada em evidência nacional disponível:** pode ser calculada agora.
2. **White Space competitivo / saturação local:** continua indisponível onde o censo é parcial.

## Core Evidence Score

O score-base usa apenas componentes com cobertura nacional reproduzível:

| Componente | Peso | Fonte | Geografia | Confiança de origem |
| --- | ---: | --- | --- | --- |
| ICP / demanda | 35% | Receita Federal CNPJ + taxonomia ICP Atlas | Município | 0,90 |
| Presença logística | 25% | ANTT RNTRC | Município | 0,90 |
| Fluxo logístico | 20% | ANTT CIOT, proxy documentado de fluxo MDF-e | Origem + destino municipal | 0,85 |
| Need / risco | 20% | MJSP Sinesp VDE | PROXY_UF | 0,50 |
| White Space | 0% | Censo competitivo | Fora do Core enquanto parcial | não aplicável |
| Eficiência territorial | 0% | Malha/tempo de deslocamento | Fora do Core até modelo aprovado | não aplicável |

Os pesos ativos somam 100%. Componentes de peso zero **não recebem valor zero**: permanecem `NAO_DISPONIVEL` nas estruturas e telas correspondentes.

## Need v1

`Need` não é uma nova observação. Na v1.1 ele é definido como o **percentil de risco Sinesp já calculado por UF**, carregando a mesma confiança `0,50` e disponibilidade `PROXY`.

Isso significa:

- não existe alegação de risco municipal observado;
- todos os municípios de uma mesma UF recebem o mesmo sinal de risco enquanto a fonte oficial não oferecer granularidade mais fina;
- o ajuste por confiança reduz automaticamente o peso efetivo dessa dimensão no score final.

## Score bruto e score ajustado por confiança

O cálculo reutiliza `calculateOpportunityScore`.

- **Raw/Core Score:** média ponderada dos quatro componentes ativos.
- **Confidence Adjusted Score:** Core Score multiplicado pela confiança agregada geométrica.

Dessa forma, uma praça não sobe no ranking apenas porque um proxy incerto tem valor alto.

## Concorrência

A regra anterior de White Space continua válida: `calculateWhiteSpace` só libera o componente quando o município possui `CENSO_COMPLETO`.

Enquanto a pesquisa estiver `PESQUISA_PARCIAL` ou `NAO_PESQUISADO`:

- `competitionPressure` permanece não disponível;
- `whiteSpace` permanece não disponível;
- ausência de concorrente encontrado nunca vira pressão competitiva igual a zero;
- o Core Evidence Score continua calculável porque estes componentes têm peso zero nesta versão.

Quando o censo competitivo evoluir, uma metodologia posterior poderá recolocar White Space no score final sem alterar os dados históricos da v1.1.

## Territórios

O ranking territorial é calculado a partir dos municípios com Core Evidence Score válido usando o `territoryOptimizer` existente.

O otimizador técnico continua capaz de construir raios de **100, 150, 200, 250, 300 e 400 km** para exploração. A camada decisória, porém, aplica guardrails adicionais porque `territorialEfficiency` ainda não possui malha viária/tempo de deslocamento validado:

- **raio automático máximo de 200 km** para a recomendação de lotação do próximo vendedor;
- a **cidade-base precisa estar no quartil superior nacional de contas ICP**, recalculado a cada snapshot, evitando que uma cidade pequena vença apenas por ocupar o centro geométrico de um círculo enorme;
- para cada cidade-base é mantido o raio elegível com maior Opportunity Score, priorizando confiança e, em empate, o menor raio;
- candidatos com mais de **65% de sobreposição municipal** em relação a um candidato melhor ranqueado são suprimidos, para que o Top 5 represente alternativas territoriais reais em vez de cinco pinos vizinhos sobre a mesma praça;
- distância geométrica continua sendo Haversine;
- contas ICP continuam sendo a massa comercial usada na agregação;
- nenhuma coordenada é inferida quando o município não possui centroide válido.

Esses guardrails são deliberadamente conservadores. Raios acima de 200 km voltam a ser elegíveis para decisão automática somente quando houver uma camada aprovada de tempo de deslocamento/malha viária ou outra evidência operacional equivalente.

## Visão materializada e caminho rápido da UI

O Quality Gate executa o ranking contra os snapshots nacionais e materializa `public/tools/atlas-market-intelligence/data/territorios.json`.

Quando esse arquivo está publicado no manifest:

- o frontend carrega diretamente os territórios materializados;
- `municipios_scored.json` deixa de ser baixado e recalculado no caminho crítico do Board;
- a tela abre com uma visão territorial já validada pelo CI;
- o cálculo client-side permanece apenas como fallback de compatibilidade para publicações antigas sem `territorios.json`.

A materialização é uma otimização de entrega, não um atalho metodológico: o arquivo só é aceito depois de passar pelos mesmos guardrails e pelo smoke test com snapshots reais.

## Validação fail-closed em runtime

O manifest publicado pode declarar `decisionReady=true`, mas o frontend revalida a prontidão a cada carregamento.

A decisão volta automaticamente a `false` quando:

- o snapshot CIOT de origem ou de destino obrigatório não está disponível em runtime;
- no fallback sem `territorios.json`, menos de 1.000 municípios possuem Core Evidence Score válido; ou
- nenhum território elegível está disponível.

Assim, um ranking materializado não mantém a interface artificialmente verde se uma evidência Core obrigatória desaparecer. No caminho materializado, a cobertura municipal pesada é garantida pelo Quality Gate; no fallback, ela também é recalculada em runtime.

## Unit economics

Ticket, margem, salário, encargos, win rate, churn e demais premissas continuam sendo entradas próprias do **Simulador Econômico**. Elas não são inventadas para produzir o ranking geográfico.

Por isso `potentialMrr`, `breakEvenContracts` e campos econômicos territoriais podem permanecer `null` até calibração. A prontidão territorial e a autorização econômica são camadas diferentes.

## Significado de `decisionReady`

Na metodologia `national-v1.1-core-evidence`, `decisionReady=true` significa:

> existe evidência nacional suficiente para produzir e ordenar territórios candidatos com score ajustado por confiança e os guardrails territoriais da v1.1 foram satisfeitos.

Não significa:

- censo competitivo completo;
- garantia de ausência de concorrência;
- aprovação automática de contratação;
- ROI aprovado sem premissas econômicas;
- risco municipal observado quando a fonte é somente UF;
- validação de eficiência viária para raios acima de 200 km.

## Gate com snapshots publicados

O workflow `Market Intelligence - Quality Gate` roda também em pull requests que alteram o módulo. Além de fixtures, typecheck, testes e build, ele executa `scripts/market-intelligence-core-evidence-smoke.ts --write` contra os próprios arquivos nacionais versionados e publica o `territorios.json` gerado como artefato de CI.

O gate falha se:

- houver menos de 5.000 municípios no snapshot-base;
- CIOT origem ou destino estiver ausente;
- menos de 1.000 municípios forem pontuáveis;
- houver menos de cinco territórios candidatos;
- surgir território sem Opportunity Score;
- algum território decisório ultrapassar 200 km;
- o ranking não estiver ordenado por Opportunity Score decrescente.

## Fontes atualmente materializadas

- IBGE / BCIM: geografia municipal e centroides;
- Receita Federal CNPJ: população ICP por município;
- ANTT RNTRC: transportadores ativos;
- SENATRAN: frota de carga;
- ANTT CIOT Jul/2026: fluxo origem-destino, explicitamente como proxy de MDF-e;
- MJSP Sinesp Jan-Jul/2026: risco em nível UF;
- concorrência: pesquisa parcial, preservada como parcial.

## Critérios para uma v1.2 ou v2

A metodologia deve ser revisada quando houver pelo menos um destes avanços:

1. censo competitivo suficientemente completo e comparável entre praças;
2. fonte oficial de risco com granularidade municipal para os indicadores relevantes;
3. modelo validado de eficiência territorial baseado em tempo/malha viária;
4. calibração dos pesos contra ganhos/perdas reais da Atlas;
5. premissas econômicas padronizadas e aprovadas para cálculo automático de ROI por território.
