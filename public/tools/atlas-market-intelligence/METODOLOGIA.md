# METODOLOGIA - Atlas Market Intelligence

## 1. Regra de ouro

O sistema separa quatro conceitos que não podem ser confundidos:

```text
TAMANHO DE MERCADO != DEMANDA ATENDÍVEL != WHITE SPACE != PRIORIDADE DE CONTRATAÇÃO
```

Um município pode ser enorme e ainda assim ser uma escolha ruim para o próximo vendedor se houver saturação, baixa eficiência territorial ou confiança insuficiente.

## 2. Estados de evidência

Todo indicador material deve possuir um estado:

- `OBSERVADO`: calculado de fonte identificada;
- `ESTIMADO`: inferência quantitativa documentada;
- `PROXY`: indicador de outra granularidade/variável usado como aproximação;
- `PREMISSA_EDITAVEL`: parâmetro comercial fornecido/editável;
- `NAO_DISPONIVEL`: dado ausente.

`NAO_DISPONIVEL` nunca vira zero automaticamente.

## 3. Confiança

Cada componente recebe confiança numérica de 0 a 1 e classe executiva:

```text
ALTO    >= 0,80
MEDIO   >= 0,60 e < 0,80
BAIXO   > 0 e < 0,60
BLOQUEADO = regra de governança impede uso decisório
```

A confiança considera:

- autoridade da fonte;
- competência/defasagem;
- granularidade;
- cobertura;
- completude;
- qualidade de join geográfico;
- observação versus proxy;
- status do censo competitivo.

## 4. Demanda potencial

A camada de demanda deve combinar dimensões distintas.

### 4.1 ICP

Taxonomia:

**Tier A**: aderência logística direta e alta prioridade. Transportadoras, operadores logísticos, 3PL, armazenagem relevante, agenciadores de carga, grandes frotas e embarcadores intensivos.

**Tier B**: indústrias/embarcadores com alta exposição logística, incluindo alimentos, bebidas, frigoríficos, pharma, eletrônico, automotivo, autopeças, químico, combustíveis, papel/celulose, mineração, metalurgia, máquinas, e-commerce e grandes distribuidores.

**Tier C**: atacado, distribuição regional, agro, cooperativas, insumos, construção e demais exposições rodoviárias relevantes.

A classificação de conta evolui de:

```text
CNAE principal
```

para:

```text
CNAE principal/secundário
+ porte
+ atividade
+ evidência logística
+ frota
+ movimentação
+ risco
```

quando as bases permitirem.

### 4.2 RNTRC

Mede **estoque/presença logística**:

- transportadores ativos;
- ETC;
- TAC;
- CTC;
- ETC equiparada;
- frota ativa;
- veículos de tração;
- implementos.

### 4.3 MDF-e

Mede **fluxo logístico observado**:

- origens;
- destinos;
- MDF-e/viagens;
- toneladas;
- TKU quando disponível;
- interestadualidade;
- concentração de corredores;
- tipo/pressão da carga quando tecnicamente observável.

RNTRC e MDF-e não são substitutos.

## 5. Need Atlas / pressão securitária

A camada de Need não é sinônimo de criminalidade.

Ela combina, quando disponíveis:

- exposição logística;
- intensidade/categoria de carga;
- roubo de carga;
- roubo de veículo;
- furto de veículo;
- corredores relevantes;
- sinais securitários observáveis.

Se crime existir apenas por UF:

```text
geography = PROXY_UF
```

A confiança é reduzida e a interface não apresenta o valor como municipal.

A fórmula v0.5 anterior é preservada como histórico, mas não será promovida automaticamente a fórmula nacional final sem sensibilidade e cobertura:

```text
crime_raw = 5*roubo_carga + 0,60*roubo_veiculo + 0,25*furto_veiculo
Need v0.5 = 60% crime + 20% MDF-e + 20% cargo mix
```

## 6. Concorrência

Estados:

```text
NAO_PESQUISADO
PESQUISA_PARCIAL
CENSO_COMPLETO
```

Dimensões separadas:

```text
sede fisica
filial
representante
presenca comercial
atendimento remoto
atendimento nacional
GR
rastreamento
monitoramento
pronta resposta
PGR/servicos correlatos
```

Uma sede ausente não significa cidade desatendida.

## 7. White Space

A expressão conceitual é multiplicativa:

```text
White Space ∝ Demanda × Need × Intensidade Logística × Baixa Pressão Competitiva
```

A implementação não deve ser uma soma ingênua que permita a um mercado saturado vencer apenas por escala.

Regra dura:

```text
if census_status != CENSO_COMPLETO:
    white_space = NULL
    status = BLOQUEADO
```

Quando o censo estiver completo, a primeira versão candidata será construída com componentes normalizados nacionalmente e transformação de saturação que penalize de fato pressão competitiva. Pesos finais serão definidos por análise de sensibilidade.

## 8. Opportunity Score

A referência histórica é:

```text
ICP                     25%
RNTRC                   20%
MDF-e                   15%
Need / risco            15%
White Space             20%
Eficiência territorial   5%
```

Esses pesos são **hipótese de modelagem**, não dogma.

A plataforma deve publicar pelo menos:

```text
Demand Score
Risk Score
Competitive Pressure Score
White Space Score
Territorial Efficiency Score
Raw Opportunity Score
Confidence-adjusted Opportunity Score
```

### Score ajustado por confiança

Primeira regra de trabalho:

```text
Adjusted = Raw × ConfidenceAggregate
```

onde `ConfidenceAggregate` é derivada das camadas que efetivamente participam da nota e aplica bloqueios duros antes da multiplicação.

Não usar essa regra para mascarar ausência de censo competitivo. Sem censo completo, o ranking decisório permanece bloqueado.

## 9. Normalização

Não normalizar score sobre uma amostra arbitrária importada pelo usuário.

O universo deve ser registrado no snapshot, preferencialmente nacional e de competência fixa.

Para distribuições muito assimétricas, testar:

- percentil/rank nacional;
- winsorization documentada;
- `log1p` antes de min-max;
- z-score robusto.

Escolher transformação por estabilidade, explicabilidade e sensibilidade a outliers.

## 10. Análise de sensibilidade

Para cada versão do score:

1. variar pesos em faixas plausíveis;
2. recalcular top N;
3. medir estabilidade de posição;
4. identificar territórios que só vencem sob um conjunto estreito de pesos;
5. reduzir confiança de recomendações instáveis;
6. registrar metodologia_version.

Se houver histórico de ganhos/perdas Atlas suficiente, usar calibração supervisionada apenas como complemento, preservando explicabilidade.

## 11. Territory Optimizer

Candidatos:

```text
cada cidade-base elegível × [100,150,200,250,300,400] km
```

Cada candidato agrega os municípios dentro do raio.

Valor territorial considera:

- Opportunity ajustado;
- contas ICP;
- Tier A/B;
- RNTRC/frota;
- MDF-e;
- confiança;
- densidade;
- dispersão;
- acesso/eficiência;
- custo comercial quando disponível.

Para múltiplos vendedores, selecionar conjuntos maximizando valor/cobertura e penalizando interseção.

Métrica mínima de overlap:

```text
overlap_accounts = contas cobertas por >1 território
coverage_efficiency = contas únicas / soma das contas brutas dos territórios
```

O algoritmo deve emitir cenários para 1, 2, 3, 5, 10 e 20 vendedores.

## 12. TAM / SAM / SOM

### TAM

Contas economicamente aderentes no universo definido.

### SAM

Subconjunto do TAM atendível pelo portfólio, geografia e restrições do território.

### SOM

Parcela capturável do SAM dentro do horizonte e cenário, dependente de premissas explícitas.

Nunca:

```text
CNPJs × ticket = receita factual
```

Sempre:

```text
contas observadas + elegibilidade + premissas comerciais = cenário econômico
```

## 13. Economia do vendedor

Custo mensal:

```text
salario
+ encargos
+ beneficios
+ veiculo
+ combustivel
+ hospedagem
+ pedagio
+ comissao
+ ferramentas
+ administrativo
```

Contribuição por contrato:

```text
Ticket MRR × Margem
```

Break-even de contratos:

```text
ceil(Custo mensal / contribuição por contrato)
```

Oportunidades qualificadas mínimas:

```text
ceil(contratos break-even / win rate)
```

A evolução inclui sales cycle, churn, comissão variável, ramp-up, fluxo de caixa, payback e ROI 12/24 meses.

## 14. Cenários

```text
Conservador
Base
Agressivo
```

Variáveis:

- ticket;
- win rate;
- penetração;
- margem;
- churn;
- ramp-up;
- custo de campo.

Todos permanecem `PREMISSA_EDITAVEL` até receber origem Atlas documentada.

## 15. Explicabilidade

Cada município/território deve conseguir responder:

```text
Por que esta nota?
```

A explicação cita componentes positivos, negativos, bloqueios, proxies e evidências.

Não gerar justificativa textual desconectada dos números persistidos.

## 16. Critério de decisão executiva

A plataforma só publica ordem nacional de contratação como decisão quando:

1. geografia canônica válida;
2. RNTRC processado;
3. ICP processado;
4. MDF-e processado ou explicitamente dispensado por versão metodológica aprovada;
5. Need com cobertura/confiança registrada;
6. concorrência com `CENSO_COMPLETO` nos territórios candidatos à recomendação;
7. score testado para 0-100 e sensibilidade;
8. Territory Optimizer executado;
9. premissas econômicas preenchidas para MRR/break-even;
10. evidências e competências visíveis.

Até lá, qualquer cluster anterior é rotulado **HIPÓTESE DE TRIAGEM**.