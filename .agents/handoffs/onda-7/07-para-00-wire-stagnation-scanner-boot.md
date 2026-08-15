- De: Agente 07 (IA, RAG, Filas e Automações)
- Para: Agente 00 (Coordenador) / quem tiver aprovação sobre `server.ts`
- Onda: 7
- Status: aberto
- Prioridade: normal (não bloqueia a onda — a varredura já pode ser disparada manualmente)

## Problema

A missão da Onda 7 pede para ampliar o motor de automação além dos 3 gatilhos × 3 ações originais.
Implementei o gatilho de estagnação ("Negócio parado há X dias" / "Proposta enviada sem resposta")
via `StagnationScannerService` (`src/features/automations/application/stagnation-scanner.service.ts`),
seguindo exatamente o mesmo padrão já usado por `ColdLeadsScannerService`
(`src/features/automations/application/cold-leads-scanner.service.ts`), que é ligado no boot do
servidor em `server.ts:481` (`ColdLeadsScannerService.start();`).

`server.ts` é de aprovação exclusiva do Agente 00 (`/AGENTS.md` → "Propriedade exclusiva de
arquivos"), então não editei o arquivo. A funcionalidade está completa e testada, só falta a
chamada de boot — sem ela, o cron da varredura nunca dispara sozinho (mas continua acionável na
hora via `POST /api/automations/stagnation-scan`, que já criei como válvula de escape, mesmo padrão
manual do `/api/intelligence/win-loss-analysis`).

## Arquivo(s) envolvido(s)
- `server.ts` (linha ~481, logo depois de `ColdLeadsScannerService.start();`)

## Alteração necessária

Duas linhas, mesmo padrão do import/chamada já existente para `ColdLeadsScannerService`:

```ts
// perto do import existente:
import { ColdLeadsScannerService } from './src/features/automations/application/cold-leads-scanner.service.js';
import { StagnationScannerService } from './src/features/automations/application/stagnation-scanner.service.js';

// perto da chamada existente:
ColdLeadsScannerService.start();
StagnationScannerService.start();
```

Sem nenhuma outra dependência nova, variável de ambiente ou coordenação com Redis diferente do que
`ColdLeadsScannerService` já usa (mesmo `node-cron` + trava distribuída via
`src/lib/queue/distributedLock.ts`, extraída do próprio `cold-leads-scanner.service.ts` nesta onda
para ser reaproveitada aqui).

## Teste esperado
- `npm run build`/`tsc --noEmit` continuam verdes com o import adicionado (já validado localmente
  usando o arquivo fora de `server.ts`, só falta a integração real).
- Em produção/staging: `StagnationScannerService scheduled.` aparece no log de boot, e a varredura
  roda às 03:17 (horário escolhido só para não competir com o cold-leads-scanner às 02:00).

## Contexto adicional
Testes cobrindo o scanner em si (idempotência, escopo de tenant, seleção de leads, lock distribuído):
`tests/unit/features/automations/application/stagnation-scanner.service.test.ts` (8 casos, todos
verdes). Não é necessário testar a chamada de boot em si — o próprio `ColdLeadsScannerService.start()`
já não tem teste dedicado no `server.ts`, mesmo padrão.
