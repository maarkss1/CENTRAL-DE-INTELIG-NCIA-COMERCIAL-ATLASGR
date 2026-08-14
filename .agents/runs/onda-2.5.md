# Onda 2.5 - Saneamento pós-Onda 2

- Status: EM ANDAMENTO
- Coordenador: Agente 00
- Branch de integração: `integracao/onda-2.5-saneamento`
- Base inicial congelada: `main@098aef11401b291fb3fe04ec4c79267a4805652a`
- PR técnica de validação: #109 contra `validation/onda-2.5-base`
- Regra de segurança: sem merge em `main` e sem deploy até gate explícito.

## Objetivo

Fechar lacunas herdadas da Onda 2 antes do gate formal da Onda 3, sem recriar trabalho já entregue e sem afrouxar isolamento multi-tenant.

## Escopo aprovado

1. AILog / RLS: eliminar a falha silenciosa de persistência de consumo de IA e cobrir o caminho legítimo sob RLS.
2. Automações: persistir histórico por execução, incluindo sucesso/falha e correlação.
3. Handoffs: revisar e encerrar itens tecnicamente resolvidos, preservando evidência.
4. Integrações: revisar thresholds e testes de RBAC, com atenção ao opt-out do Birth Voice.
5. Qualidade: executar os E2E que ficaram pendentes na Onda 2.
6. Gate: consolidar typecheck, lint, unit, integration, E2E, verify:integrations, verify:ai e build.

## Especialistas integrados

- Agente 01: PR #104, AILog/RLS, integrado na branch de saneamento.
- Agente 06: PR #105, RBAC de opt-out do Birth Voice, integrado na branch de saneamento.
- Agente 07: PR #106, fechamento documental de RBAC IA, integrado na branch de saneamento.

Os especialistas trabalharam em branches independentes e a integração foi serial, preservando o limite de até 3 frentes especialistas.

## AILog / RLS

Diagnóstico confirmado:

- `AILog.organizationId` é nullable para preservar registros legados e telemetria interna não atribuída.
- a policy histórica `FOR ALL` bloqueava inserções internas com `organizationId = null` quando não havia `requestContext` de tenant;
- `logAiUsage()` usa `requestContext.getStore()?.tenantId` como `organizationId`;
- não havia justificativa para transformar ausência de tenant em bypass de leitura ou escrita cross-tenant.

Entrega do Agente 01:

- migration `20260813230000_fix_ailog_rls_unattributed_internal_writes`;
- policy monolítica separada em SELECT/INSERT/UPDATE/DELETE;
- leitura e mutações atribuídas continuam tenant-scoped;
- log sem atribuição é aceito somente por conexão interna, nunca pelas roles PostgREST `anon`/`authenticated`.

Cobertura adicionada na Onda 2.5:

- `tests/integration/ailog-rls.test.ts`;
- escrita do tenant correto;
- bloqueio de escrita cross-tenant;
- telemetria interna não atribuída;
- invisibilidade da telemetria não atribuída para tenant comum;
- SELECT sem vazamento entre organizações.

Status: IMPLEMENTADO, aguardando execução do gate isolado.

## Histórico persistente de automações

A lacuna da Onda 2 foi fechada sem criar uma tabela redundante. A implementação reutiliza `AuditLog`, que já é persistente, tenant-scoped e protegido por RLS.

Arquivos:

- `src/features/automations/automation-history.service.ts`;
- `src/features/automations/automation.engine.ts`;
- `tests/unit/features/automation-engine-run.test.ts`.

Contrato persistido por execução:

- `automationId` e nome;
- `organizationId`;
- `correlationId` único;
- trigger, entidade e `entityId`;
- ação e snapshot sanitizado de `actionConfig`;
- status `success` ou `failed`;
- início, fim e duração;
- retryCount;
- erro sanitizado.

Proteções:

- chaves e tokens conhecidos são redigidos do snapshot/erro;
- chamada de worker sem AsyncLocalStorage cria contexto RLS a partir do tenant do evento;
- evento cross-tenant é recusado quando já existe contexto autenticado de outro tenant;
- falha ao gravar o histórico é reportada, mas não desfaz uma ação comercial já concluída nem derruba o fluxo principal.

Status: IMPLEMENTADO, aguardando execução do gate isolado.

## RBAC de integrações

Entrega do Agente 06:

- `POST /api/integrations/birth-voice/suppressions` autorizado para `ADMIN`, `GESTOR` e `VENDEDOR`;
- `VISUALIZADOR` continua bloqueado;
- ausência de sessão continua 401;
- teste unitário cobre matriz 201/403/401;
- racional: opt-out de discagem precisa poder ser registrado imediatamente por quem está atendendo.

Status: IMPLEMENTADO, aguardando execução do gate isolado antes de fechar o handoff funcional.

## Handoffs stale

- `.agents/handoffs/onda-1/01-para-07-role-gates-intelligence.md` foi corrigido de `aberto` para `resolvido` porque o próprio conteúdo já registrava correção e testes anteriores.
- nenhuma autorização de IA foi relaxada nesta onda.

Status: RESOLVIDO DOCUMENTALMENTE.

## CI e E2E

### Dependências

O preview da Vercel morria em `npm install` por conflito herdado entre `eslint@10.8.1` e `eslint-plugin-jsx-a11y@6.10.2`.

A Onda 2.5 transplantou somente os 3 blobs do primeiro commit validado do PR #103:

- `package.json`: ESLint `^9.39.5`;
- `package-lock.json` correspondente;
- mock corrigido de `whatsappSignal.worker.test.ts`.

Não foram importados os outros arquivos do PR #103.

### E2E determinístico

O CI do PR #103 mostrou 42 testes E2E passando, 5 skipped, 1 falha e 2 flakes. A falha determinística era `tests/e2e/crm-board.spec.ts`, que usava `getByText('Lead')` e colidia com múltiplos elementos.

Na Onda 2.5 o smoke foi refeito para:

- autenticação real via `signUp()`;
- heading `Leads e pré-vendas`;
- headings reais `Lead Recebido`, `Cadência Iniciada`, `Qualificação (SDR)` e `Reunião Agendada`;
- aba `Leads` validada por role/`aria-pressed`;
- remoção do teste legado de drag com seletores `data-rbd-*`, que podia ficar verde sem executar drag porque o board atual usa dnd-kit.

Os 2 flakes de teclado de `crm-kanban.spec.ts` continuam sendo tratados como problemas separados e não foram mascarados.

### Gate isolado

O CI principal do repositório só dispara `pull_request` para `main`/`master`. Para não validar a onda contra o `main` atual, foi criada a base congelada `validation/onda-2.5-base` e a PR técnica #109.

Na base de validação foi adicionado `.github/workflows/onda-2.5-validation.yml`, restrito a essa branch, com actions pinadas por SHA e os passos:

1. `npm ci`;
2. bootstrap do papel NOSUPERUSER;
3. Prisma generate;
4. typecheck;
5. lint;
6. unit;
7. migrations;
8. integration;
9. verify integrations;
10. verify AI;
11. Playwright Chromium;
12. E2E;
13. build.

`verify:ai` está temporariamente com `continue-on-error` no workflow técnico porque o runner não possui garantia de credenciais de provedor. O relatório final deve registrar o resultado real e não tratá-lo como PASS se o provedor não executar.

## Incidente de segurança descoberto durante a onda

Enquanto a Onda 2.5 trabalhava sobre a base congelada, `main` avançou para `195c0423b3c34cc44f0ecc100b247e31eedb8d96` e introduziu scripts one-off de voz contendo uma credencial de API e dados operacionais hardcoded.

Contenção preparada sem tocar em `main`:

- branch `security/remove-exposed-voice-credentials`;
- PR draft #107;
- remoção dos quatro scripts one-off comprometidos.

A remoção dos arquivos NÃO elimina a exposição histórica da credencial. A credencial comprometida precisa ser revogada/rotacionada no provedor antes de qualquer release.

Por esse motivo a Onda 2.5 não sincronizou o `main` novo para dentro da branch de saneamento.

## Testes / gate

Nenhum PASS será declarado sem execução real.

| Gate | Estado |
|---|---|
| `npx tsc --noEmit` | PENDENTE - workflow #109 |
| `npm run lint` | PENDENTE - workflow #109 |
| `npm run test:unit` | PENDENTE - workflow #109 |
| `npm run test:integration` | PENDENTE - workflow #109 |
| `npm run test:e2e` | PENDENTE - workflow #109 |
| `npm run verify:integrations` | PENDENTE - workflow #109 |
| `npm run verify:ai` | PENDENTE - workflow #109 / depende de provider |
| `npm run build` | PENDENTE - workflow #109 |
| SonarQube | BLOQUEADO no workflow legado antes do primeiro step |
| varredura de segredos do diff | PENDENTE |
| rotação da credencial exposta em `main` | BLOQUEADOR EXTERNO |

## Decisão atual

`ONDA 2.5 EM ANDAMENTO`

Não autoriza Onda 3, merge em `main` ou deploy.