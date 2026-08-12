# Metodologia White Space — Atlas Market Intelligence v0.4

## Objetivo

Priorizar municípios onde coexistem:

- massa de contas aderentes ao ICP Atlas GR;
- densidade de transportadores;
- movimentação real de cargas;
- menor pressão competitiva verificada.

## Índices de entrada

### Demanda combinada
`58% ICP/CNPJ + 42% RNTRC`

### Fluxo MDF-e
Índice relativo 1–100 calculado sobre a base importada. Considera viagens, MDF-e, toneladas e TKU com transformação logarítmica para reduzir o efeito de concentração extrema nos grandes hubs.

### Pressão concorrencial
Índice relativo 1–100 dentro do censo carregado. Cada presença recebe peso de categoria e um multiplicador de intensidade (`presenca_peso`).

Pesos-base atuais:

| Categoria | Peso-base |
|---|---:|
| Gerenciadora de risco / GR direta | 1,00 |
| Monitoramento | 0,70 |
| Rastreamento | 0,55 |
| Pronta resposta | 0,50 |
| Telemática | 0,45 |
| Software | 0,35 |
| Outro | 0,25 |

## White Space operacional provisório

`45% Demanda + 25% MDF-e + 30% (100 - Pressão Concorrencial)`

## Trava de qualidade

O motor executa **inner join** entre Demanda, MDF-e e Concorrência. Portanto, um município sem censo competitivo não é classificado como White Space.

Isso é deliberado. “Não encontrado” é um estado de pesquisa, não um valor zero de concorrência.

## O que ainda falta para o Opportunity Score definitivo

- Need/Risco securitário
- perfil de carga / NCM de maior interesse
- exposição interestadual
- roubo/furto/sinistralidade
- distância e eficiência territorial
- capacidade de cobertura por cidade-hub e raio comercial
- TAM/SAM/SOM
- ticket e MRR esperado
- custo e break-even do vendedor externo
- calibração do modelo com histórico real de vendas Atlas GR
