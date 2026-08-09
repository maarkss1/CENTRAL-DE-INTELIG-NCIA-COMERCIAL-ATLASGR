# AGENTS.md — Argo CD

## Dono
Agente 10 — Infraestrutura, Observabilidade e SRE

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- manifests/configuração de deploy dentro desta árvore.

## Não pode
- Não expor segredo.
- Não permitir start saudável com migração pendente.

## Coordenação
- Alterações de schema são definidas pelo 01; você apenas garante execução segura no deploy.

## Definição de pronto local
- deploy aplica migrações de forma bloqueante e possui health/readiness coerentes.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
