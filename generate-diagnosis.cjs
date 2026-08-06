const fs = require('fs');
const path = require('path');

const content = `# Diagnóstico Arquitetural

## 1. Migração para Clean Architecture
A migração para Clean Architecture está parcialmente concluída.
Módulos migrados (possuem domain, application, infra, presentation):
- activities
- companies
- contacts
- crm
- notes

Módulos não migrados (ainda baseados em components e services com lógica direta de DB/APIs):
- analytics, auth, automations, billing, calendar, chatbook, dashboard, document-editor, gamification, integrations, intelligence, knowledge, notifications, onboarding, playbook, prospecting, reports, roleplay, settings, team.

## 2. Padrões Arquiteturais Coexistentes (Legado vs Novo)
Sim, há uma clara coexistência:
- Padrão Novo: Isolamento de responsabilidades usando controllers/rotas (Presentation), casos de uso (Application), contratos e modelos (Domain), e repositórios (Infrastructure). Visto nos 5 módulos centrais.
- Padrão Legado: Arquitetura em 2 camadas, onde Components chamam diretamente Services, que por sua vez usam o Prisma (ORM) diretamente, acoplando acesso a dados com regras de negócio. Visto nos outros ~23 módulos.

## 3. Componentes React "Fat" (Lógica de negócio e UI)
Apesar de não usarem React Query/SWR (0 chamadas detectadas), 81 componentes dependem fortemente de \`useEffect\` para gerenciar chamadas de API nativas. Exemplos incluem \`Timeline.tsx\`, \`Analytics.tsx\` e grandes painéis (como \`SalesMethodologyStudio.tsx\` com >500 linhas) onde o ciclo de vida, requisições de rede, estado e UI são todos gerenciados no mesmo arquivo, violando o Single Responsibility Principle (SRP).

## 4. "God Services" (Responsabilidades excessivas)
Existem serviços massivos que concentram orquestração, regras de negócio e infraestrutura (DB/APIs):
- \`bitrix.service.ts\` (856 linhas)
- \`enrichment.service.ts\` (840 linhas)
- \`studio.service.ts\` (742 linhas)
- \`gateway.ts\` (671 linhas)
- \`apollo.service.ts\` (622 linhas)
Esses serviços violam o princípio de responsabilidade única (SRP), e são difíceis de testar sem mocks extensivos (sendo muitas vezes testados no ambiente de integração, o que mascara falhas de design unitário).

## 5. Violações SOLID e Clean Architecture
- **Inversão de Dependência (DIP):** Nos módulos legados, os serviços dependem concretamente do \`PrismaClient\`, dificultando mocks.
- **Responsabilidade Única (SRP):** God Services e Fat Components fazem muito mais do que apenas orquestrar um caso de uso ou renderizar uma UI.
- **Acoplamento Framework/Domínio:** A dependência direta do Prisma Client dentro de \`activity.service.ts\`, \`contact.service.ts\` etc., amarra a lógica de negócio à infraestrutura, impedindo que o core do domínio seja independente de banco de dados e APIs externas.

## 6. Dependências Diretas e Inversão de Controle
Foi identificada uma injeção de dependência rudimentar e direta nos serviços antigos (mais de 104 ocorrências de chamadas \`prisma.X\`). Em contraste, os 5 novos módulos (CRM, Contacts, etc.) usam repositórios. No entanto, mesmo os novos usam Inversão de Controle caseira (\`src/shared/di/setup.ts\`) sem uso generalizado do framework ao longo da maior parte da aplicação.

## 7. Top 20 Arquivos com Maior Potencial de Dívida Arquitetural
1. \`src/features/integrations/bitrix/bitrix.service.ts\` (856 linhas - God Service, integrações pesadas).
2. \`src/features/prospecting/services/enrichment.service.ts\` (840 linhas - Acoplamento com APIs e DB).
3. \`src/features/intelligence/services/studio.service.ts\` (742 linhas - Muita lógica em um só serviço).
4. \`src/features/chatbook/components/FloatingChatbook.tsx\` (741 linhas - Fat Component massivo).
5. \`src/components/icons/AtlasIcons.tsx\` (692 linhas - Centralização desnecessária, hard de manter).
6. \`src/features/intelligence/components/SuperagentCreator.tsx\` (676 linhas - Fat Component).
7. \`src/lib/ai/gateway.ts\` (671 linhas - God object para requisições de IA).
8. \`src/components/Intelligence.tsx\` (627 linhas - Acoplamento de IA na UI).
9. \`src/features/prospecting/services/apollo.service.ts\` (622 linhas - Integração hardcoded).
10. \`src/features/integrations/components/Integrations.tsx\` (610 linhas - Fat Component).
11. \`src/features/intelligence/components/AutomationGuide.tsx\` (558 linhas - UI + Lógica de negócio).
12. \`src/features/prospecting/components/prospecting-hub/DecisionMakerSearch.tsx\` (553 linhas - Fat Component).
13. \`src/features/crm/components/LeadDetailDrawer.tsx\` (552 linhas - Complexidade de UI/Logica).
14. \`src/features/companies/components/CompanyList.tsx\` (530 linhas - Fat Component).
15. \`src/features/intelligence/components/SalesMethodologyStudio.tsx\` (527 linhas - UI/Lógica).
16. \`src/features/intelligence/agents/supervisor.agent.ts\` (505 linhas - Acoplamento LangGraph/Prompting/Tooling).
17. \`src/features/intelligence/components/SwarmDashboard.tsx\` (477 linhas - Fat Component).
18. \`src/features/knowledge/components/Base.tsx\` (472 linhas - Fat component genérico).
19. \`src/features/prospecting/components/ProspectingHub.tsx\` (458 linhas - Orquestração central no front).
20. \`src/features/prospecting/services/prospecting.service.ts\` (413 linhas - Violação de SRP).

## 8. Notas de Maturidade Arquitetural

* **Clean Architecture: 3.5/10** (Apenas o core foi migrado, ~80% da app é legada)
* **SOLID: 4.0/10** (Várias violações de SRP em componentes e serviços, DIP desrespeitado em serviços legados)
* **Modularização: 6.0/10** (A separação por pastas de "features" ajuda, mas a modularização interna de muitas é fraca)
* **Acoplamento: 3.5/10** (Alto acoplamento com banco de dados nos serviços legados e lógica na UI)
* **Coesão: 4.5/10** (God services possuem baixa coesão concentrando responsabilidades demais)
* **Testabilidade: 4.0/10** (A injeção direta e acoplamento a serviços externos exige testes de integração pesados ao invés de unitários fáceis)
* **Escalabilidade: 6.5/10** (Padrão de IA e estrutura modular em partes críticas permitem crescer, mas os gargalos arquiteturais atrapalharão)
* **Manutenibilidade: 4.5/10** (A coexistência de dois padrões, God Services e ausência de tipagem em alguns mocks tornam a manutenção complexa)
`

fs.writeFileSync('docs/auditoria-divida-tecnica/10-DIAGNOSTICO-ARQUITETURA.md', content);
console.log('Report saved!');
