# Market Intelligence · Calibração Econômica CRM v1.3

## Objetivo

Reduzir premissas manuais do Unit Economics territorial usando somente métricas comerciais que já possuem fonte canônica e reproduzível no Comercial Inteligente.

A v1.3 **não transforma o CRM em autorização automática de contratação**. Ela calibra três parâmetros comerciais e mantém as demais premissas explicitamente editáveis.

## Fonte canônica

Endpoint interno:

`GET /api/commercial-intelligence/trends?month=YYYY-MM`

Janela atual: seis meses.

Cada ponto histórico fornece:

- `winRate`;
- `salesCycleMeanDays`;
- `averageTicketWon`;
- `closedSampleSize`;
- competência mensal.

O dicionário oficial do Comercial Inteligente define:

- Win Rate = ganhos / (ganhos + perdidos), apenas negócios fechados;
- Ticket Médio = soma de `Lead.amount` / quantidade de negócios do grupo;
- Fechado = `Lead.amount` dos negócios ganhos, tratado pelo módulo como MRR realizado;
- Sales Cycle = `closedAt - createdAt` em dias.

## Métricas calibradas

### Win Rate

Média dos Win Rates mensais ponderada por `closedSampleSize`.

### Sales Cycle

Média dos ciclos mensais ponderada por `closedSampleSize`.

### Ticket MRR médio

Mediana dos `averageTicketWon` mensais válidos.

A API histórica não publica o `wonCount` de cada mês. Por isso a v1.3 **não inventa uma ponderação do ticket por quantidade de ganhos**. A mediana mensal é usada para reduzir sensibilidade a meses atípicos e preservar rastreabilidade.

## Gate mínimo de evidência

A calibração só pode ser aplicada quando:

1. existem pelo menos 10 negócios fechados na janela;
2. existem pelo menos 2 meses com negócios fechados;
3. Win Rate, Sales Cycle e Ticket ganho possuem valores válidos.

Classificação de confiança:

- `INSUFICIENTE`: menos de 10 fechamentos ou menos de 2 meses;
- `BAIXA`: gate mínimo atendido;
- `MEDIA`: pelo menos 20 fechamentos e 3 meses;
- `ALTA`: pelo menos 50 fechamentos e 4 meses.

Confiança baixa não significa dado fictício. Significa evidência real com amostra menor.

## Aplicação explícita

A tela pode carregar o histórico automaticamente para análise, mas **não altera o cenário automaticamente**.

Os três campos só são atualizados após a ação explícita:

`Aplicar dados do CRM`

Se o usuário editar Ticket, Win Rate ou Sales Cycle depois da aplicação, a interface deixa de marcar o cenário como calibrado.

## Premissas que continuam manuais

A v1.3 não preenche automaticamente:

- margem bruta;
- conversão reunião → oportunidade qualificada;
- churn;
- oportunidades qualificadas/mês em produtividade plena;
- penetração esperada no SAM;
- percentual territorial atendível;
- salário, encargos, veículo, combustível, hospedagem e demais custos;
- investimento inicial;
- comissão;
- política de payback;
- política de ROI.

Esses campos só poderão deixar de ser manuais quando existir uma fonte canônica auditável para cada um.

## Fail-honest

Se a API do Comercial Inteligente falhar, o simulador econômico continua disponível em modo manual e informa a indisponibilidade da calibração.

Se a amostra histórica for insuficiente, os valores recomendados permanecem `N/A` e o botão de aplicação fica bloqueado.

Ausência de dado nunca vira zero histórico.

## Calendário

O mês consultado é resolvido no calendário civil `America/Sao_Paulo`, evitando tratar uma virada UTC como mês novo antes da meia-noite de Brasília.

## Relação com versões anteriores

- v1.1 responde **onde existe prioridade territorial**;
- v1.2 responde **se a economia do território atende a uma política de contratação**;
- v1.3 reduz incerteza de Ticket, Win Rate e Sales Cycle usando o histórico comercial real.

A decisão continua composta:

`Core Evidence territorial → TAM → SAM → SOM → Unit Economics → Política financeira → Recomendação`
