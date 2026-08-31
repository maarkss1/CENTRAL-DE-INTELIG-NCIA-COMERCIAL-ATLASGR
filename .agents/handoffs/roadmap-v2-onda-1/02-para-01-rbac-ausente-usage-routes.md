- De: Agente 02 — Produto e UX
- Para: Agente 01 — Plataforma, Segurança e Dados
- Onda: roadmap-v2-onda-1
- Status: resolvido
- Prioridade: bloqueador

## Problema

`GET /api/usage` (consumo/custo de IA da organização) está montado só com
`authenticateToken` + `requireTenant` — sem `requireRole` nenhum. Qualquer usuário autenticado do
tenant (SDR, CLOSER, VISUALIZADOR, não só ADMIN/GESTOR) pode chamar o endpoint diretamente e ler o
consumo/custo agregado de IA da organização inteira, mesmo que o frontend trate esse dado como
admin-only.

Isso é exatamente o padrão do bloqueador prioritário nº 2 de `/AGENTS.md` ("Rotas administrativas
autenticadas sem autorização por cargo/permissão"): a Sidebar (`src/components/layout/Sidebar.tsx`,
propriedade do Agente 02) só revela o item "Consumo de IA" (`usage`) para `isAdmin`, sinalizando que
o produto trata este dado como administrativo — mas a ocultação é só visual. Sem checagem de papel
no backend, qualquer usuário pode contornar isso com uma chamada direta à API (curl/devtools), sem
precisar de bug nenhum no frontend.

Não corrigi isso diretamente porque `src/features/billing/usage.routes.ts` e
`src/bootstrap/routes.ts` estão fora da propriedade do Agente 02 nesta onda (só
`src/App.tsx`, `src/components/layout/`, `src/features/settings/`, `src/features/dashboard/`,
`src/features/onboarding/`).

## Arquivo(s) envolvido(s)

- `src/features/billing/usage.routes.ts` (rota `GET /` sem `requireRole`)
- `src/bootstrap/routes.ts:87` (montagem: `app.use('/api/usage', authenticateToken, requireTenant, usageRoutes)`, sem `requireRole`)

Comparar com o padrão já correto em `src/features/automations/routes/automation.routes.ts`
(`managementRoles = requireRole(['ADMIN', 'GESTOR'])` nas mutações) e
`src/features/team/routes/team.routes.ts` (`router.use(requireRole(['ADMIN']))`).

## Alteração necessária

Decidir e aplicar o nível mínimo de papel exigido para `GET /api/usage` (`requireRole(['ADMIN',
'GESTOR'])` é o candidato mais consistente com o resto do módulo "Administração" da Sidebar, que já
trata `automations`/`integrations` como ADMIN+GESTOR — ver Sidebar.tsx desta mesma onda). Se a
decisão de produto for manter leitura aberta a todo usuário do tenant (dado não sensível o
suficiente para restringir), documentar isso explicitamente no arquivo de rotas para que a
Sidebar possa ser ajustada de volta a "visível para todos" em vez de ADMIN-only — hoje há uma
divergência entre o que a UI promete (dado restrito a admin) e o que o backend realmente aplica
(nenhuma restrição).

## Teste esperado

- Teste de integração/rota cobrindo `GET /api/usage` com um usuário SDR/CLOSER/VISUALIZADOR
  autenticado esperando 403 (se a decisão for restringir), ou um teste/comentário explícito
  documentando a decisão de mantê-lo aberto (se a decisão for manter).
- Nenhuma regressão em `src/features/billing/components/Billing.tsx` para ADMIN/GESTOR.

## Contexto adicional

Enquanto este handoff está aberto, o Agente 02 manteve `usage` como ADMIN-only na Sidebar (não
ampliou para GESTOR como fez com `automations`/`integrations`), exatamente para não piorar a
exposição visual de um dado que já vaza por API a qualquer papel — ver comentário em
`Sidebar.tsx` linha ~30.

## Resolução
Adicionado requireRole(['ADMIN', 'GESTOR']) no bootstrap/routes.ts.
