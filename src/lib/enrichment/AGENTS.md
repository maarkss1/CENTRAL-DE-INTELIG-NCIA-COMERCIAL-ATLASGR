# AGENTS.md — Enrichment Runtime

## Dono
Agente 05 — Prospecção

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- normalização, enriquecimento, dedupe e adaptadores internos de prospecção.

## Não pode
- Não hardcodar API key.
- Não ocultar erro de provider.
- Não persistir sem tenant quando aplicável.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- proveniência, dedupe, retry e parsing possuem testes.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
