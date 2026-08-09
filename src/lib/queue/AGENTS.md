# AGENTS.md — Filas

## Dono
Agente 07 — IA e Automações

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- queue runtime, jobs, retries, backoff e observabilidade de execução.

## Não pode
- Não engolir falha.
- Não executar job cross-tenant.
- Não criar retry infinito.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- idempotência, timeout, retry e failure state são testados.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
