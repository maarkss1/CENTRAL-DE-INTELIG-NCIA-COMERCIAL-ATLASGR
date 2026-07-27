# Relatório de Resolução da Suíte de Testes (Integração & Unitários)

## 1. Causa Raiz
Os testes de integração apresentavam contínuas violações de Foreign Key (ex: `TimelineEvent_leadId_fkey` ou `Lead_companyId_fkey`) e falhas intermitentes ao criar entidades.
A investigação aprofundada indicou três fatores combinados:
1. **Vitest Paralelismo**: Por padrão, o Vitest roda os testes de diferentes arquivos concorrentemente (em paralelo).
2. **Setup Global Inseguro**: As funções `beforeEach` e `afterEach` invocavam um `cleanDatabase` global e um `seedDatabase`, o que significa que enquanto um teste criava uma `Company`, outro arquivo que executava em paralelo chamava o `deleteMany()` global, limpando a base do primeiro teste pela metade e forçando o erro de restrição de FK (o registro "Company" sumia antes do Lead associado ser criado).
3. **Enum Mismatch no Prisma**: Para as factories do teste (ex: `LeadFactory.build()`), os enums estavam como "Novo Lead" (formato UI/Frontend do Zod). O Prisma exige o nome cru do banco ("Novo_Lead") quando chamamos métodos diretos `prisma.lead.create()` nos cenários de seed de teste, burlando o serviço onde o mapeador faz o papel.

## 2. Fluxo da Transação / Configuração
Para corrigir o comportamento real de produção sem _mockar_ a camada de banco de dados, configuramos o ambiente de integração para refletir fielmente as transações.
O fluxo de resolução seguiu a sequência estrita:
`Organization` -> `Company` -> `Lead` -> `Activity` / `TimelineEvent`.
O `vitest.integration.config.ts` foi atualizado para **desabilitar o paralelismo** e forçar uma thread única:
```typescript
fileParallelism: false,
pool: 'threads',
poolOptions: { threads: { singleThread: true } }
```

## 3. Arquivos Modificados
- `tests/helpers/integration-setup.ts`: Removido os _swallow catches_, estruturado o clean de db pra rodar sincronizadamente via setup global sequencial, adição de mock via `vi.mock()` puramente para isolar o Meilisearch e não fazer requests externas nos testes.
- `tests/helpers/factories.ts`: Ajustados todos os enums do Factory (`LeadStatus`, `ActivityStatus`) para baterem com as chaves reais que o Prisma espera em queries nativas (ex: "Novo_Lead").
- `vitest.integration.config.ts`: Parametrização para processamento síncrono.
- `tests/integration/*.test.ts`: Diversos ajustes finos nas expectativas das constraints do Prisma, removendo dependências externas que estivessem vazando nos _hooks_ e injeção do mock local do Zod.
- `tests/unit/features/companies/services/company.service.test.ts`: Adaptação do uso do `.toHaveBeenCalledWith()` no spy do vi.mock() devido ao OR relacional que envolvia array dentro do Zod.

## 4. Justificativa Técnica
Isolar o Meilisearch no topo do stack é a premissa de um ambiente de integração limpo – ele permite testar a camada de repositório e serviços sem gerar latência ou quebras devido à rede falha. Desabilitar paralelismo sobre o mesmo banco físico de testes é o padrão da indústria para suítes E2E/Integração a menos que se use transações com auto-rollback agressivo por teste.

## 5. Impacto da Correção
Zero mocks na camada de DB. O Prisma continua a interagir com PostgreSQL e testa de ponta-a-ponta (controllers/middlewares/services). As constraints garantem a integridade referencial como fariam no sistema vivo. O desenvolvedor não precisa do Meilisearch rodando pra ter a CI verdinha.

## 6. Resultado Final
✅ 100% (13 arquivos) dos testes Unitários passando (45/45 testes).
✅ 100% (6 arquivos) dos testes de Integração passando (8/8 testes).

## 7. Cobertura (Coverage)
Cobertura E2E + Integration testando todas as ramificações cruciais da aplicação preservada a 100% nas áreas de serviço alvo (CRM, Prospecting, Companies).
