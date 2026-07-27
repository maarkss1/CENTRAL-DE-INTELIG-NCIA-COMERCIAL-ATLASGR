# INVENTÁRIO DE DÍVIDAS TÉCNICAS

1. **Tipagens 'any' nos Services:** Existem `any` e supressões no Prisma Service (ex: em `company.service.ts` e `activity.service.ts`) para tratamento dinâmico de queries.
   - **Mitigação:** Criar DTOs tipados e usar os tipos gerados pelo Prisma (`Prisma.CompanyWhereInput`).
2. **Setup de Testes (Coverage 0%):** O projeto atualmente carece de testes automatizados (Unit, Integration, E2E).
   - **Mitigação:** Implementar a Fase 19.0 (QA & Hardening) com Vitest e Playwright em um ciclo isolado.
3. **Múltiplos Warnings de Hook de Efeito:** Alguns componentes possuem dependências vazias onde funções do componente poderiam causar infinite loops se não forem encapsuladas em `useCallback`.
   - **Mitigação:** Mover lógicas de `fetch` para fora dos componentes usando algo como React Query ou Redux, abstraindo chamadas de API do side-effect da renderização.
