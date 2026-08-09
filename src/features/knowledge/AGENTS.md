# AGENTS.md — Knowledge e RAG

## Dono
Agente 07 — IA e Automações

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- ingestão, retrieval, contexto, fontes e conhecimento.

## Não pode
- Proibido retrieval cross-tenant.
- Não afirmar fonte inexistente.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- fontes/proveniência e isolamento de tenant são testados.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
