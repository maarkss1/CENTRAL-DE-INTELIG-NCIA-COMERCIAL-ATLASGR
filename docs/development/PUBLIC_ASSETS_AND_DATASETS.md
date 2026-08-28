# Política — assets públicos e datasets

**Contexto:** ITEM-05 da remediação de dívida técnica ("Retirar datasets e artefatos pesados de
`public/`"). Este documento fixa a regra que motivou aquela remediação, para não reincidir.

## O mecanismo

Tudo em `public/` é:

1. copiado **verbatim** para `dist/` por `vite build` (nenhum processamento, nenhum hash de
   cache-busting) — ver `vite.config.ts`;
2. servido por `express.static(dist)` em produção (`server.ts`), **sem autenticação** — o
   middleware de auth só cobre `/api/*`.

Ou seja: qualquer arquivo colocado em `public/` vira (a) peso extra em todo build/deploy e (b) um
endpoint HTTP público e não autenticado, para sempre, até alguém remover.

## Onde cada tipo de arquivo pertence

| O que é | Onde vive | Por quê |
|---|---|---|
| Asset que o **navegador** carrega em runtime (logo, ícone, dataset que `fetch()` busca — ex. `public/tools/atlas-market-intelligence/data/*.json`) | `public/` | Só `public/` (ou uma rota de API) chega até o navegador sem passar pelo bundler de JS. |
| Dataset/seed que só o **backend** lê do disco (`fs`, nunca `fetch`) em build, deploy ou seed — ex. `scripts/market-intelligence/load-company-seed.mjs` | `data/<domínio>/` na raiz do repo | Não precisa (nem deveria) ser alcançável por HTTP; ficar em `public/` só custa build/bundle e abre exposição não autenticada sem propósito. |
| Dataset bruto/grande demais para versionar em texto no git, ou que muda com frequência fora do ciclo de release | Object storage (S3/R2 já disponível via `@aws-sdk/client-s3`) ou pipeline dedicado, referenciado por manifest com URL + hash | Git não é um bom lugar para blobs binários grandes que crescem sem limite; `public/`/`data/` servem para datasets pequenos/médios versionados. |
| Segredo, dump de produção, `.env` real, credencial | Nunca no repositório | Ver regras globais de execução — proibido em qualquer lugar do git. |

## Checklist antes de adicionar algo a `public/`

1. O navegador realmente busca esse arquivo via HTTP/`fetch()`? Se não, ele não pertence a
   `public/` — veja a segunda linha da tabela acima.
2. O arquivo tem informação sensível (PII, dado de cliente, credencial, dump de produção)? Se sim,
   nunca vai em `public/` (nem autenticado — `public/` não tem gate de auth).
3. O arquivo é grande (dezenas de KB+) ou parte de um conjunto que cresce (partes numeradas,
   snapshots por competência)? Documente origem, versão e hash num `manifest.json` ao lado dele —
   ver `public/tools/atlas-market-intelligence/data/manifest.json` e
   `data/market-intelligence/company-seed-ribeirao/manifest.json` como exemplos reais já em uso.
4. `npm run check:public-budget` (`scripts/ci/check-public-budget.mjs`, também rodado por
   `.github/workflows/public-assets-budget.yml` em todo PR que toca `public/**`) continua passando?
   Se não, e o crescimento é legítimo, suba o budget na checagem com justificativa explícita no PR
   — nunca silenciosamente.

## Caso real — company-seed-ribeirao (2026-08-25)

Um recorte empresarial sanitizado de CNPJ (~156 mil empresas de Ribeirão Preto, ~56 MB em 16
arquivos `.ndjson.gz` de ~3-4 MB cada — nenhum isoladamente grande, por isso um limite só por
arquivo não teria pego o caso) vivia em
`public/tools/atlas-market-intelligence/data/company-seed-ribeirao/`, mas nunca era buscado pelo
navegador — só `scripts/market-intelligence/load-company-seed.mjs` o lia direto do disco no deploy
(`render.yaml`). Ficar em `public/` custava ~56 MB a mais em todo `npm run build` e expunha os
registros empresariais via HTTP sem autenticação, sem necessidade nenhuma. Movido para
`data/market-intelligence/company-seed-ribeirao/` — ver `data/market-intelligence/README.md` para
detalhe completo (governança, versionamento, rotina de atualização via
`.github/workflows/market-intelligence-cnpj.yml`).

Os demais datasets municipais de Market Intelligence (`municipios_scored.json`,
`senatran_frota_municipios.json`, `mdfe_*`, `rntrc_municipios.json`, `icp_municipios.json`, etc.)
continuam em `public/tools/atlas-market-intelligence/data/` porque o frontend realmente os busca
via `fetch()` em runtime — são o caso legítimo da primeira linha da tabela acima, não dívida
técnica.
