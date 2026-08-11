- De: 07
- Para: 00
- Onda: G
- Status: resolvido
- Prioridade: alto
## Problema
O serviço de escaneamento de leads frios (ColdLeadsScannerService) foi criado, mas precisa ser inicializado no server.ts.
## Arquivo(s) envolvido(s)
server.ts
## Alteração necessária
Adicionar import: import { ColdLeadsScannerService } from './src/features/automations/application/cold-leads-scanner.service.js';
E adicionar ColdLeadsScannerService.start(); no final, com os outros inicializadores de serviço.
## Teste esperado
O log deve exibir "ColdLeadsScannerService scheduled." ao inicializar.
## Contexto adicional
Alterar o server.ts exige a sua aprovação.

## Resolução
Aprovado. Revisado `cold-leads-scanner.service.ts`: cron interno (node-cron, não depende de
`queuesEnabled`/Redis), leitura read-only de leads frios escopada por `organizationId` (tenancy
preservada), sem envio externo de dado pessoal — apenas log de contagem de insights via RAG
interno. Import e `ColdLeadsScannerService.start()` adicionados em `server.ts`, no mesmo bloco dos
demais inicializadores de serviço, antes do `shutdown()`. — Agente 00, 2026-08-11.
