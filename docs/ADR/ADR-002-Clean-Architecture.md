# ADR 002: Adoção de Clean Architecture e Injeção de Dependências

## Status
Aceito

## Contexto
Durante o desenvolvimento do Prospector-Atlas como um MVP monolítico, o código de negócio estava fortemente acoplado à infraestrutura de acesso a banco de dados (Prisma). Todas as regras residiam em diretórios globais de Services (`src/features/*/services/*.service.ts`), os quais acessavam livremente o driver do Prisma e funções inter-módulos. Com o crescimento da aplicação e necessidade iminente de escalabilidade, a estrutura tornou-se de difícil manutenção e impedia testabilidade unitária real sem uso profundo do banco de dados (God Objects e Tight Coupling).

## Decisão
Adotamos uma abordagem de **Clean Architecture** fragmentando os subdomínios em camadas claras:
1. **Domain:** Entidades (`Entity`) e Contratos (`Repository Interface`).
2. **Application:** Casos de Uso com a lógica de negócio pura (`UseCases`).
3. **Infrastructure:** Comunicação com o banco de dados (implementação Prisma) e serviços externos (`PrismaRepository`).
4. **Presentation:** Controllers para interface com a rede/HTTP e Roteamento.

Para orquestrar essa comunicação sem manter o alto acoplamento, implementamos um contêiner simplificado de **Dependency Injection (DI)** e um EventBus na nova camada `shared`.

## Consequências
### Positivas
- **Isolamento**: Regras de negócio agnósticas em relação ao express.js ou ORMs.
- **Testabilidade**: Use Cases agora podem ser testados unitariamente mockando seus repositórios (sem Prisma real).
- **Flexibilidade**: É possível substituir ORM, Banco ou provedor de APIs isolando a camada de Infrastructure.

### Negativas
- Aumento da verbosidade estrutural (a criação de uma funcionalidade requer Entidade, Interface, Implementação, Caso de Uso e Controller).
- Inicialização centralizada exige wiring manual em `src/shared/di/setup.ts`, exigindo disciplina do time para mapear novas injeções lá.

## Alternativas Consideradas
*NestJS:* Considerado pelo framework forte de injeção de dependências nativa, mas o alto custo de migração de um React SPA Express monolítico para NestJS no backend faria com que fosse muito invasivo comparado à implantação das abstrações internamente usando TypeScript Vanilla.

## Atualização — 2026-08-21 (P2 Arquitetura e Manutenção)

A consequência negativa listada acima ("wiring manual... exigindo disciplina do time") não era
teórica: `notes` era uma feature híbrida real. `NoteController`/`NoteUseCases`/
`PrismaNoteRepository` existiam completos e estavam registrados em `setup.ts`, mas
`notes/routes/note.routes.ts` nunca os resolvia — chamava direto um `NoteService` legado
(`notes/services/note.service.ts`) que duplicava a mesma regra sem a transação atômica
nota+timeline que o repositório Clean Architecture já fazia. A wiring do container ficava
registrada e nunca era exercitada em produção.

Corrigido nesta rodada:
- `note.routes.ts` passou a resolver `NoteController` via `container.resolve`, no mesmo padrão
  das demais 8 features registradas em `setup.ts` (`activities`, `contacts`, `companies`, `crm`,
  `automations`, `analytics`, `commercial-intelligence`, `crm360` — todas já corretas).
- O único consumidor interno do service legado (`aiPendingAction.service.ts`, ação
  `swarm_recommendation`) passou a resolver `NoteUseCases` pelo mesmo container em vez de
  importar o service legado.
- `note.service.ts` foi removido (sem mais nenhum consumidor).
- Auditoria de todas as 9 features com Controller registrado confirmou que `notes` era o único
  caso do gap — as outras 8 já resolviam seus Controllers corretamente.
- Para evitar recorrência silenciosa deste padrão específico, `src/shared/di/wiringConsistency.ts`
  + `tests/unit/shared/diWiringConsistency.test.ts` adicionam uma checagem estática (mesmo estilo
  do drift check de `openapiRouteInventory.ts`/Agente 18): falha se algum Controller registrado em
  `presentation/` de uma feature não for resolvido por nenhuma rota da mesma feature.

Isso não elimina o wiring manual em `setup.ts` (permanece o mesmo padrão desta ADR, decisão não
revisitada aqui) — apenas adiciona uma rede de segurança que transforma "uma rota esquecida de usar
o Controller registrado" de silencioso em falha de teste.
