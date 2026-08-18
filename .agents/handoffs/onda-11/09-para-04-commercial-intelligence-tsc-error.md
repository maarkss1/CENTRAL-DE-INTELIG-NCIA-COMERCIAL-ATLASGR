- De: 09
- Para: 04
- Onda: 11
- Status: resolvido
- Prioridade: alto

## Problema
Arquivos do módulo commercial-intelligence estão falhando na checagem de tipos.

## Arquivo(s) envolvido(s)
src/features/commercial-intelligence/__tests__/executiveExport.unit.test.ts
src/features/commercial-intelligence/application/executiveExport.ts

## Alteração necessária
Corrigir propriedades ausentes ou não reconhecidas nas interfaces ExecutiveOverview, PerformanceMetrics e PipelineCreation.

## Teste esperado
O comando 
px tsc --noEmit deve passar sem erros nestes arquivos.

## Contexto adicional
Erros encontrados como: Property 'funnelHistoricalTrackingSince' is missing in type... e Property 'businessDaysElapsed' does not exist on type 'PipelineCreation'.

## Resolução (Sprint 00/Onda 12 — GOV-006, 2026-08-18)
Confirmado: `coverageProtection`/`previousPeriod`/`forecastConfidence`/`funnelHistoricalTrackingSince`
presentes no domínio atual de `commercial-intelligence`. `npx tsc --noEmit` roda sem estes erros
(ver GOV-007 desta onda). Status corrigido de `aberto` para `resolvido`.
