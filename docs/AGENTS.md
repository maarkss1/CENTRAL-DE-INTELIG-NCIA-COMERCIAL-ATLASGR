# AGENTS.md — Documentação

## Dono
Agente 08 — QA e Release

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- documentação técnica, release, operação e runbooks.

## Não pode
- Não declarar concluído o que não foi testado.
- Não incluir segredo.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- docs refletem comportamento comprovado e comandos atuais.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
