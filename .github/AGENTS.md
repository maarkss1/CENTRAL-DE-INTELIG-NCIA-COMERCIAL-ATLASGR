# AGENTS.md — GitHub Actions e Governança de CI

## Dono
Agente 08 — QA e Release

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- workflows, checks e automações de CI/CD.

## Não pode
- Nenhum outro agente altera pipeline.
- Não ignorar exit code.
- Não imprimir secrets.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- typecheck/lint/tests/build são gates reais e falham o pipeline quando devem.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
