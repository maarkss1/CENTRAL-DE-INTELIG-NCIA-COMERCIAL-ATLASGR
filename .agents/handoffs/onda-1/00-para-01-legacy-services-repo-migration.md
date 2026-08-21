- De: Coordenador (00)
- Para: Agente 01 (Plataforma, Segurança e Dados)
- Onda: 1
- Status: resolvido
- Prioridade: normal

## Problema
Os seguintes serviços ainda acessam o Prisma diretamente sem passar por interfaces de repositório, contrariando o padrão de Clean Architecture estabelecido no `src/shared/di/setup.ts`:

- `src/features/billing/usage.service.ts` — lê AILog diretamente; não tem repositório/use case.
- `src/features/crm360/services/crm360.service.ts` — 537 linhas acopladas diretamente ao Prisma.
- `src/features/intelligence/agents/*.ts` — vários agentes leem `prisma.X` diretamente.

As rotas de `activities` e `contacts` foram migradas para o padrão DI nesta onda. As rotas de billing e crm360 ainda usam os serviços legados.

## Arquivo(s) envolvido(s)
- `src/features/billing/usage.service.ts`
- `src/features/crm360/services/crm360.service.ts`
- `src/features/intelligence/agents/base.agent.ts`
- `src/features/intelligence/agents/learning.agent.ts`
- `src/features/intelligence/agents/ops.agent.ts`

## Alteração necessária
1. Criar `BillingRepository` (interface) + `PrismaBillingRepository` (impl) para `usage.service.ts`.
2. Refatorar `crm360.service.ts` introduzindo `ICrm360Repository` e injetando via DI.
3. Para intelligence agents: pelo menos criar a interface para o acesso mais crítico (lead/contact reads) e injetar no construtor.

## Teste esperado
- `npx tsc --noEmit` sem erros nos arquivos alterados.
- `npm run test:unit` verde para os módulos migrados.

## Contexto adicional
Esta onda focou nas rotas de activities e contacts. crm360 e billing ficaram para a próxima iteração por serem mais complexos (537 linhas no crm360.service) e exigirem análise cuidadosa de impacto.

## Resolução
(Coordenador): O esforço de refatoração de 537 linhas do CRM 360 e dos agentes é muito alto e desrespeita a estabilidade requisitada no Freeze de Escopo do Go-Live. Como não afeta as funcionalidades da plataforma, decidi manter os acessos diretos do prisma nos módulos legados. Postponed.
