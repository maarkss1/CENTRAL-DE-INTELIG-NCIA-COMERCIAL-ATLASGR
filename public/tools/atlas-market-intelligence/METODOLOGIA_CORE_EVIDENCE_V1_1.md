# METODOLOGIA CORE EVIDENCE v1.1 + FINAL DECISION GATE

**Status:** metodologia exploratória nacional ativa  
**Atualizado em:** 22/08/2026  
**Identificador:** `national-v1.1-core-evidence-final-gate`

## 1. Papel desta metodologia

O Core Evidence existe para responder:

> Quais áreas do Brasil merecem investigação comercial prioritária com os dados nacionais reproduzíveis já disponíveis?

Ele **não** responde sozinho:

> Onde a Atlas GR deve contratar definitivamente o Vendedor 01?

A resposta final exige White Space competitivo, qualidade da cidade-hub e unit economics aprovados.

## 2. Componentes atuais

| Componente | Peso | Fonte | Geografia | Estado |
| --- | ---: | --- | --- | --- |
| ICP / demanda | 35% | Receita Federal CNPJ + taxonomia Atlas | Município | OBSERVADO + regra de modelo |
| Presença logística | 25% | ANTT RNTRC | Município | OBSERVADO |
| Fluxo logístico | 20% | ANTT CIOT | Origem/destino municipal | OBSERVADO como CIOT, proxy documentado de MDF-e |
| Need / risco | 20% | MJSP Sinesp VDE | UF | PROXY_UF |
| White Space | 0% | Censo competitivo | Município/território | NAO_DISPONIVEL enquanto parcial |
| Eficiência territorial | 0% | Malha/tempo/custo | Território | NAO_DISPONIVEL |

Componentes com peso zero **não recebem valor zero**. Permanecem indisponíveis até possuírem evidência suficiente.

## 3. Score bruto e ajustado

```text
CoreRaw = Σ(componentScore × weight)
CoreAdjusted = CoreRaw × ConfidenceAggregate
```

Se um componente obrigatório da versão Core não existe, o score fica bloqueado.

A confiança nunca transforma ausência de evidência em evidência positiva.

## 4. Need v1

Need v1 deriva do percentil de risco Sinesp já disponível por UF, carregando disponibilidade `PROXY` e confiança reduzida.

Portanto:

- não existe alegação de risco municipal observado;
- municípios da mesma UF compartilham o proxy quando a fonte oficial não oferece granularidade mais fina;
- a incerteza entra explicitamente no score ajustado.

## 5. White Space continua bloqueado

```text
if competition.censusStatus != CENSO_COMPLETO:
    whiteSpace = null
```

Ausência de concorrentes encontrados não equivale a concorrência zero.

## 6. Territory Optimizer exploratório

O domínio gera candidatos em raios:

```text
100 / 150 / 200 / 250 / 300 / 400 km
```

A publicação Core conservadora limita a 200 km enquanto não houver modelo aprovado de conectividade real.

Para múltiplos vendedores, o otimizador penaliza sobreposição e maximiza valor incremental.

### Limitação da cidade-base

O snapshot atual demonstrou que uma cidade pode aparecer como base por estar geometricamente bem posicionada dentro de um grande mercado, sem ser o melhor hub comercial para residência ou início de rota.

Por isso a versão final precisa incorporar `Hub Suitability` com:

```text
materialidade própria da base
+ RNTRC/frota próprios
+ centralidade comercial
+ malha rodoviária
+ tempo de deslocamento
+ aeroportos quando relevantes
+ custo operacional
+ cidades satélites
```

Até essa camada existir, a cidade-base Core é um **candidato geométrico/comercial**, não recomendação definitiva de lotação.

## 7. Dois gates distintos

### Exploration Ready

Existe quando ICP + RNTRC + fluxo + Need possuem cobertura suficiente para ordenar áreas de investigação.

### Final Decision Ready

Somente existe quando, além do Core:

```text
concorrência dos finalistas = CENSO_COMPLETO
+ White Space disponível
+ Hub Suitability validado
+ SAM disponível
+ MRR potencial disponível
+ break-even disponível
+ QA aprovado
```

No contrato atual, `manifest.decisionReady` representa **somente Final Decision Ready**.

## 8. Estado em 22/08/2026

```text
Exploration Ready: SIM
Final Decision Ready: NÃO
```

Bloqueios finais:

- concorrência nacional parcial;
- White Space final indisponível;
- Hub Suitability incompleto;
- SAM/MRR/break-even territorial sem regras/premissas Atlas aprovadas.

## 9. Visão materializada

O Quality Gate materializa `data/territorios.json` a partir dos snapshots nacionais para evitar baixar `municipios_scored.json` no caminho crítico da Board.

Essa materialização é otimização de entrega, não autorização executiva.

Interpretação correta:

> Top candidatos de Core Evidence para investigação.

Interpretação proibida enquanto `decisionReady=false`:

> Ordem final de contratação Atlas GR.

## 10. Fail-closed em runtime

A aplicação revalida o gate mesmo que um manifest antigo declare prontidão. A decisão final volta a `false` quando faltam evidências obrigatórias, incluindo:

- CIOT origem/destino;
- territórios válidos;
- dataset competitivo final;
- `CENSO_COMPLETO` comparável nos finalistas;
- SAM;
- MRR potencial;
- break-even.

Assim um snapshot parcial não consegue deixar a interface artificialmente verde.

## 11. Unit economics

Ticket, margem, salário, encargos, win rate, churn e demais parâmetros econômicos não entram como números inventados.

Eles são `PREMISSA_EDITAVEL` ou calibração interna aprovada. Enquanto não preenchidos, `potentialMrr`, `breakEvenContracts` e métricas relacionadas permanecem `null`.

## 12. Próxima versão metodológica

A v1.2/v2 deve ser liberada somente após avanços materiais como:

1. censo competitivo comparável dos finalistas;
2. White Space recalculado;
3. Hub Suitability com conectividade real;
4. análise de sensibilidade dos pesos finais;
5. calibração de ICP/pesos contra ganhos e perdas Atlas;
6. economics padronizado para ROI territorial.
