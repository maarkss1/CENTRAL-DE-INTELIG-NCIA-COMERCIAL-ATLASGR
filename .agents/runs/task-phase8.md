# Execution Tasks: Phase 8 (LGPD, Segurança & Governança)

- `[x]` **Task 1: LGPD Data Subject Rights**
  - `[x]` Endpoint DELETE `/api/lgpd/titular/:contactId` (exclusão lógica + anonimização) (Step 71)
  - `[x]` Endpoint GET `/api/lgpd/titular/:contactId/export` (portabilidade de dados) (Step 72)
  - `[x]` Worker de anonimização automática 90 dias após desqualificação (Step 73)

- `[x]` **Task 2: Audit Trail**
  - `[x]` Middleware `auditLog.middleware.ts` que registra acessos a dados pessoais (Step 74)
  - `[x]` Mascaramento de PII (email, phone) nos logs estruturados (Step 75)

- `[x]` **Task 3: Hardening de APIs**
  - `[x]` Rate limiting com `express-rate-limit` em endpoints sensíveis (Step 76)
  - `[x]` CORS policy estrita configurável por `ENV` (Step 77)
  - `[x]` Validação com Zod nos webhooks críticos (voice-result, bland) (Step 78)

- `[x]` **Task 4: IA & Dados**
  - `[x]` Sanitizador de PII antes de enviar contexto para LLMs externos (Step 79)
  - `[x]` Arquivo `docs/lgpd-base-legal.md` documentando base legal por tipo de dado (Step 80)
