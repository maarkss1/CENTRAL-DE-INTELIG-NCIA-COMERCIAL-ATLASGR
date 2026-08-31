# AtlasGR-Fit-Brasil — Auditoria de semântica, cobertura e uso decisório

**Data da auditoria:** 2026-08-28  
**Artefato auditado:** `AtlasGR-Fit-Brasil.rar`  
**SHA-256:** `1da592097d1b1fac51491afbfa1fdde16af4683003e496093c1230feb427cf6d`  
**Tamanho:** 73.624.378 bytes  
**Status recomendado:** `CANDIDATE_UNIVERSE_SETORIAL_RNTRC / NÃO É ICP FINAL`

## 1. O que existe no pacote

O RAR contém 5.019 entradas: 28 diretórios e 4.991 arquivos HTML. Há um `index.html` nacional e 4.990 relatórios municipais distribuídos pelas 27 UFs. Os HTMLs são autocontidos e embutem os registros empresariais em `const DATA=[...]`.

A geração ocorreu entre `2026-08-28T18:26:05-03:00` e `2026-08-28T18:44:06-03:00`.

## 2. Cobertura e contagens auditadas

| Métrica | Valor |
|---|---:|
| UFs | 27 |
| Municípios com relatório | 4.990 |
| Referência nacional IBGE usada pela plataforma | 5.571 |
| Municípios sem relatório no pacote | 581 |
| CNPJs/estabelecimentos únicos | 289.086 |
| Duplicidades de CNPJ entre relatórios | 0 |
| `FIT_ESTRUTURAL_CONFIRMADO` | 246.008 |
| `FIT_SETORIAL_POTENCIAL` | 43.078 |
| RNTRC `ATIVO` | 246.008 |
| Evidência de CNAE interestadual | 193.765 |
| CNPJs inválidos | 0 |

Os 4.990 relatórios municipais têm pelo menos uma empresa no universo setorial; por isso a ausência de relatório em 581 municípios deve ser interpretada como ausência no universo gerado, não como ausência de atividade econômica geral.

## 3. Semântica real do modelo

O gerador do repositório usa `icp_taxonomy.v1.json`, cuja taxonomia está explicitamente marcada `REGRA_DE_MODELO_NAO_CALIBRADA`.

A regra de entrada do pacote é:

1. empresa ativa na Receita Federal;
2. CNAE principal ou secundário bate com os prefixos do Tier A setorial;
3. cruzamento com RNTRC por CNPJ;
4. mensagem/PIC derivado de `(cnaeFit, rntrcMatch)` a partir do relatório de referência de Campinas;
5. bucket comercial derivado de RNTRC + disponibilidade da mensagem.

Isso é um universo candidato setorial com evidência RNTRC. Não é, sozinho, comprovação de fit econômico, tamanho de frota, intensidade operacional, dor, risco, timing, contrato ou Product Fit.

## 4. Inconsistência crítica encontrada

O CLI `--only-fit` não filtra por `icpFit == FIT_ESTRUTURAL_CONFIRMADO`.

Ele filtra por `_bucket == wave1`.

O bucket `wave1` aceita RNTRC `ATIVO` **ou `PENDENTE`**, desde que exista uma mensagem comercial mapeada. Em seguida, o índice chama a coluna de `Fit confirmado (wave1)`.

No pacote auditado, isso produz:

- 246.008 registros realmente marcados `FIT_ESTRUTURAL_CONFIRMADO`;
- 43.078 registros marcados `FIT_SETORIAL_POTENCIAL`;
- todos os 289.086 registros presentes no pacote `--only-fit` porque todos caíram em `wave1`.

Portanto, **289.086 não deve ser publicado como quantidade de ICP confirmado**. É a quantidade do bucket wave1 exportado por esta execução.

## 5. Outro risco semântico: `fitAlto = TIER_A_MODELADO`

Todos os 289.086 registros têm `fitAlto = TIER_A_MODELADO`.

Entretanto, o próprio relatório municipal declara que ainda precisam de enriquecimento sinais como frota, rotas/viagens/terceiros, volume, carga de alto valor, sinistro/seguro, processos de carga, vagas, troca de liderança, solução atual, dor e timing.

Logo, `TIER_A_MODELADO` deve ser lido como **Tier A setorial da taxonomia não calibrada**, não como conta Tier A final ou prioridade comercial validada.

## 6. Distribuições nacionais

### Evidência CNAE

- CNAE principal: 215.671
- CNAE secundário: 73.415

### Porte Receita

- Microempresa: 220.442
- EPP: 44.138
- Demais: 24.506

### RNTRC

- ETC: 288.571
- CTC: 515

### PIC gerado

- `PIC_1_VALIDAR_EXPANSAO`: 167.310
- `PIC_1_VALIDAR_COMPLEXIDADE`: 78.698
- `PIC_2_INVESTIGAR_COMPLIANCE`: 43.078

Esses PICs são regras categóricas derivadas de CNAE/RNTRC e devem continuar rotulados como hipótese de validação, não como dor observada.

## 7. CNAEs que dominam o pacote

| CNAE fit | Registros |
|---|---:|
| 4930202 — transporte rodoviário interestadual/internacional | 193.765 |
| 4930201 — transporte rodoviário municipal | 78.266 |
| 4930203 — produtos perigosos | 12.382 |
| 4930204 — mudanças | 3.434 |
| 5229002 — reboque | 745 |
| Demais CNAEs logísticos da taxonomia | 494 |

## 8. Hipóteses históricas de clusters — leitura do pacote

Estes números servem apenas como massa do universo candidato do arquivo e não reordenam territórios sem Hub Suitability, concorrência/White Space e economics.

| Cluster histórico | Universo candidato | Estrutural confirmado | Potencial | CNAE interestadual |
|---|---:|---:|---:|---:|
| Luís Eduardo Magalhães/Barreiras | 1.227 | 1.020 | 207 | 892 |
| Balsas | 379 | 319 | 60 | 209 |
| Rio Verde | 746 | 615 | 131 | 436 |
| Sinop/Sorriso | 1.796 | 1.545 | 251 | 1.408 |
| Feira de Santana | 1.197 | 1.040 | 157 | 813 |
| Chapecó | 1.024 | 854 | 170 | 777 |
| Dourados | 677 | 538 | 139 | 427 |
| Suape/Cabo | 273 | 243 | 30 | 165 |
| Cascavel | 1.268 | 1.108 | 160 | 892 |
| Rondonópolis | 1.403 | 1.147 | 256 | 1.098 |
| Uberlândia | 2.356 | 2.029 | 327 | 1.520 |
| Marabá/Parauapebas | 863 | 722 | 141 | 454 |
| Campo Grande/Três Lagoas | 2.066 | 1.720 | 346 | 1.291 |
| Goiânia/Anápolis | 3.372 | 2.750 | 622 | 2.148 |
| Fortaleza/Maracanaú | 1.711 | 1.492 | 219 | 984 |
| Barcarena/Santarém | 430 | 368 | 62 | 216 |

## 9. Uso permitido na plataforma

O pacote pode alimentar:

- universo candidato municipal de contas Tier A **setorial**;
- presença de RNTRC por CNPJ;
- evidência CNAE principal/secundário;
- massa de transportadoras/operadores por município;
- pesquisa de contas para enriquecimento posterior;
- camada de Account Universe / Product-Fit Evidence.

Não pode, sozinho, alimentar como verdade final:

- ICP Tier A/B/C decisório;
- frota acima de qualquer threshold;
- MRR potencial;
- Product Fit validado;
- White Space;
- Need Score;
- recomendação de contratação de vendedor;
- TAM/SAM/SOM financeiro.

## 10. Correção recomendada no gerador

1. Renomear semanticamente `--only-fit` para `--only-wave1` ou manter alias com aviso de depreciação.
2. Trocar `Fit confirmado (wave1)` por `Bucket wave1` no índice.
3. Não descrever registros RNTRC `PENDENTE` como fit estrutural confirmado.
4. Substituir `fitAlto = TIER_A_MODELADO` por um campo explícito como `tierSetorial = A` + `calibrationStatus = NAO_CALIBRADO`.
5. Manter `icpFit` separado do bucket comercial.
6. Adicionar teste de regressão provando que `wave1 != FIT_ESTRUTURAL_CONFIRMADO` quando RNTRC está pendente.
7. Publicar um manifest do pacote com hashes, competências e definições dos campos.

## 11. Decisão desta auditoria

**Não descartar o RAR.** Ele é valioso e contém uma base nacional consistente de 289.086 CNPJs únicos, com boa rastreabilidade cadastral e RNTRC.

**Não promovê-lo a ICP final.** Deve entrar como camada intermediária de universo candidato/evidência setorial e ser cruzado com os sinais já exigidos pelo Market Intelligence: frota, fluxo, risco, Hub Suitability, concorrência/White Space e economics.
