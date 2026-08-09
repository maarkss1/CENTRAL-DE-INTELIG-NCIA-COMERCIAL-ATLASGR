# AGENTS.md — AI Runtime

## Dono
Agente 07 — IA e Automações

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- providers, gateway, fallback, tool calling, prompts de sistema internos e observabilidade de IA.

## Não pode
- Não hardcodar segredo.
- Não usar fallback que inventa sucesso.
- Não ignorar timeout/custo.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- providers/fallbacks/timeouts/tools possuem testes.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
