# Plano de Testes

## Estado Atual (evidência)

- ~40 arquivos de teste (26 em `tests/` + 14 colocados em `src/**/__tests__/`) contra 354 arquivos-fonte em `src/` — proporção aproximada de **1:9**.
- Nenhum teste desabilitado/pulado encontrado (`.skip`, `.todo`, `xdescribe`, `xit`) — a lacuna é por ausência total, não por testes suprimidos.
- E2E: um único spec (`tests/e2e/crm.spec.ts`) que só verifica o `<title>` da página; **não é executado no CI** (`ci.yml` não chama `test:e2e`); `playwright.config.ts` só roda no Chromium.
- `msw` instalado, nunca usado; mocking de HTTP feito ad hoc e de forma inconsistente entre arquivos.
- Setup de integração é frágil: a porta do Postgres local (5434, via `docker-compose.yml`) coincide com o que o próprio CI expõe via *service containers*, e o `.env.test` referenciado pelo script `pretest:integration` não existe versionado nem é criado por nenhum step do pipeline.

## Matriz de Cobertura por Fluxo Crítico

| Fluxo crítico | Cobertura atual | Risco | Teste necessário |
|---|---:|---:|---|
| Login / autenticação | Nenhuma (e a feature está, hoje, comprometida — ver `08-PLANO-DE-SEGURANCA.md`) | **Alto** | Teste de integração do fluxo real de login via better-auth (sucesso, senha incorreta, conta inexistente); teste de que `ProtectedRoute` bloqueia sem sessão válida — deve ser escrito **junto** com a correção de SEC-001/002/003, como critério de aceite |
| Permissões / RBAC | Parcial (unitário, com mocks) | Médio | Teste de integração ponta-a-ponta validando RBAC numa rota real (não só a função isolada `requireTenant`/`requirePermission`) |
| Criação/edição/exclusão de leads | Parcial (só `create` coberto em integração) | Médio | Testes de update/delete/findAll de lead; teste de rota para `lead.routes.ts`/`LeadController` (hoje só companies tem teste de rota completo) |
| Criação/edição de contatos e empresas | Boa (companies) / Parcial (contacts) | Baixo-Médio | Réplica do `company.routes.test.ts` para contacts |
| Integração Google | Nenhuma | Alto | Teste de contrato do `google.service.ts` (mesmo mockado hoje, validar que a UI reage corretamente ao estado retornado); teste de integração real quando a implementação for feita (ver BACK-005) |
| Integração WhatsApp | Nenhuma | Alto | Teste unitário do fluxo de conexão/QR/status; teste de que reconexão respeita backoff (após correção de BACK-006) |
| IA (chatbot/intelligence/roleplay) | Praticamente nenhuma (só schema do supervisor) | Alto | Teste do `sdrNode` do Swarm com `leadId` real (cobrindo a correção de IA-003); teste de `guardrails.service.ts` (redação de PII de entrada, após IA-006); teste de `AIPendingAction` executor (após IA-005) |
| Billing | Nenhuma | Alto | Definir escopo funcional da feature antes de testar (hoje é um stub de 25 linhas) |
| Relatórios / exportação | Nenhuma | Médio-Alto | Teste de `analytics.routes.ts` cobrindo o caminho de erro de banco (validando que **não** retorna dado fabricado, após correção de BACK-003); teste de exportação CSV/Bitrix24 (incluindo validação de que SSRF foi corrigido) |
| Enriquecimento de empresa | Nenhuma | Médio | Teste do worker de enriquecimento (hoje simulado — testar contrato antes e depois de BACK-007) |

## Recomendações Estruturais

1. **Adicionar `test:e2e` ao `ci.yml`** e escrever specs reais para: login (pós-correção), navegação principal, CRUD de lead/empresa/contato.
2. **Resolver o conflito de porta/ambiente de integração**: usar as portas dos *service containers* do próprio CI em vez de subir `docker-compose` dentro do runner; versionar um `.env.test.example` e gerar o `.env.test` real como step explícito do `ci.yml`.
3. **Adotar `msw`** como estratégia única de mock de HTTP no frontend, substituindo os mocks ad hoc de `fetch`/`vi.mock` espalhados.
4. **Priorizar cobertura por risco, não por facilidade**: WhatsApp/Google/IA têm zero testes e são exatamente as áreas com mais achados de segurança/confiabilidade nesta auditoria — devem vir antes de aumentar cobertura em áreas já bem testadas (companies).
5. **Tratar a correção de SEC-001/002/003 como um "test-first" obrigatório**: o teste de que login/`ProtectedRoute` funcionam de verdade deve existir e falhar *antes* da correção, e passar depois — evita reintrodução do bypass no futuro.
6. Remover `test-apollo.ts` da raiz ou convertê-lo em um teste real dentro de `tests/integration/`.
