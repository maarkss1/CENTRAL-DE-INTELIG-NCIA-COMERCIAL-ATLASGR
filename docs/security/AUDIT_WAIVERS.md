# Waivers de dependency audit (npm audit)

Criado na Fase Final 1 (Gate Único de Release, ver `.agents/runs/final-fase-1.md`).

## Regra

`npm audit --audit-level=high` roda como gate obrigatório (sem `continue-on-error`) em todo
workflow que publica artefato (`ci.yml`, `production.yaml`, `cd-homolog.yml`). Um achado
`HIGH`/`CRITICAL` **bloqueia o pipeline** por padrão.

Se um achado `HIGH`/`CRITICAL` precisar ser aceito temporariamente (ex.: sem fix disponível, ou fix
é breaking change que exige uma onda própria de migração), o waiver precisa:

1. Ser registrado numa entrada nova neste arquivo (não só num comentário de workflow).
2. Ter dono, motivo e data de reavaliação.
3. Ser aprovado pelo Agente 00 (ou pelo dono do repositório) antes de voltar a usar
   `continue-on-error: true` no workflow — e o `continue-on-error` deve citar esta entrada por
   título/data, não ficar solto sem referência.
4. Nunca cobrir mais do que o(s) advisory ID(s) específico(s) listado(s) — não é uma licença para
   ignorar auditoria em geral.

## Waivers ativos

Nenhum. Em 2026-08-16, `npm audit --audit-level=high` retorna **0 vulnerabilidades high/critical**
neste repositório — o gate roda sem exceção.

## Débito conhecido, fora do escopo deste waiver (severidade abaixo do gate)

- `uuid` (via `exceljs`, dependência direta) — `GHSA-w5hq-g745-h8pq`, severidade **moderate**, fix
  disponível só via upgrade major (`exceljs@4`, breaking change). Não bloqueia
  `--audit-level=high` porque é moderate, não high/critical — não precisa de waiver formal, mas
  segue rastreado em `.agents/completion/01-bloqueadores.md` para decisão de quando migrar
  `exceljs`.

## Histórico

- 2026-08-16 — Fase Final 1: removido `continue-on-error: true` do step de audit em `ci.yml` e
  `production.yaml`. O comentário anterior ("known issue with better-auth pending upstream
  resolution") já não correspondia a nenhum achado real no momento da remoção — o audit já passava
  limpo sozinho, e o `continue-on-error` estava mascarando isso em vez de proteger contra algo.
