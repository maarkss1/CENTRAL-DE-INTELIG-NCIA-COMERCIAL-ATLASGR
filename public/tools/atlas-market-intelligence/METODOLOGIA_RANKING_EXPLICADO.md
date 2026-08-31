# Metodologia do Ranking de Oportunidade GR — explicado item a item

**Data de geração:** 30/08/2026
**Autor do cálculo:** sessão Claude Code (branch `claude/orchestrator-pipeline-setup-q1ef3j`)
**Engine de cálculo:** `calcular_whitespace.py` v0.4 (já existente no repositório, **não foi reescrito**)
**Fórmula oficial:** `METODOLOGIA_WHITESPACE.md`
**Fonte de dado:** 100% automatizada — Receita Federal (CNPJ) e ANTT, competência 2026-08/jul-2026. Nenhuma etapa depende de verificação manual.

Este documento existe para responder, item por item, uma pergunta simples: **de onde veio cada número usado para decidir onde a Atlas GR deve contratar o próximo vendedor externo, por que esse item foi usado, que peso ele tem, e como o valor final de cada posição do ranking foi calculado.**

Todo peso e toda fórmula abaixo estão documentados em `METODOLOGIA_WHITESPACE.md` e codificados em `calcular_whitespace.py`. O insumo de concorrência nacional (seção 4) é o que permite classificar os 5.566 municípios do país com dado de demanda disponível — cobertura de 100%, mesmo critério em todo o Brasil.

---

## 1. Por que o ranking anterior (`CENSO_COMPETITIVO_GR_CONTRIBUICAO_2026_08.md`) não bastava

| Limitação do censo anterior | Efeito |
|---|---|
| Cobria só 11 municípios de "evidência negativa" + ~15 de presença confirmada | O Brasil tem 5.571 municípios — o censo enxergava <0,5% deles |
| `maps_search` nunca foi rodado; `business_registry_search` (Econodata) faltou em 2 dos 11 municípios | Confiança rotulada como MÉDIO, nunca ALTO |
| `competicao_municipios.json` não tinha nenhum município com status `CENSO_COMPLETO` | A fórmula White Space (`calcular_whitespace.py`) exige `CENSO_COMPLETO` por regra de *inner join* — **por isso ela nunca classificou nenhum município até este trabalho** |

O motor de cálculo (White Space) sempre existiu e sempre esteve correto. Ele só não tinha combustível — o dado de concorrência nacional que faltava.

---

## 2. Inventário completo das fontes de dados usadas no ranking

| # | Fonte | Arquivo no repo | Origem oficial | Competência/data | O que fornece | Por que foi usada |
|---|---|---|---|---|---|---|
| 1 | Receita Federal — CNPJ (Empresas + Estabelecimentos) | `data/icp_municipios.json` | `arquivos.receitafederal.gov.br` (portal público, protocolo WebDAV/Nextcloud) | 2026-08 | Contagem de empresas por município e por tier de aderência ICP (A/B/C), conforme `icp_taxonomy.v1.json` | É a fonte de **demanda por perfil de cliente** (empresas do setor logístico/industrial que são o público-alvo da Atlas GR) |
| 2 | Receita Federal — CNPJ (mesma base, filtrada por CNAE 80200 + palavra-chave) | `data/concorrentes_gr_receita_federal.csv` + `_ranqueado.csv` | idem #1 | 2026-08 | Lista nacional de **concorrentes** (Gerenciadoras de Risco e afins), com nível de confiança ALTO/MÉDIO/BAIXO | É o dado que faltava: **pressão concorrencial nacional**, gerado nesta sessão (ver seção 4) |
| 3 | ANTT — RNTRC (Registro Nacional de Transportadores) | `data/rntrc_municipios.json` | `dados.antt.gov.br`, recurso "Jul26 - RNTRC" | 2026-07 | Nº de transportadoras ativas por município (`transporters`, `etc`, `tac`, `ctc`) | É a **segunda perna da Demanda**: densidade real de transportadoras (clientes potenciais) por território |
| 4 | ANTT — CIOT (usado como proxy de MDF-e) | `data/mdfe_origens_municipios.json` | `dados.antt.gov.br/dataset/ciot` | 2026-07 | Viagens de carga por município de origem (690 mil registros brutos) | Mede **fluxo real de carga**, não só cadastro — captura hubs logísticos ativos mesmo com poucas empresas sediadas ali |
| 5 | SENATRAN — Frota por município | `data/senatran_frota_municipios.json` | `gov.br/transportes` (Senatran) | 2026-07 | Frota total e frota de carga por município | Usado como validação de massa (não entra na fórmula White Space atual, mas cruzado no dashboard) |
| 6 | MJSP/Sinesp VDE — roubo/furto | `data/risco_uf.json` | `gov.br/mj` (Sinesp, base VDE) | jan–jul/2026 | Roubo de carga, roubo/furto de veículo por UF | Sinal de **risco securitário** — ainda não entra no White Space (ver limitação na seção 6), mas contextualiza por que GR é relevante na região |
| 7 | IBGE — Municípios (geolocalização) | `data/municipios.json` | `servicodados.ibge.gov.br/api/v1/localidades/municipios` | corrente | Nome, UF, região, lat/lon de cada município | Join geográfico usado em todas as etapas |
| 8 | Taxonomia ICP | `icp_taxonomy.v1.json` v1.0.0 | Definida pelo time Atlas | — | Prefixos de CNAE que definem tier A/B/C de aderência ao ICP (cliente) | Base do índice de Demanda/ICP |

---

## 3. A fórmula White Space (não mudou — só foi destravada)

```
White Space = 45% × Demanda + 25% × Fluxo MDF-e + 30% × (100 − Pressão Concorrencial)

Demanda = 58% × percentil(ICP) + 42% × percentil(RNTRC)
```

Cada componente é um **percentil nacional 0–100**, não um valor bruto — isso evita que um único hub gigante (ex.: São Paulo capital) distorça a escala para todos os outros municípios. Antes de virar percentil, o valor bruto passa por transformação logarítmica (`log1p(valor)/log(10)`) especificamente para achatar a concentração extrema nos grandes polos.

| Componente | Peso | Por quê esse peso |
|---|---:|---|
| Demanda | 45% | Maior peso: sem massa de clientes potenciais (ICP + RNTRC), não há negócio a proteger, GR ou não |
| Fluxo MDF-e | 25% | Corrige o viés de "só cadastro": um município pode ter poucas empresas sediadas mas ser um corredor de carga ativo |
| (100 − Pressão Concorrencial) | 30% | Quanto menor a concorrência já instalada, maior o espaço para um novo vendedor conquistar conta — mas não é o fator dominante (a demanda pesa mais) |

Dentro de Demanda:

| Componente | Peso | Por quê |
|---|---:|---|
| ICP (CNPJ/tier) | 58% | Reflete a qualidade/aderência do cliente potencial (tier A/B/C), não só volume |
| RNTRC | 42% | Reflete o volume real de transportadoras, sinal mais direto de "tem frota para proteger" |

### Pressão concorrencial — pesos por categoria (de `METODOLOGIA_WHITESPACE.md`)

| Categoria de presença | Peso-base |
|---|---:|
| Gerenciadora de risco / GR direta | 1,00 |
| Monitoramento | 0,70 |
| Rastreamento | 0,55 |
| Pronta resposta | 0,50 |
| Cobertura remota nacional | 0,35 |

Essas 5 categorias vêm de `data/competicao_municipios_completo.json`, gerado inteiramente pela extração de CNPJ (seção 4) — **mesmo critério automatizado em todos os 5.571 municípios**, sem etapa manual em nenhum deles.

---

## 4. Como a Pressão Concorrencial nacional foi calculada

### 4.1 Extração (`scripts/find_competitors_cnpj.py`)

- Baixados os 26 arquivos oficiais da Receita Federal (competência 2026-08): 10 partes de `Empresas*.zip`, 10 de `Estabelecimentos*.zip` (72.789.638 linhas de estabelecimento no total), + tabelas de apoio (Municípios, CNAEs, Naturezas, Simples).
- **Critério de match** (uma empresa entra se qualquer um for verdadeiro):
  - CNAE principal ou secundário começa com `80200` (subclasses 8020001 "monitoramento de sistemas de segurança eletrônico" e 8020002 "outras atividades de segurança") — casamento por **prefixo**, porque empresas são cadastradas na subclasse, nunca no código de classe puro;
  - razão social ou nome fantasia contém, com fronteira de palavra (não substring livre — ver nota de bug abaixo), um termo de: `risco`, `gerenciad`, `rastrea`, `monitorament`, `gestao de risco`.
- **Resultado bruto:** 10.795 estabelecimentos ativos, 10.067 empresas distintas (`cnpj_basico`).

**Bug corrigido durante o processo:** a primeira versão usava `"risco" in texto` (substring livre), que casava dentro de `MARISCO`, `PRISCO`, `CORISCO`, `ASTERISCO`, `CRISCOULLO` — 637 falsos positivos. Corrigido para exigir fronteira de palavra no início do termo (`\briscos?\b` etc.), preservando o casamento por radical de termos como `gerenciad→gerenciadora` e `rastrea→rastreamento`.

### 4.2 Classificação de confiança (`scripts/rank_competitors_cnpj.py`)

| Nível | Critério | Empresas |
|---|---|---:|
| **ALTO** | Nome contém explicitamente "gerenciadora/gestão de risco" **OU** CNAE **principal** é 8020001/8020002 **e** o nome também cita carga/transporte/rastreamento | 2.285 |
| **MEDIO** | CNAE principal é 8020001/8020002 sem termo de carga explícito, **OU** nome bate na palavra-chave mas o CNAE principal é outra atividade | 5.324 |
| **BAIXO** | CNAE de monitoramento aparece só como **secundário** (atividade declarada central é outra) | 2.458 |

### 4.3 Conversão para o schema de competição (`scripts/build_competition_from_cnpj.py`)

Cada empresa é categorizada em **uma única** categoria (sem dupla contagem), por prioridade:

```
ALTO confiança                                          → directRiskManagement (peso 1,00)
nome contém "rastrea"/"track"/"gps"                      → tracking            (peso 0,55)
MEDIO confiança + CNAE principal de monitoramento         → monitoring          (peso 0,70)
BAIXO restante                                            → nationalRemoteCoverage (peso 0,35)
```

Todo município do Brasil recebe uma linha `censusStatus: CENSO_COMPLETO`, inclusive onde não foi encontrada nenhuma empresa — com esta fonte, "não encontrado" é um resultado real de pesquisa (a base nacional foi varrida inteira, não uma amostra), não ausência de pesquisa. Cada linha carrega `protocolVersion: "cnpj-receita-federal-v1"` e `confidence: "MEDIO"`, deixando explícito que o dado é inferido por CNAE/nome, não uma certificação formal do setor.

**Resultado:** `data/competicao_municipios_completo.json` — 5.571 municípios, todos com o mesmo critério (17 estabelecimentos com geografia não casada foram descartados só da contagem por empresa, mas o município ainda recebeu linha zero).

### 4.4 Execução do motor oficial

`calcular_whitespace.py` foi executado **sem nenhuma alteração de código**, apontando temporariamente para `competicao_municipios_completo.json`.

```
Municípios com CENSO_COMPLETO: 5.571 de 5.571 (100%)
Municípios classificados pela fórmula White Space: 5.566 de 5.566 no universo com dado de demanda (100%)
```

---

## 5. Como ler a pontuação de cada posição do ranking

Arquivo de saída: `data/whitespace_municipios.json` (todos os municípios) e `data/ranking_oportunidade_gr.json` (resumo: top 30 municípios + agregado por UF).

Cada linha carrega, além do `whiteSpaceScore` final:

| Campo | O que é | Faixa |
|---|---|---|
| `demandScore` | 45% do peso final — combinação ICP+RNTRC já em percentil | 0–100 |
| `icpPercentile` | Posição relativa em massa de clientes ICP | 0–100 |
| `rntrcPercentile` | Posição relativa em transportadoras ativas | 0–100 |
| `mdfePercentile` | Posição relativa em fluxo de carga (CIOT/MDF-e) | 0–100 |
| `competitionPercentile` | Posição relativa em pressão concorrencial (**quanto MENOR, melhor** para a oportunidade — por isso a fórmula usa `100 − isso`) | 0–100 |
| `verifiedPresences` | Nº de concorrentes distintos encontrados no município | inteiro |

**Exemplo real — Paranaguá/PR (1º colocado nacional, score 94,1):**

```
whiteSpaceScore = 45%×88,6 + 25%×99,8 + 30%×(100−2,2)
                = 39,85     + 24,95    + 29,33
                = 94,13
```

Ou seja: Paranaguá está entre os municípios de maior demanda estrutural do país (percentil 88,6 em ICP+RNTRC combinados), é o **segundo maior fluxo de carga do Brasil** por essa métrica (percentil 99,8 — é porto), e tem **apenas 2 concorrentes** identificados (percentil de concorrência de só 2,2, ou seja, 97,8% dos municípios têm mais concorrência proporcional). Os três fatores empurram o score para cima ao mesmo tempo — por isso ele lidera com folga.

---

## 6. Limitações — o que este ranking ainda NÃO resolve

Estas são as mesmas lacunas já documentadas em `METODOLOGIA_WHITESPACE.md`, seção "O que ainda falta", ainda válidas:

- **Risco securitário** (`risco_uf.json`) ainda não entra na fórmula — existe, está pronto, mas a fórmula White Space atual (v0.4) não o incorpora. Fica como sinal contextual no dashboard, não como peso.
- **Perfil de carga / NCM de maior interesse**, **exposição interestadual**, **eficiência territorial** (distância/malha viária) — não disponíveis.
- **TAM/SAM/SOM, ticket médio, MRR esperado, break-even do vendedor** — não calculados; este ranking prioriza *onde procurar*, não *quanto vale* cada território.
- **A concorrência é um proxy, não uma certificação**: CNAE + nome no CNPJ não é o mesmo que confirmar que uma empresa realmente presta serviço de GR hoje, com que qualidade, ou que ainda está operando (uma empresa pode ter CNAE de monitoramento e nunca ter atuado nesse ramo). É por isso que a confiança é rotulada `MEDIO`, nunca `ALTO`, para todo dado desta fonte.
- **Municípios sem RNTRC ou ICP suficiente ficam fora do universo classificável** (5.566 de 5.571 — 5 ficaram de fora por não aparecerem em nenhuma das duas bases de demanda).

## 7. Onde estão os arquivos

| Arquivo | Conteúdo |
|---|---|
| `scripts/find_competitors_cnpj.py` | Extração nacional de concorrentes por CNAE + palavra-chave |
| `scripts/rank_competitors_cnpj.py` | Deduplicação por empresa + classificação de confiança |
| `scripts/build_competition_from_cnpj.py` | Conversão para o schema `competicao_municipios.json` |
| `data/concorrentes_gr_receita_federal.csv` | 10.795 estabelecimentos (1 linha por matriz/filial) |
| `data/concorrentes_gr_receita_federal_ranqueado.csv` | 10.067 empresas deduplicadas, com confiança |
| `data/competicao_municipios_completo.json` | 5.571 municípios no schema de competição, todos automatizados |
| `data/whitespace_municipios.json` | Score White Space de 5.566 municípios |
| `data/ranking_oportunidade_gr.json` | Resumo: top 30 municípios + agregado por UF |
| `RANKING_OPORTUNIDADE_GR_2026_08.md` | Leitura executiva do ranking (este documento é o "como", aquele é o "o quê") |
