# PLANO NACIONAL DE EXPANSÃO - Atlas GR

**Status atual:** `DECISÃO BLOQUEADA POR DADOS`  
**Regra:** este documento é gerado/atualizado a partir dos resultados auditáveis da plataforma. Ele não promove a triagem histórica dos 16 clusters a ranking nacional.

## Onde contratar agora?

No estado atual da nova arquitetura, **NÃO DISPONÍVEL**.

Ainda não é metodologicamente válido declarar:

```text
VENDEDOR 01 = cidade X
VENDEDOR 02 = cidade Y
VENDEDOR 03 = cidade Z
```

porque a recomendação final depende de camadas que ainda estão em processamento ou incompletas, especialmente censo competitivo, MDF-e nacional, ICP/CNPJ nacional e premissas comerciais Atlas.

Inventar uma ordem agora violaria a regra central do sistema.

---

## Respostas às 10 perguntas executivas no estado atual

### 1. Qual é o melhor território brasileiro para o primeiro vendedor externo Atlas GR?

**NÃO DISPONÍVEL.**

Datasets bloqueadores:

- ICP/CNPJ nacional agregado;
- MDF-e nacional agregado;
- Need/risco nacional consolidado;
- censo competitivo completo dos territórios finalistas;
- Territory Optimizer executado sobre o universo nacional.

### 2. Por que ele venceu?

**NÃO DISPONÍVEL**, pois não há vencedor liberado.

Quando houver, a explicação será composta por evidências de:

```text
demanda
+ estoque logístico RNTRC
+ fluxo MDF-e
+ Need Atlas
+ White Space competitivo
+ eficiência territorial
+ confiança
```

### 3. Qual o segundo e terceiro?

**NÃO DISPONÍVEL.** Mesmos bloqueadores da pergunta 1.

### 4. Quantas contas ICP existem no território?

**NÃO DISPONÍVEL** até publicação do agregado CNPJ/ICP nacional e execução do território.

### 5. Qual o SAM?

**NÃO DISPONÍVEL.** Depende da população ICP observada, regras de elegibilidade/portfólio e território calculado.

### 6. Qual o MRR potencial?

**NÃO DISPONÍVEL.** Além do SAM, exige ticket, penetração, mix e horizonte como `PREMISSA EDITÁVEL` ou fonte interna Atlas validada.

### 7. Quantos contratos pagam o vendedor?

**NÃO DISPONÍVEL como número Atlas.** O simulador já contém a fórmula, mas salário, encargos, benefícios, veículo, combustível, hospedagem, pedágio, comissão, ferramentas, administrativo, ticket e margem não são preenchidos com números inventados.

### 8. Qual pipeline ele precisa gerar?

**NÃO DISPONÍVEL como número Atlas.** Depende de break-even e Win Rate validado. Sales Cycle e ramp-up também serão incorporados ao cenário final.

### 9. Quais municípios pertencem ao território?

**NÃO DISPONÍVEL** até o Territory Optimizer calcular cidade-base + raio e publicar `municipalityCodes`.

### 10. Qual o nível de confiança da recomendação?

**BLOQUEADO.** A confiança competitiva é insuficiente enquanto a concorrência estiver em `PESQUISA_PARCIAL`.

---

## Hipóteses históricas que serão reavaliadas

Os 16 clusters abaixo entram no algoritmo apenas como **hipóteses de validação**, sem bônus por terem sido escolhidos anteriormente:

1. Luís Eduardo Magalhães / Barreiras;
2. Balsas;
3. Rio Verde;
4. Sinop / Sorriso;
5. Feira de Santana;
6. Chapecó;
7. Dourados;
8. Suape / Cabo;
9. Cascavel;
10. Rondonópolis;
11. Uberlândia;
12. Marabá / Parauapebas;
13. Campo Grande / Três Lagoas;
14. Goiânia / Anápolis;
15. Fortaleza / Maracanaú;
16. Barcarena / Santarém.

O algoritmo nacional pode encontrar polos melhores fora desta lista.

---

## Estrutura da saída final

Quando `decisionReady=true`, este documento deve passar a conter, no mínimo:

```text
VENDEDOR 01
Cidade-base:
UF:
Raio recomendado:
Municípios:
Contas ICP:
Tier A:
Tier B:
Tier C:
ETCs:
TACs:
Frota:
Fluxo MDF-e:
Need Atlas:
Concorrentes / cobertura:
White Space:
Opportunity Score bruto:
Opportunity Score ajustado:
SAM:
SOM:
MRR potencial:
Custo vendedor/mês:
Break-even contratos:
Pipeline necessário:
Payback:
ROI 12 meses:
ROI 24 meses:
Confiança:
Principal motivo:
Principal risco:
Evidências:
```

E repetir para a ordem nacional de contratação.

---

## Cenários de headcount obrigatórios

O Territory Optimizer deve produzir planos para:

```text
1 vendedor
2 vendedores
3 vendedores
5 vendedores
10 vendedores
20 vendedores
```

Cada cenário deve minimizar sobreposição e mostrar cobertura incremental, não apenas pegar os primeiros N municípios do ranking individual.

---

## Gate para liberar este plano

O plano só sai de `DECISÃO BLOQUEADA` quando:

- [ ] geografia nacional canônica validada;
- [ ] RNTRC processado e com competência explícita;
- [ ] frota processada ou limitação formalmente aceita na versão metodológica;
- [ ] CNPJ/ICP nacional processado;
- [ ] MDF-e nacional processado;
- [ ] Need/risco processado com proxies identificados;
- [ ] censo competitivo `CENSO_COMPLETO` nos finalistas;
- [ ] White Space recalculado;
- [ ] análise de sensibilidade do Opportunity Score concluída;
- [ ] Territory Optimizer executado para todos os cenários;
- [ ] premissas comerciais Atlas preenchidas para cálculo econômico;
- [ ] QA e evidências aprovados.

Até esse gate ser cumprido, a plataforma tem a obrigação de dizer **“ainda não sabemos com confiança suficiente”** em vez de produzir precisão fictícia.