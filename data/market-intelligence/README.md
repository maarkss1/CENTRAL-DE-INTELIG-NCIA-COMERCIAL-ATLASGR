# data/market-intelligence/

Datasets versionados que o **backend** consome diretamente do disco no deploy/seed, mas que o
**frontend nunca busca via HTTP**. Por isso ficam fora de `public/`: nada aqui precisa (nem deveria)
ser servido publicamente, empacotado pelo `vite build` ou exposto sem autenticação.

Ver `public/tools/atlas-market-intelligence/README.md` (seção "Datasets canônicos do frontend")
para os datasets que o navegador realmente busca em runtime — esses continuam em
`public/tools/atlas-market-intelligence/data/` porque `express.static(dist)` é hoje o único
transporte HTTP da aplicação para eles.

## company-seed-ribeirao/

- **O que é:** recorte empresarial sanitizado (CNPJ, razão social, endereço, CNAE, porte —
  **sem telefone/fax/e-mail**, ver `redaction` no manifest) de ~156 mil empresas ativas de
  Ribeirão Preto/SP (código IBGE `3543402`), derivado da base nacional de CNPJ da Receita Federal.
- **Como é consumido:** só por `scripts/market-intelligence/load-company-seed.mjs`, que lê os
  arquivos direto do checkout (`fs`, não `fetch`) e publica o snapshot no PostgreSQL
  (`MarketIntelligenceDataset`/`MarketIntelligenceCompany`) de forma idempotente e transacional.
  O `render.yaml` roda esse script no `startCommand`, antes do servidor subir — nunca via HTTP.
- **Por que não fica em `public/`:** até 2026-08-25 esse diretório vivia em
  `public/tools/atlas-market-intelligence/data/company-seed-ribeirao/`. Como tudo em `public/` é
  copiado verbatim para `dist/` pelo Vite e servido sem autenticação por
  `express.static(dist)` em produção, isso significava ~56 MB de registros empresariais reais
  baixáveis por qualquer pessoa sem login, além de inflar todo `npm run build` sem necessidade —
  o próprio `public/tools/atlas-market-intelligence/README.md` já documentava a intenção
  ("bases brutas CNPJ/RNTRC/fluxo nunca entram no bundle web"), mas o seed sanitizado escapava
  dessa regra por estar no lugar errado. Movido para cá como parte da remediação
  ITEM-05 (retirar datasets/artefatos pesados de `public/`).
- **Versionamento, hash e origem:** `company-seed-ribeirao/manifest.json` já traz
  `sourceUrl`, `sourceVersion`/`competencia`, `pipelineVersion`, `sourceDatasetHash`, `seedHash` e,
  por parte (`parts[].sha256`), o hash de cada `part-*.ndjson.gz`. `load-company-seed.mjs` recusa
  publicar se qualquer hash ou contagem divergir do manifest.
- **Rotina de atualização:** `.github/workflows/market-intelligence-cnpj.yml` roda mensalmente
  (dia 10, após a Receita costumar publicar a competência do mês anterior), regenera o seed com
  `scripts/market-intelligence/build_company_seed.py`, sanitiza e valida (hash, geografia, ausência
  de campos de contato) antes de abrir PR contra `main` — a branch protegida nunca recebe dado
  direto.
- **Consumo local/manual:** `MARKET_INTELLIGENCE_SEED_DIR` (env var) ou primeiro argumento de CLI
  sobrescrevem o diretório padrão em `load-company-seed.mjs`, útil para apontar para um snapshot
  diferente sem mexer no código.

## atlas-market-intelligence-pipeline/

- **O que é:** artefatos internos do pipeline Python de geração do tool estático
  `public/tools/atlas-market-intelligence/` — CSVs brutos de ETL (`raw/`), mocks intermediários
  (`*_mock.json`), o agregado final `municipios_scored.json` e artefatos de pesquisa/censo
  (`concorrentes_gr_*.csv`, `competicao_municipios_completo.json`, `maps_search_results.json`,
  `econodata_search_results.json`, `hub_suitability_sources.json`, `validacao_campo_feedback.csv`
  etc.).
- **Como é consumido:** só pelos próprios scripts do pipeline
  (`etl_anac_aerodromos.py`, `etl_dnit_snv.py`, `etl_ibge_regic.py`, `etl_municipal_aggregate.py`,
  em `public/tools/atlas-market-intelligence/`), executados manualmente/offline — nunca via HTTP,
  nunca por uma rota Express nem componente React da aplicação viva (mesma natureza documentada em
  `src/shared/services/rntrcTerritorialRisk.service.ts`).
- **Por que não fica em `public/`:** reincidência real em 2026-09-02 do mesmo problema do
  `company-seed-ribeirao/` acima — auditoria de todo `fetch(` em
  `index.html`/`dashboard_oportunidade_gr.html`/`lacuna-gr-hub.html` (os 3 únicos HTMLs do tool)
  confirmou que nenhum desses ~19 arquivos (nem `municipios_scored.json`, apesar de citado como
  "canônico" em documentação desatualizada) é buscado pelo navegador; nenhum outro script do
  pipeline os lê de volta como input a partir de outro dataset. Eram só escritos e nunca
  consumidos fora do próprio pipeline offline, inflando `public/` (e todo `npm run build`) sem
  necessidade. Ver `scripts/ci/check-public-budget.mjs` para o histórico completo do budget.
- **O que continua em `public/tools/atlas-market-intelligence/data/`:** todo dataset genuinamente
  buscado pelo navegador (`municipios.json`, `icp_municipios.json`, `rntrc_municipios.json`,
  `concorrentes_por_municipio.json`, `whitespace_municipios.json`, `contas_alvo_nacional.json`,
  `site_mdfe.json`, `site_competicao.json`) — inclusive os que também são lidos pelo pipeline
  Python (`municipios.json`, `icp_municipios.json`, `rntrc_municipios.json`) ou pelo backend
  (`rntrc_municipios.json`/`.metadata.json`, via `rntrcTerritorialRisk.service.ts`). Mover esses
  quebraria o `fetch()` do tool ao vivo — só o que nenhum consumidor real usa foi realocado.

## Budget de tamanho em `public/`

`scripts/ci/check-public-budget.mjs` (rodado por `.github/workflows/public-assets-budget.yml`)
falha o CI se `public/` crescer além do budget combinado ou se um arquivo individual novo exceder o
limite por arquivo — para pegar cedo uma futura reintrodução acidental de dataset pesado em
`public/` em vez de aqui.
