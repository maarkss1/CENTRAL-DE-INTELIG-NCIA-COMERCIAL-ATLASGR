- De: Agente 01 (Plataforma, Segurança e Dados)
- Para: Agente 04 (CRM e BI)
- Onda: 1
- Status: aberto
- Prioridade: normal

## Problema

Ao fechar o bloqueador prioritário #2 do AGENTS.md ("Rotas administrativas autenticadas sem
autorização por cargo/permissão"), uma auditoria encontrou que `requireRole` só era usado em 5 de
22 arquivos de rota, e mesmo nesses só em `DELETE`. Praticamente todo `POST`/`PUT` do CRM (criar
lead, editar contato, mover estágio de negócio, gerar documento comercial, etc.) estava acessível
a qualquer papel autenticado — inclusive `VISUALIZADOR`, que o próprio front-end já documenta como
somente-leitura (`src/contexts/AuthContext.tsx`: `VISUALIZADOR: ['crm.read']`, sem `crm.write`).

Por ser um bloqueador da lista do AGENTS.md (não um item de backlog), apliquei a correção
diretamente nos arquivos abaixo — fora do meu escopo de propriedade (`src/features/**` não é meu),
mas necessário para o gate da Onda 1. Os arquivos passam a exigir:
- **`requireRole(['ADMIN', 'GESTOR', 'VENDEDOR'])`** (equivalente a `crm.write`) em criar/editar;
- **`requireRole(['ADMIN', 'GESTOR'])`** (equivalente a `crm.delete`/administrativo) em excluir e em
  operações de bulk import/export.

Nenhuma lógica de negócio foi alterada — só a linha de middleware antes do handler.

## Arquivo(s) envolvido(s)
- `src/features/crm/routes/lead.routes.ts` — `POST /`, `PUT /:id`, `POST /:id/enrich` → VENDEDOR+;
  `GET /export/csv`, `POST /export/bitrix24`, `POST /import/bitrix24` → GESTOR+ (bulk/LGPD-sensível).
- `src/features/contacts/routes/contact.routes.ts` — `POST /`, `PUT /:id`, `POST /:id/enrich` → VENDEDOR+.
- `src/features/companies/routes/company.routes.ts` — idem.
- `src/features/crm360/routes/crm360.routes.ts` — todos os `POST`/`PUT` não administrativos → VENDEDOR+;
  `DELETE /deals/:leadId/items/:id` → GESTOR+ (faltava gate nenhum antes).
- `src/features/automations/routes/automation.routes.ts` — CRUD inteiro → GESTOR+ (tratado como
  configuração administrativa, não escrita comum de CRM — regra afeta toda a organização).
- `src/features/activities/routes/activity.routes.ts` — `POST`/`PUT` → VENDEDOR+; `DELETE` → GESTOR+.
- `src/features/prospecting/routes/prospecting.routes.ts` — só `POST /promote` (cria Company+Contact+Lead) → VENDEDOR+.

## Alteração necessária
Revisar se os limiares de papel que escolhi fazem sentido pro seu domínio — em particular:
- `automations` como GESTOR+ em vez de VENDEDOR+ foi minha leitura de "afeta toda a organização",
  mas pode fazer mais sentido VENDEDOR+ se vendedores devem poder criar suas próprias automações;
- `crm360` tem bastante superfície (deals, documentos comerciais, itens) — vale conferir se algum
  desses deveria ser GESTOR+ em vez de VENDEDOR+ dependendo do impacto financeiro.

Não é bloqueador de você fazer nada agora — é só para você saber que a mudança existe antes de
mexer nesses arquivos na Onda 2, e ajustar o limiar se achar que errei a régua em algum caso.

## Teste esperado
Testes de matriz de acesso (role permitido/negado) para os endpoints acima, se ainda não existirem
quando você tocar nesses arquivos — hoje só há cobertura direta para `intelligence.routes.ts`
`PUT /ai-settings` (`tests/unit/features/intelligence/routes/intelligence.routes.test.ts`) e para
`DELETE /api/leads/:id` ponta-a-ponta (`tests/integration/rbac-e2e.test.ts`, bloqueado por Docker
neste ambiente).

## Contexto adicional
Ver relatório completo do Agente 01 na resposta ao usuário desta sessão (Onda 1) para a lista
completa dos 17 arquivos alterados nesta auditoria de autorização, incluindo os que pertencem ao
Agente 06 e ao Agente 07 (handoffs separados: `01-para-06-role-gates-integracoes.md`,
`01-para-07-role-gates-intelligence.md`).
