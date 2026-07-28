# Matriz de Arquitetura: Antes / Depois

| Característica | Antes (MVP) | Depois (Enterprise Foundation) |
| --- | --- | --- |
| **Padrão Arquitetural** | Layered simples (Routes -> Services -> Prisma) | Clean Architecture Modular (Routes -> Controllers -> UseCases -> Repository) |
| **Acesso ao Banco de Dados** | Direto nos `*.service.ts` usando singleton `prisma` global. | Centralizado na camada `infra/` através de `Repositories`. |
| **Injeção de Dependências** | Nenhuma. Acoplamento rígido (singletons importados diretamente). | Registro de Repositories, UseCases e Controllers via container DI (`src/shared/di/container.ts`). |
| **Lógica de Negócio** | Misturada nos Services com regras de formatação HTTP e validações. | Isolada em Casos de Uso (`application/UseCases.ts`). |
| **Eventos / Assincronicidade** | Acoplamento de chamadas síncronas. | Fundação estabelecida (`src/shared/domain/events/EventBus.ts`) com implementação `InMemoryEventBus`. |
| **Validação** | Rotas misturando express middleware com chamadas Service. | `validateRequest` persistido nas rotas; lógica limpa nos Controllers. |
| **Status de Módulos (Core CRM)**| Fortemente acoplado. | 100% migrado para a nova estrutura. |
| **Módulos de IA (Prospecting/AI)** | Acoplado. | Parcialmente refatorado. |
