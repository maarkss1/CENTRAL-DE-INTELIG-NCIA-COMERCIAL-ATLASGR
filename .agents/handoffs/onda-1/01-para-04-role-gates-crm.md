- De: Agente 01 (Plataforma, Segurança e Dados)
- Para: Agente 04 (CRM e BI)
- Onda: 1
- Status: resolvido
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

## Resolução

Revisado na Onda 7, ao mexer de novo nos arquivos citados (mission: auditoria de forecast/BI, que
passou por `lead.routes.ts`/`contact.routes.ts`/`company.routes.ts`/`activity.routes.ts` para
confirmar posse/rastreabilidade de dado comercial). A nota informativa da Onda 1 já tinha sido
revisada uma vez na Onda 5 (`.agents/runs/onda-5.md`: "deixado para quando o Agente 04 mexer
nesses arquivos de novo") — chegou a vez agora.

Conferi os limiares linha a linha nos quatro arquivos do meu escopo:
- `lead.routes.ts`: `POST /`, `PUT /:id`, `POST /:id/enrich` → VENDEDOR+ (restrito ao próprio lead
  via `requireLeadOwnership`, adicionado depois da Onda 1); `DELETE /:id`, `export/import
  bulk/Bitrix` → GESTOR+.
- `contact.routes.ts`, `company.routes.ts`: mesmo padrão (`POST`/`PUT`/`enrich` → VENDEDOR+;
  `DELETE` → GESTOR+).
- `activity.routes.ts`: `POST`/`PUT` → VENDEDOR+; `DELETE` → GESTOR+.

Concordo com os limiares que o Agente 01 escolheu — fazem sentido para o meu domínio: um VENDEDOR
cria/edita o que é dele, mas excluir (e as operações administrativas de bulk/LGPD-sensíveis como
export/import CSV/Bitrix24) ficam com GESTOR/ADMIN. Nenhuma mudança de limiar foi necessária.

`crm360.routes.ts` e `automations/routes/automation.routes.ts` (as duas ressalvas que o Agente 01
levantou para eu revisar) não pertencem ao meu escopo nesta onda (`crm360` não está listado na
matriz de propriedade da Onda 7; `automations` é do Agente 07) — não os toquei, e não é necessário:
a pergunta original ("VENDEDOR devia poder criar as próprias automações?") é uma decisão de
produto, não uma correção de bug, então cabe a quem é dono do arquivo decidir se muda.

**Teste esperado do handoff original:** `rbac-e2e.test.ts` (TEST-006, `DELETE /api/leads/:id`) e
`rbac-e2e-crm-operations.test.ts` (mover estágio, converter, reenriquecer, importar Bitrix) já
cobriam lead ponta-a-ponta antes desta onda. `company`/`contact`/`activity` só tinham um teste
unitário com role `ADMIN` fixo (sem caso de negação). Adicionei
`tests/integration/rbac-e2e-crm-write-routes.test.ts` cobrindo, com sessão real (mesmo padrão de
`signUpRealUser`/RLS real dos specs acima): `POST`/`DELETE` de company, contact e activity com
VISUALIZADOR negado (403, sem escrever no banco), VENDEDOR liberado para escrita e barrado em
DELETE, GESTOR liberado para DELETE, e 401 sem sessão.

Durante essa revisão também encontrei e corrigi um bug real e não relacionado ao limiar de role em
si: `requireLeadOwnership` (que restringe VENDEDOR a só editar o próprio lead) comparava
`Lead.owner === user.id`, mas leads importados do Bitrix24 gravam `Lead.owner` como o NOME do
responsável, não o id (`resolveAtlasUserNameByEmail`) — um VENDEDOR levava 403 tentando editar um
lead legitimamente dele, só por ter vindo do Bitrix. Corrigido com um fallback defensivo no
middleware; causa raiz documentada e endereçada ao Agente 06 em
`.agents/handoffs/onda-7/04-para-06-owner-bitrix-nome-nao-id.md`.

Status: resolvido.
