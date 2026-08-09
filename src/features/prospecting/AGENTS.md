# AGENTS.md — Prospecção

## Dono
Agente 05 — Prospecção

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- providers, descoberta, normalização, dedupe, enrichment e scoring.

## Não pode
- Chaves nunca no frontend.
- Não criar migração.
- Não ocultar falha de provider.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- retry, rate limit, dedupe, proveniência e score explicável testados.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
