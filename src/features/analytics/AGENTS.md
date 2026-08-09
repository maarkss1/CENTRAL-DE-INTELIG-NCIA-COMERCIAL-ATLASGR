# AGENTS.md — Analytics

## Dono
Agente 04 — CRM e BI

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- métricas, agregações, dashboards analíticos e forecast.

## Não pode
- Não fabricar KPI.
- Toda métrica precisa de definição reproduzível.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- fórmulas documentadas, dados rastreáveis e testes de agregação.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
