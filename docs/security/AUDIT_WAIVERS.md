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

### `GHSA-ggr8-5vv4-36mx` — `deepmerge-ts` (stack exhaustion) via `@prisma/config`/`prisma`

- **Advisory:** https://github.com/advisories/GHSA-ggr8-5vv4-36mx — `deepmerge-ts <8.0.0` tem
  esgotamento de pilha (DoS) ao mesclar grafos de objeto recursivos.
- **Severidade reportada pelo `npm audit`:** high (propaga para `@prisma/config` e `prisma`, ambos
  marcados high por dependerem transitivamente de `deepmerge-ts`).
- **Cadeia:** `prisma@7.8.0` → `@prisma/config@7.8.0` → `deepmerge-ts<8.0.0`.
- **Por que é aceito temporariamente:** o único fix automático (`npm audit fix --force`) rebaixa
  `prisma`/`@prisma/config`/`@prisma/client` de `7.8.0` para `6.12.0` — downgrade major do ORM que
  todo o schema, as migrations e o RLS multi-tenant do projeto já assumem como Prisma 7 (ver
  handoffs de correção de `AsyncLocalStorage` sob Prisma 7). Reverter a major é um projeto próprio de
  migração, não uma correção pontual de CI. `deepmerge-ts` é usado pelo carregamento de
  `prisma.config.ts` (ferramenta de build/CLI), não processa entrada não confiável de usuário final
  em runtime da aplicação — risco de exploração em produção é baixo.
- **Dono:** Agente 00 / dono do repositório — reavaliar quando o Prisma publicar uma versão `7.x`
  que atualize `deepmerge-ts` para `>=8.0.0`, ou ao planejar a próxima major do Prisma.
  Verificar com `npm audit --audit-level=high` a cada reavaliação.
- **Data de registro:** 2026-08-17. **Reavaliar em:** próxima atualização de `prisma`/`@prisma/config`
  ou em 30 dias, o que vier primeiro.
- **Escopo do waiver:** só este advisory ID, só via esta cadeia de dependência. Qualquer outro
  achado `HIGH`/`CRITICAL` novo continua bloqueando o gate normalmente.

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
- 2026-08-17 — Fase Final 1, reaplicação: um commit posterior (`cf7bffd1`, merge de correção de
  mock do Baileys não relacionado) havia revertido acidentalmente o gate único de release inteiro
  (removeu `secret-scan` de `production.yaml`, o `needs:` nos 4 workflows secundários, e
  reintroduziu `continue-on-error` sem waiver). Reaplicado o gate original. Nesta reaplicação,
  `npm audit --audit-level=high` já não retorna mais zero — encontrou o waiver `GHSA-ggr8-5vv4-36mx`
  acima (não existia em 2026-08-16, surgiu de uma atualização do Prisma entre essa data e agora).
  `continue-on-error: true` foi reintroduzido em `ci.yml`, `production.yaml` e `cd-homolog.yml`
  citando esta entrada — não é o mesmo débito vestigial de antes.
