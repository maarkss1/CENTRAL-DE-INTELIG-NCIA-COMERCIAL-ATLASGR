# AGENTS.md — Estilos Globais e Tokens

## Dono
Agente 03 — Design e Acessibilidade

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- tokens, temas, estilos globais e regras responsivas compartilhadas.

## Não pode
- Evitar valores mágicos repetidos quando token existir.
- Não usar cor como único indicador de estado.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- AtlasGR/TotalTrac consistentes e WCAG AA nos fluxos críticos.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
