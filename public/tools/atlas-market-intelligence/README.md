# Atlas GR National Market & Territory Intelligence System

Plataforma de geointeligência, inteligência de mercado e planejamento territorial para responder com evidência:

> Onde a Atlas GR deve contratar o próximo vendedor consultor externo, qual território ele deve cobrir, quais contas existem nesse território e qual capacidade econômica a operação pode gerar?

## Estado em 22/08/2026

A plataforma já saiu da fase de HTML de triagem e opera como feature nativa React/TypeScript da Central de Inteligência Comercial.

### Pronto para análise exploratória nacional

- geografia IBGE;
- RNTRC jul/2026;
- frota municipal SENATRAN jul/2026;
- CNPJ/ICP ago/2026;
- fluxo CIOT jul/2026 como proxy documentado de MDF-e;
- risco Sinesp jan-jul/2026 como `PROXY_UF`;
- Core Evidence nacional;
- Territory Optimizer e cenários de headcount;
- simulador econômico sem defaults inventados;
- consulta empresarial separada do CRM.

### Ainda bloqueado para ordem final de contratação

- censo competitivo nacional está `PARCIAL`;
- White Space final está `NAO_DISPONIVEL` sem `CENSO_COMPLETO`;
- Hub Suitability ainda precisa de malha/tempo/aeroportos/custo operacional;
- SAM/MRR/break-even final dependem de regras e premissas Atlas aprovadas;
- sensibilidade final com White Space ainda não foi liberada.

`data/manifest.json` usa `decisionReady=false` enquanto esses gates permanecerem abertos.

Os 16 clusters históricos são `HIPOTESES_DE_TRIAGEM`, nunca vencedores pré-definidos.

---

## Arquitetura

```text
fontes oficiais/primárias
→ snapshot + competência + hash
→ cache bruto fora do bundle
→ ETL Python
→ código IBGE
→ agregações municipais/corredores/contas
→ disponibilidade + confiança + evidência
→ scores derivados
→ datasets compactos/materializados
→ React + TypeScript
→ Board / Territórios / Economics / Empresas
```

A rota Market Intelligence é nativa React. O HTML histórico foi preservado apenas como baseline funcional.

---

## Governança obrigatória

```text
OBSERVADO
ESTIMADO
PROXY
PREMISSA_EDITAVEL
NAO_DISPONIVEL
```

Concorrência:

```text
NAO_PESQUISADO
PESQUISA_PARCIAL
CENSO_COMPLETO
```

Somente `CENSO_COMPLETO` libera White Space competitivo como indicador decisório.

---

## Separação essencial

```text
Core Evidence ≠ White Space ≠ recomendação final
```

O Core Evidence atual usa dados nacionais reproduzíveis para **priorizar investigação**. Ele não converte concorrência ausente em zero e não autoriza “Vendedor 01”.

A Board executiva final é fail-closed em runtime.

---

## Datasets canônicos do frontend

Entrada:

`public/tools/atlas-market-intelligence/data/manifest.json`

Derivados atuais:

```text
municipios.json
municipios_scored.json
icp_municipios.json
rntrc_municipios.json
senatran_frota_municipios.json
mdfe_origens_municipios.json
mdfe_destinos_municipios.json
mdfe_corredores.json
risco_uf.json
territorios.json
```

Bases brutas CNPJ/RNTRC/fluxo nunca entram no bundle web.

---

## ETLs principais

### RNTRC

`etl_rntrc_atlas.py`

- descobre snapshot oficial;
- baixa para cache;
- registra SHA-256;
- cruza município/UF com IBGE;
- agrega ETC/TAC/CTC;
- publica somente derivado municipal.

### Frota

Fonte ativa: SENATRAN / frota por município e tipo.

A camada antiga de `RNTRC-Dados de Veículos` foi supersedida para uso municipal porque não fornecia a granularidade necessária.

### CNPJ / ICP

`etl_cnpj_atlas.py`

- processa bases oficiais em streaming;
- usa intermediário local, sem jogar milhões de registros no navegador;
- considera situação ativa;
- aplica CNAE principal/secundários, porte e taxonomia ICP versionada;
- publica agregado municipal e, quando solicitado, catálogo empresarial particionado.

A taxonomia `1.0.0` ainda precisa ser calibrada com ganhos/perdas e economics reais Atlas.

### Fluxo

`etl_mdfe_atlas.py`

A fonte reproduzível atual é CIOT. Ela é tratada como **proxy documentado de fluxo MDF-e**, não como contagem literal de manifestos. `manifests`, toneladas e TKU permanecem `null` quando não observados.

### Risco

Sinesp VDE processado em nível UF para os indicadores usados. A propagação municipal é `PROXY_UF`, com confiança reduzida.

---

## Frontend

Feature:

```text
src/features/market-intelligence/
  components/
  domain/
  server/
  marketIntelligence.data.ts
  marketIntelligence.api.ts
```

Já implementado:

- Board View com gate final;
- Saúde dos Dados;
- territórios materializados;
- cenários econômicos;
- ramp-up;
- consulta empresarial real e separada do CRM;
- contratos tipados de evidência/confiança;
- Territory Optimizer com raios 100/150/200/250/300/400 km;
- cenários 1/2/3/5/10/20 vendedores;
- penalização de overlap.

Ainda em evolução:

- mapa nacional nativo com clusters/heatmap/layers;
- perfil municipal completo;
- comparador de até quatro territórios;
- Hub Suitability;
- censo competitivo nacional;
- Product Fit;
- exportações executivas completas.

---

## QA

Comandos disponíveis:

```bash
npm run lint:check
npm run typecheck:market-intelligence
npm run test:market-intelligence
npm run build
```

Quality Gate específico:

`.github/workflows/market-intelligence-ci.yml`

Também existem fixtures Python e E2E Playwright da rota real.

A plataforma não deve ser marcada como concluída apenas porque o Core Evidence possui ranking. A conclusão exige os gates de dados, economics e validação visual descritos em `PLANO_EXPANSAO_ATLAS.md`.

---

## Documentação obrigatória

- `AUDITORIA_ESTADO_ATUAL.md`
- `ARQUITETURA.md`
- `METODOLOGIA.md`
- `DATA_LINEAGE.md`
- `FONTES.md`
- `DICIONARIO_DADOS.md`
- `CHANGELOG.md`
- `PLANO_EXPANSAO_ATLAS.md`

---

## Segurança

- sem secrets/tokens no Market Intelligence;
- bruto fora de `public/`;
- catálogo empresarial separado do CRM;
- nenhuma necessidade de dados pessoais de sócios;
- hashes/evidências permitem auditoria sem republicar bases gigantes.

---

## Antes de decidir uma contratação

Consulte `data/manifest.json` e `PLANO_EXPANSAO_ATLAS.md`.

```text
if decisionReady == false:
    candidatos Core Evidence podem ser investigados
    Vendedor 01 não pode ser declarado
```
