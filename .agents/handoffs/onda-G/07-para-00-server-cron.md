- De: 07
- Para: 00
- Onda: G
- Status: aberto
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
