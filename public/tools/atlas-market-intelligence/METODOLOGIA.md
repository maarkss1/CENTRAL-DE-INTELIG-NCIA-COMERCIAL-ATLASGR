# METODOLOGIA — Atlas GR National Market & Territory Intelligence System

**Atualizado em:** 22/08/2026

## 1. Regra de ouro

```text
TAMANHO DE MERCADO ≠ DEMANDA ATENDÍVEL ≠ WHITE SPACE ≠ PRIORIDADE DE CONTRATAÇÃO
```

Um mercado enorme pode ser uma escolha ruim se estiver saturado, for operacionalmente ineficiente ou tiver evidência insuficiente.

## 2. Estados de evidência

- `OBSERVADO`: calculado de fonte identificada;
- `ESTIMADO`: inferência quantitativa documentada;
- `PROXY`: aproximação de outra variável ou granularidade;
- `PREMISSA_EDITAVEL`: parâmetro comercial editável;
- `NAO_DISPONIVEL`: dado ausente.

`NAO_DISPONIVEL` nunca vira zero automaticamente.

## 3. Confiança

```text
ALTO      >= 0,80
MEDIO     >= 0,60 e < 0,80
BAIXO     > 0 e < 0,60
BLOQUEADO = regra de governança impede uso decisório
```

A confiança considera fonte, competência, cobertura, granularidade, qualidade do join, observação versus proxy e completude competitiva.

## 4. Demanda potencial

### 4.1 ICP Atlas

**Tier A:** transportadoras, operadores logísticos, 3PL, armazenagem relevante, agenciadores, grandes frotas e embarcadores intensivos.

**Tier B:** alimentos, bebidas, frigoríficos, pharma, eletrônicos, automotivo, autopeças, químico, combustíveis, papel/celulose, mineração, metalurgia, máquinas, e-commerce e grandes distribuidores.

**Tier C:** atacado, distribuição regional, agro, cooperativas, insumos, construção e mercados adjacentes com exposição rodoviária relevante.

A classificação deve combinar, conforme a evidência disponível:

```text
CNAE principal/secundários
+ porte
+ atividade
+ sinais logísticos
+ frota
+ movimentação
+ risco
```

A taxonomia atual é versionada, mas ainda precisa ser calibrada com ganhos/perdas Atlas.

### 4.2 RNTRC

RNTRC mede **estoque/presença logística**:

- transportadores ativos;
- ETC;
- TAC;
- CTC;
- ETC equiparada.

Snapshot atual: `2026-07`.

### 4.3 Frota

A fonte municipal ativa é a **SENATRAN**, que publica frota por município e tipo.

A plataforma deriva:

```text
cargoFleet = CAMINHAO + CAMINHAO TRATOR + REBOQUE + SEMI-REBOQUE
```

Essa soma é uma transformação Atlas documentada, não um indicador oficial nomeado pela SENATRAN.

A antiga tentativa via `RNTRC-Dados de Veículos` fica apenas como histórico, pois aquele recurso não oferecia granularidade municipal adequada.

### 4.4 Fluxo MDF-e / CIOT

A missão deseja MDF-e como medida de movimentação. No snapshot nacional reproduzível atual, a fonte automatizável disponível é CIOT da ANTT.

Logo:

```text
CIOT = OBSERVADO como operação contratada
CIOT = PROXY documentado de intensidade de fluxo MDF-e
MDF-e literal / manifests = NAO_DISPONIVEL
```

Nunca preencher `manifests`, toneladas ou TKU com valores não observados.

RNTRC mede presença. Fluxo mede movimentação. Não são substitutos.

## 5. Need Atlas / risco

Need não é sinônimo de criminalidade. Deve combinar, quando possível:

```text
exposição logística
+ tipo/atratividade de carga
+ roubo de carga
+ roubo de veículo
+ furto de veículo
+ corredores
```

No snapshot atual, os indicadores Sinesp utilizados estão em UF:

```text
geography = PROXY_UF
```

A confiança é reduzida e a interface não pode chamar o valor de risco municipal observado.

## 6. Concorrência

Estados obrigatórios:

```text
NAO_PESQUISADO
PESQUISA_PARCIAL
CENSO_COMPLETO
```

Devem ser distinguidos:

```text
sede
filial
representante
presença comercial
atendimento remoto
atendimento nacional
GR
rastreamento
monitoramento
pronta resposta
PGR e correlatos
```

Sede ausente não significa território desatendido.

## 7. White Space

Conceitualmente:

```text
White Space ∝ Demanda × Need × Intensidade Logística × Baixa Pressão Competitiva
```

Regra dura:

```text
if census_status != CENSO_COMPLETO:
    white_space = NULL
```

Mercados saturados não podem vencer por escala usando uma soma ingênua.

## 8. Core Evidence versus Opportunity final

### Core Evidence v1.1

Ranking exploratório atual:

```text
ICP       35%
RNTRC     25%
CIOT      20%
Need      20%
```

White Space e eficiência territorial permanecem `NAO_DISPONIVEL`, não zero.

### Opportunity final

A referência histórica:

```text
ICP                     25%
RNTRC                   20%
Fluxo                    15%
Need / risco            15%
White Space             20%
Eficiência territorial   5%
```

é apenas hipótese inicial. Pesos finais exigem análise de sensibilidade.

A plataforma deve distinguir:

```text
Demand Score
Risk/Need Score
Competitive Pressure
White Space
Territorial Efficiency
Core Evidence Score
Final Raw Opportunity
Final Confidence-adjusted Opportunity
```

## 9. Normalização

O universo é nacional e de competência registrada.

Para distribuições assimétricas, testar e documentar percentil, `log1p`, winsorization ou estatística robusta. Nunca normalizar apenas sobre um CSV arbitrário importado na UI.

## 10. Sensibilidade

Para cada metodologia final:

1. variar pesos em faixas plausíveis;
2. recalcular Top N;
3. medir estabilidade de posições;
4. identificar vencedores frágeis;
5. reduzir confiança de recomendações instáveis;
6. persistir `methodologyVersion`.

## 11. Territory Optimizer

Candidatos:

```text
cidade-base × [100,150,200,250,300,400] km
```

Múltiplos vendedores são escolhidos por cobertura incremental com penalização de overlap.

Métricas mínimas:

```text
overlap_accounts
unique_accounts
coverage_efficiency
incremental_value
```

Cenários obrigatórios:

```text
1 / 2 / 3 / 5 / 10 / 20 vendedores
```

### Hub Suitability

A seleção final da cidade-base precisa considerar, além do círculo geométrico:

```text
materialidade da própria base
RNTRC/frota próprios
centralidade comercial
malha rodoviária
tempo de deslocamento
aeroportos quando relevantes
custo operacional
cidades satélites
```

Haversine é distância geodésica, não tempo rodoviário.

O ranking Core atual provou que esse gate é necessário ao produzir bases geometricamente convenientes que não podem ser tratadas automaticamente como melhor cidade para o vendedor morar.

## 12. TAM / SAM / SOM

**TAM:** contas economicamente aderentes no universo definido.

**SAM:** subconjunto atendível pelo portfólio, território e restrições Atlas.

**SOM:** parcela capturável do SAM dentro do horizonte e cenário.

Proibido:

```text
CNPJs × ticket = receita factual
```

Correto:

```text
contas observadas
+ elegibilidade
+ Product Fit
+ premissas comerciais
= cenário econômico
```

## 13. Economia do vendedor

Custo mensal:

```text
salário + encargos + benefícios + veículo + combustível + hospedagem
+ pedágio + comissão + ferramentas + administrativo
```

```text
contribuição por contrato = Ticket MRR × margem
break-even contratos = ceil(custo mensal / contribuição)
oportunidades mínimas = ceil(break-even / win rate)
```

A camada deve incorporar sales cycle, churn, ramp-up, payback e ROI 12/24 meses.

Sem premissa aprovada, a saída é `PREMISSA_EDITAVEL`/`NAO_DISPONIVEL`, nunca um número inventado.

## 14. Cenários e ramp-up

Cenários:

```text
Conservador
Base
Agressivo
```

Variam ticket, win rate, penetração, margem, churn, ramp-up e custo.

Ramp-up deve suportar pelo menos:

```text
M1 / M2 / M3 / M6 / M12
```

## 15. Explicabilidade

Todo município e território deve responder:

> Por que recebeu esta nota?

A explicação é derivada dos componentes persistidos, incluindo positivos, negativos, proxies, bloqueios, competência e evidências.

## 16. Gate de decisão executiva

Existem dois estados:

### Exploration Ready

Core Evidence suficiente para priorizar investigação.

### Final Decision Ready

A ordem `Vendedor 01`, `Vendedor 02`, etc. somente é liberada com:

```text
geografia válida
+ RNTRC
+ frota/limitação documentada
+ CNPJ/ICP
+ fluxo
+ Need
+ concorrência CENSO_COMPLETO nos finalistas
+ White Space
+ Hub Suitability
+ sensibilidade
+ Territory Optimizer
+ SAM/MRR/break-even
+ evidências/competências
+ QA aprovado
```

`manifest.decisionReady` representa **Final Decision Ready**.

Até o gate final, os 16 clusters históricos e os territórios Core atuais permanecem **hipóteses/candidatos para investigação**, não ordem de contratação.
