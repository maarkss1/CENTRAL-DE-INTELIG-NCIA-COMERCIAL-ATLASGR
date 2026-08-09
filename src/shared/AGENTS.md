# AGENTS.md — Shared Contracts

## Dono
Agente 01 — Plataforma, Segurança e Dados

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- contratos compartilhados, policies, tipos de autorização/tenant e utilitários comuns.

## Não pode
- Não criar dependência circular entre feature e shared.
- Não duplicar RBAC.
- Não colocar regra específica de UI aqui.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- contratos têm tipos claros, testes e fonte única de verdade.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
