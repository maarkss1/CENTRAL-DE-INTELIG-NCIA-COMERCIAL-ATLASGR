# Atlas Market Intelligence — Unit Economics territorial v1.2

## Pergunta respondida

A v1.1 responde **onde existe prioridade territorial baseada em evidência nacional**.

A v1.2 adiciona uma segunda pergunta independente:

> **o território priorizado consegue pagar a contratação de um vendedor dentro da política econômica definida pela Atlas?**

A v1.2 não altera o Opportunity Score geográfico e não inventa premissas financeiras.

## TAM, SAM e SOM

A separação é obrigatória:

- **TAM ICP observado:** número de contas ICP materializadas no território pelo Core Evidence;
- **SAM:** TAM multiplicado pelo percentual de contas que a operação declara ser realmente capaz de atender;
- **SOM máximo:** SAM multiplicado pela penetração esperada informada no cenário econômico.

O sistema nunca promove automaticamente `icp.total` para SAM.

## Premissas editáveis

A contratação econômica permanece bloqueada enquanto faltarem entradas essenciais:

- percentual do ICP realmente atendível;
- pelo menos um custo mensal real do vendedor;
- ticket MRR médio;
- margem bruta;
- Win Rate;
- conversão reunião → oportunidade qualificada;
- oportunidades qualificadas por mês em produtividade plena;
- penetração esperada sobre o SAM.

Também é possível informar investimento inicial de recrutamento, onboarding, equipamentos ou outros custos únicos. Esse valor entra no acumulado, no payback e no ROI.

## Política de autorização

Mesmo com todas as premissas preenchidas, o sistema não emite `RECOMENDADO` até existir uma política explícita de investimento.

São exigidos:

- payback máximo aceito, em meses;
- ROI mínimo em 12 meses.

ROI mínimo em 24 meses é opcional.

Não existem valores padrão para esses campos porque eles representam decisão de gestão, não evidência externa.

## Vereditos

A avaliação econômica possui quatro estados:

- `PREMISSAS_PENDENTES`: dados comerciais/financeiros essenciais ainda faltam;
- `POLITICA_PENDENTE`: cálculo disponível, mas faltam os critérios de autorização;
- `RECOMENDADO`: todas as regras explícitas foram atendidas;
- `NAO_RECOMENDADO`: ao menos uma regra econômica foi violada.

## Guardrail SOM x break-even

Mesmo quando a política de ROI parece favorável, a contratação é rejeitada se:

> o número máximo de contratos capturáveis no SOM for menor que os contratos necessários para o break-even mensal.

Esse teste impede recomendar uma praça que matematicamente não possui mercado capturável suficiente sob as próprias premissas fornecidas.

## Modelo de 24 meses

O motor considera:

- ramp-up de produtividade;
- sales cycle antes do reconhecimento de contratos;
- Win Rate;
- churn mensal;
- margem bruta;
- comissão variável sobre novo MRR;
- custos fixos mensais;
- investimento inicial;
- limite de captura do SOM.

As saídas incluem:

- contratos para break-even;
- MRR de break-even;
- oportunidades qualificadas para break-even;
- reuniões para break-even;
- pipeline MRR necessário;
- payback;
- ROI em 12 e 24 meses;
- MRR projetado no mês 12 e 24.

## Cenários

Conservador, Base e Agressivo continuam usando fatores explícitos já versionados no motor econômico. Eles não substituem a entrada de premissas reais.

## Comparação territorial

A visão econômica compara os cinco territórios mais bem ranqueados da v1.1 usando as mesmas premissas comerciais e financeiras.

Cada território altera TAM, SAM e SOM. Quando os resultados econômicos empatam, o Opportunity Score territorial funciona apenas como desempate, preservando a separação entre atratividade geográfica e viabilidade financeira.

## Regra de governança

`decisionReady=true` no manifest significa **prontidão territorial**, não autorização financeira.

Uma contratação só é apresentada como `RECOMENDADO` quando a avaliação econômica da v1.2 também está completa e satisfaz a política informada pelo usuário.
