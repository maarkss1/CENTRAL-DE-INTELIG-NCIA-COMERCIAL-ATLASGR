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
