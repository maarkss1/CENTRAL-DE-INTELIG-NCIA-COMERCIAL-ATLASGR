- De: 02
- Para: 04
- Onda: 11
- Status: aberto
- Prioridade: alto
## Problema
Erros de TypeScript na feature de `commercial-intelligence`:
1. `ExecutiveOverview` não está batendo com o tipo retornado (falta `coverageProtection`, `previousPeriod`, `forecastConfidence`).
2. `PerformanceMetrics` sentindo falta de `funnelHistoricalTrackingSince`.
3. Propriedades desconhecidas `businessDaysElapsed` e `businessDaysTotal` no `PipelineCreation`.
## Arquivo(s) envolvido(s)
- `src/features/commercial-intelligence/__tests__/executiveExport.unit.test.ts`
- `src/features/commercial-intelligence/application/executiveExport.ts`
## Alteração necessária
Atualizar as tipagens, mocks nos testes, e mapeamento na aplicação para alinhar as interfaces de `ExecutiveOverview`, `PerformanceMetrics` e `PipelineCreation`.
## Teste esperado
O comando `npx tsc --noEmit` deve rodar limpo para os arquivos do domínio de inteligência comercial.
## Contexto adicional
Detectado durante a validação global de TS na Onda 11 pelo Agente 02.
