# AGENTS.md — Testes

## Dono
Agente 08 — QA e Release

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- testes unitários, integração, E2E, fixtures sanitizadas e harness.

## Não pode
- Não enfraquecer assert para “ficar verde”.
- Não colocar segredo em fixture.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- suíte reproduz falhas críticas e permanece confiável.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
