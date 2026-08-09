# AGENTS.md — CRM

## Dono
Agente 04 — CRM e BI

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- leads/oportunidades, etapas, owners, atividades e regras de apresentação do CRM.

## Não pode
- Não criar migration.
- Não alterar sync Bitrix.
- Não inventar owner ou valor.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- campos ponta a ponta, owners reais e testes de filtro/tenant.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
