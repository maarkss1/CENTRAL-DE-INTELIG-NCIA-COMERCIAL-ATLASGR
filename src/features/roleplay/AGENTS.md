# AGENTS.md — Roleplay

## Dono
Agente 07 — IA e Automações

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- simulações, personas técnicas, sessões e feedback de roleplay.

## Não pode
- Simulação nunca deve afirmar que executou ação real.
- Não contornar autorização de tools.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- estados de simulação e falhas de IA são explícitos e testados.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
