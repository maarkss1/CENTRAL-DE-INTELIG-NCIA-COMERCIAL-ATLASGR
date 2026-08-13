# Atlas Market Intelligence v0.5 — Need/Risco + Território

## 1. Camada de risco securitário

Fonte recomendada: **MJSP / Sinesp VDE**, indicador oficial de **Roubo de Carga**, complementado por Roubo de Veículo e Furto de Veículo.

O site aceita `atlas_risco_municipios.csv` com granularidade MUNICIPIO ou UF. Quando um município não possuir linha municipal, uma linha `nivel=UF` pode servir como proxy. O painel mostra que se trata de fallback estadual.

### Crime Risk Index

A intensidade criminal relativa utiliza transformação logarítmica para reduzir o efeito de outliers:

`crime_raw = roubo_carga * 5 + roubo_veiculo * 0,60 + furto_veiculo * 0,25`

Depois o valor é normalizado de 0 a 100 dentro da base carregada.

Roubo de carga tem peso muito maior porque possui relação direta com a dor de gerenciamento de riscos da Atlas GR. Roubo/furto de veículo são sinais auxiliares de exposição patrimonial e criminalidade logística.

## 2. Cargo Mix Risk

A base CNPJ/ICP é usada apenas como **proxy de perfil de carga**, não como estatística criminal.

Pesos de exposição do mix:

- transportadoras: 1,00
- operadores logísticos: 0,90
- armazenagem: 0,70
- embarcadores industriais: 1,00
- atacado/distribuição: 0,85
- agro/mineração: 0,65
- e-commerce: 1,05

A média ponderada do mix gera um índice de 0 a 100.

## 3. Atlas Need / Risk Score

`Need/Risk = 60% crime + 20% fluxo MDF-e + 20% cargo mix`

O score só é calculado quando existe uma referência criminal municipal ou UF. Quando a referência é UF, a confiança é menor e o site marca `proxy UF`.

## 4. Opportunity Score v1

Só é calculado quando existem:

1. ICP/CNPJ;
2. RNTRC;
3. MDF-e;
4. Need/Risco;
5. censo concorrencial **marcado como COMPLETO**.

Fórmula:

`Opportunity = 25% ICP + 20% RNTRC + 15% MDF-e + 15% Need/Risco + 20% espaço competitivo + 5% eficiência territorial`

onde `espaço competitivo = 100 - pressão concorrencial`.

### Regra de governança concorrencial

Uma presença encontrada em busca pública não significa censo completo. O arquivo concorrencial passou a aceitar `censo_status`:

- `PARCIAL`: aparece na camada concorrencial, mas NÃO habilita White Space nem Opportunity Score;
- `COMPLETO`: habilita os cálculos para o município.

## 5. Eficiência territorial

Para candidatos com todas as camadas completas, o motor avalia a massa de contas ICP num raio padrão de 250 km, aplicando decaimento por distância. O índice é normalizado entre os candidatos elegíveis.

O simulador executivo permite alterar o raio.

## 6. TAM / SAM / SOM comercial

No simulador:

- `SAM contas` = contas ICP existentes dentro do raio informado;
- `SOM contas` = SAM × penetração-alvo;
- `MRR potencial` = SOM contas × ticket MRR médio;
- `break-even contratos` = custo mensal total do vendedor ÷ (ticket MRR × margem bruta);
- `pipeline mínimo` = break-even contratos ÷ win rate.

Os campos financeiros são **hipóteses editáveis** e devem ser calibrados com dados reais da Atlas GR antes de decisão de contratação.

## 7. Limitações

- Dados Sinesp refletem alimentação e consolidação das UFs e podem sofrer retificações.
- Ocorrência criminal registrada não equivale a sinistro securitário.
- CNPJ mede população empresarial, não intenção de compra.
- MDF-e mede movimentação observada, não faturamento do cliente.
- White Space exige pesquisa competitiva estruturada; ausência de resultado em busca não é ausência de concorrente.
