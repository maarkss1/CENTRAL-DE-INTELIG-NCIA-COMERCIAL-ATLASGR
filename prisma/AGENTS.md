# AGENTS.md — Prisma, Schema e Migrações

## Dono
Agente 01 — Plataforma, Segurança e Dados

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- `schema.prisma`
- `migrations/**`
- validações, índices, constraints e relações necessárias à correção.

## Não pode
- Nenhum outro agente cria ou edita migração.
- Não usar `prisma db push` como solução de produção.
- Não editar migração já aplicada sem estratégia explícita.
- Não inserir segredo ou dado real sensível em seed/migration.

## Coordenação
- Agentes 04, 05, 06 e 07 solicitam mudanças de schema ao 01 via handoff.

## Definição de pronto local
- `prisma validate` e `prisma generate` passam.
- migração é reproduzível.
- rollback/compatibilidade foi considerada.
- testes de tenant/RBAC/dados relevantes passam.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
