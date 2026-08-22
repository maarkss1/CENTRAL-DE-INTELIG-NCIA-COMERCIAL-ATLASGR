# PLANO NACIONAL DE EXPANSÃO — Atlas GR

**Atualizado em:** 22/08/2026  
**Status executivo:** `DECISÃO FINAL BLOQUEADA`  
**Ranking Core Evidence:** disponível apenas para investigação  
**Regra:** nenhum território recebe a etiqueta “Vendedor 01” antes de White Space competitivo e economics passarem pelo gate final.

---

# Onde contratar agora?

## Resposta executiva

**AINDA NÃO DISPONÍVEL COM CONFIANÇA SUFICIENTE.**

Hoje a plataforma já possui cobertura nacional reproduzível para:

- geografia IBGE;
- RNTRC jul/2026;
- frota municipal SENATRAN jul/2026;
- CNPJ/ICP ago/2026;
- fluxo CIOT jul/2026 como proxy documentado de MDF-e;
- risco Sinesp jan-jul/2026 como `PROXY_UF`;
- Territory Optimizer Core Evidence.

Os bloqueios que permanecem são mais específicos do que nas versões anteriores:

1. **concorrência nacional ainda `PARCIAL`;**
2. **finalistas sem `CENSO_COMPLETO` comparável;**
3. **White Space final indisponível;**
4. **cidade-hub ainda sem malha/tempo/aeroporto modelados;**
5. **SAM/MRR/break-even territoriais ainda dependem de regras e premissas Atlas aprovadas;**
6. **sensibilidade final do score com White Space ainda não concluída.**

Portanto, os territórios materializados em `data/territorios.json` são **candidatos Core Evidence**, não uma ordem de contratação.

---

# Diagnóstico do ranking Core atual

O snapshot Core Evidence atual revelou um problema útil para a evolução do modelo: bases como Guarujá/SP, Miracatu/SP e Ilhabela/SP aparecem entre os primeiros candidatos porque o algoritmo maximiza massa e score dentro de raios geométricos.

Isso não significa que essas cidades sejam boas bases residenciais/comerciais para um vendedor.

Esse resultado prova que ainda falta um `Hub Suitability Score` com:

```text
materialidade da própria cidade-base
+ RNTRC/frota próprios
+ centralidade real
+ rodovias e tempo de deslocamento
+ aeroportos quando relevantes
+ custo operacional
+ penalização de base residual dentro de megamercado vizinho
```

Até essa camada ser validada, o ranking Core serve para localizar **áreas de massa comercial**, não para escolher automaticamente onde o vendedor deve morar.

---

# Respostas às 10 perguntas executivas

## 1. Qual é o melhor território brasileiro para o primeiro vendedor externo Atlas GR?

**NÃO DISPONÍVEL COMO DECISÃO FINAL.**

Bloqueadores atuais:

```text
censo competitivo dos finalistas
+ White Space
+ Hub Suitability
+ economics final
```

## 2. Por que ele venceu?

**NÃO APLICÁVEL ainda.**

Quando liberado, o vencedor deverá apresentar simultaneamente:

```text
alta demanda ICP
+ forte presença/frota logística
+ fluxo elevado
+ Need relevante
+ baixa pressão competitiva comprovada
+ hub operacional eficiente
+ economia positiva
+ confiança suficiente
```

## 3. Qual o segundo e terceiro?

**NÃO DISPONÍVEL COMO ORDEM FINAL.**

A plataforma pode exibir candidatos exploratórios, mas não rotulá-los Vendedor 02/03 enquanto o mesmo gate não for atendido.

## 4. Quantas contas ICP existem no território?

**Disponível para os candidatos Core** como população ICP modelada no raio.

**Atenção:** esse número não é SAM e ainda não prova capacidade econômica individual.

## 5. Qual o SAM?

**NÃO DISPONÍVEL.**

Precisa de regra explícita de atendibilidade Atlas, Product Fit e elegibilidade econômica.

## 6. Qual o MRR potencial?

**NÃO DISPONÍVEL como fato.**

Será calculado como cenário a partir de:

```text
SAM
× penetração
× ticket MRR
× mix de produto quando aplicável
```

Ticket e penetração permanecem `PREMISSA_EDITAVEL` ou calibração interna aprovada.

## 7. Quantos contratos pagam o vendedor?

**NÃO DISPONÍVEL como número Atlas aprovado.**

O simulador já implementa a fórmula de break-even, mas a resposta só é liberada depois de preencher custo total, ticket e margem.

## 8. Qual pipeline ele precisa gerar?

**NÃO DISPONÍVEL como número final.**

Depende de:

```text
break-even contratos
÷ win rate
× ticket/pipeline necessário
```

Sales Cycle e ramp-up também participam do cenário.

## 9. Quais municípios pertencem ao território?

**Disponível para os candidatos Core** em `territorios.json` por `municipalityCodes`.

A composição poderá mudar quando Hub Suitability e White Space entrarem na otimização final.

## 10. Qual o nível de confiança da recomendação?

**BLOQUEADO para recomendação final.**

Existe confiança alta em vários componentes Core, mas isso não equivale a confiança alta na decisão de contratação porque concorrência e economics continuam incompletos.

---

# Estado das ondas

| Onda | Estado em 22/08/2026 | Observação |
| --- | --- | --- |
| 0 — Backup/auditoria | CONCLUÍDA nesta rodada | Auditoria atualizada sobre `main` atual |
| 1 — Arquitetura/UX/identidade | PARCIAL AVANÇADA | React nativo; mapa moderno e comparador ainda pendentes |
| 2 — RNTRC/frota | CONCLUÍDA PARA SNAPSHOT ATUAL | RNTRC jul/2026 + SENATRAN municipal jul/2026 |
| 3 — CNPJ/ICP | CONCLUÍDA PARA SNAPSHOT ATUAL | ago/2026; taxonomia ainda requer calibração comercial |
| 4 — MDF-e/fluxo | PARCIAL COM PROXY | CIOT jul/2026 reproduzível; MDF-e literal não publicado no dataset atual |
| 5 — Need/risco | IMPLEMENTADA COM PROXY | Sinesp jan-jul/2026 em nível UF |
| 6 — Concorrência | BLOQUEADORA | censo nacional parcial |
| 7 — White Space/Opportunity | PARCIAL | Core Evidence disponível; White Space final bloqueado |
| 8 — Territory Optimizer | PARCIAL | cobertura/overlap existem; Hub Suitability incompleto |
| 9 — TAM/SAM/SOM/ROI | PARCIAL | simulador existe; premissas finais ausentes |
| 10 — Plano de contratação | BLOQUEADO | não há Vendedor 01 final |
| 11 — QA/performance/docs | EM EXECUÇÃO | PR #235 fecha semântica/gates e documentação |

---

# Revalidação dos 16 clusters históricos

Continuam como **hipóteses**, sem bônus:

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

A plataforma nacional pode promover ou derrubar qualquer um deles depois dos gates finais.

---

# Estrutura obrigatória da saída quando liberada

```text
VENDEDOR 01
Cidade-base:
UF:
Raio recomendado:
Municípios:
Contas ICP:
Tier A/B/C:
ETCs/TACs/CTCs:
Frota:
Fluxo:
Need Atlas:
Concorrência:
White Space:
Core Evidence Score:
Final Opportunity Score:
Hub Suitability:
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

---

# Gate de liberação

A ordem nacional só pode ser publicada quando:

- [x] geografia canônica validada;
- [x] RNTRC com competência explícita;
- [x] frota municipal oficial publicada;
- [x] CNPJ/ICP nacional processado;
- [x] fluxo nacional reproduzível publicado, com CIOT explicitamente classificado como proxy de MDF-e;
- [x] risco processado com `PROXY_UF` explícito;
- [ ] censo competitivo comparável e `CENSO_COMPLETO` nos finalistas;
- [ ] White Space recalculado;
- [ ] Hub Suitability com conectividade real validado;
- [ ] análise de sensibilidade final concluída;
- [x] Territory Optimizer executável para múltiplos headcounts;
- [ ] SAM/SOM e premissas econômicas Atlas aprovadas;
- [ ] QA automatizado + E2E visual final aprovado.

Até que os itens restantes sejam concluídos, a resposta correta do sistema é:

> **Temos evidência para priorizar onde investigar, mas ainda não temos evidência suficiente para autorizar onde contratar.**
