# AGENTS.md — Agenda

## Dono
Agente 04 — CRM e BI

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- dados e experiência comercial deste domínio, respeitando contratos compartilhados.

## Não pode
- Não criar migração.
- Não alterar sincronização externa pertencente ao 06.
- Não inventar owner, contato, agenda ou KPI.

## Coordenação
- Mudança de schema -> 01. Mapping Bitrix -> contrato com 06.

## Definição de pronto local
- campos, filtros, owners, timezone e tenant estão corretos e testados.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
