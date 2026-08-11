---
name: functional-completeness
description: Use ao investigar se uma funcionalidade específica (botão, formulário, tela) que parece pronta visualmente realmente funciona ponta a ponta — existe, aceita interação, chama o backend, persiste, sobrevive a reload, trata erro e respeita permissão. Detecta formulário cenográfico, estado só local, e feature escondida atrás de UI funcionando.
---

# Functional Completeness — Central de Inteligência Comercial ATLASGR

## Quando usar

Ative quando a dúvida for sobre **uma funcionalidade concreta**: "o formulário de empresa salva de
verdade?", "o botão enriquecer faz algo?", "essa configuração persiste?". Para uma jornada
multi-etapa (lead → conversão → Bitrix), combine com `end-to-end-flow-validator`. Para agregação em
nível de produto, isso alimenta `release-readiness`, não o substitui.

## Missão

Provar — não assumir — que uma funcionalidade percorre a cadeia completa:

```
EXISTE → ABRE → ACEITA INTERAÇÃO → CHAMA BACKEND → PERSISTE → RECARREGA → MANTÉM DADO
      → TRATA ERRO → RESPEITA PERMISSÃO
```

Uma feature só está "completa" quando todos os elos foram verificados. Parar em "o formulário
renderiza e o `onSubmit` chama uma função" é leitura de código, não prova de funcionamento — o elo
que mais falha neste projeto historicamente é justamente "chama backend → persiste" (ver Pilot 002
em `.claude/PILOTS.md`: `CrmPipeline`/`CrmProduct`/`CrmDealItem`/`CrmCommercialDocument` estavam
listados em `auditableModels` — o que faz o Prisma injetar `deletedAt: null` em toda leitura — mas
as migrations nunca criaram essa coluna nesses 4 modelos; a única ação alcançável pela UI que usava
esse caminho quebrava com `PrismaClientValidationError` em produção, e isso só apareceu ao escrever
um teste de RBAC ponta-a-ponta, não por leitura de código).

## Antes de editar

Leia primeiro:

- **Arquitetura real da feature**: este projeto tem dois padrões de camada coexistindo. Domínios
  centrais (`src/features/crm/`, `src/features/companies/`, `src/features/contacts/`) seguem
  hexagonal completo: `routes/` → `presentation/*Controller.ts` → `application/*UseCases.ts` →
  `domain/*.ts` (interface) → `infra/Prisma*Repository.ts`, resolvidos via DI
  (`src/shared/di/container.ts`/`setup.ts`). Outros domínios (`integrations/bitrix`, `automations`,
  `analytics`, `reports`, `knowledge`, `notifications`, `team`, `billing`, `intelligence`) só têm
  `routes/*.routes.ts` + `*.service.ts`, sem as quatro camadas. Antes de investigar, identifique
  qual padrão a feature usa — isso muda onde procurar o elo que falta.
- **Validação de entrada**: `src/shared/middlewares/validateRequest.ts` + schemas Zod centralizados
  em `src/lib/zod.ts` (ex.: `leadSchema`, `LEAD_STATUS`). Uma feature que parece completa mas usa
  uma lista de status/enum duplicada localmente em vez de importar de `zod.ts` é candidata a bug de
  divergência (foi exatamente o achado do Piloto 002: estágios do funil "Negócio" existiam no enum
  e no board, mas o dropdown do `LeadDetailDrawer` e o filtro de automações usavam listas locais
  desatualizadas — 7 estágios inalcançáveis pela UI apesar de "existirem" no sistema).
- **Cliente de API**: `src/lib/api.ts` (`apiFetch`) já tem um comportamento de contrato duplo — lida
  com resposta padronizada `{success, data, meta}` e também com resposta "crua" não-padronizada
  como fallback. Isso pode mascarar um endpoint que nunca foi migrado pro formato padrão — ver
  `api-contracts`.
- `PRODUCT_EXPERIENCE_CENTRAL_ATLASGR.md` — já documenta features suspeitas de incompletude (ex.:
  `Settings.tsx` como possível stub órfão sem rota, múltiplas superfícies de chat de IA sem entry
  point único). Confirme o estado atual antes de tratar como novidade — código muda mais rápido que
  documentação.

## Investigação

Para a funcionalidade em questão, percorra cada elo e **anote onde a cadeia foi verificada de fato
vs. apenas lida**:

1. **EXISTE** — o componente/rota está registrado e alcançável (rota real sob `/app/*`, não estado
   local trocando `<Tab>`)? Aparece em algum menu/entry point real, ou só existe no código sem link
   nenhum até ela (achado real do Piloto 002 antes da correção: o funil "Negócio" não tinha
   nenhuma rota/toggle alcançável)?
2. **ABRE** — modal/drawer/rota realmente monta sem erro de console/rede.
3. **ACEITA INTERAÇÃO** — inputs aceitam valor, botão dispara o handler esperado (não só
   `console.log`/estado local sem próximo passo).
4. **CHAMA BACKEND** — o handler realmente dispara um `apiFetch`/`api.*` real, não é cenográfico.
   Confirme via Network (Playwright) ou lendo se a função chamada de fato tem um `fetch`/`api.post`
   no fim da cadeia, não um `TODO`/mock deixado pra trás.
5. **PERSISTE** — a rota Express correspondente existe, passa por `validateRequest`, chega até uma
   escrita Prisma real (não um handler que responde 200 sem tocar o banco).
6. **RECARREGA** — dar reload na tela (ou consultar a API diretamente) depois da ação.
7. **MANTÉM DADO** — o dado sobrevive ao reload com o valor esperado, não reverte pro estado
   anterior nem aparece vazio.
8. **TRATA ERRO** — force um erro (payload inválido, rede offline, 500 simulado) e confirme
   feedback real ao usuário, não um catch mudo — ver `error-resilience` para o catálogo completo
   desse padrão.
9. **RESPEITA PERMISSÃO** — teste com um papel sem permissão (`VISUALIZADOR` tentando uma ação de
   `ADMIN`/`GESTOR`) e confirme que o backend bloqueia (`requireRole`), não só a UI esconde o
   botão — UI escondendo o botão sem o backend bloquear é uma funcionalidade "insegura", não
   "completa".

### Exemplos deste produto para calibrar o que procurar

- **Empresa**: criar → `CompanyController`/`CompanyUseCases` → `PrismaCompanyRepository` →
  Postgres → reload → empresa persiste com `organizationId` correto (RLS).
- **Lead**: criar → editar → mover de estágio (Kanban, `PUT /api/crm/records/:id/stage`) →
  enriquecer (`enrichment.service.ts`) → converter → persistir → aparecer também no lado
  Bitrix se exportação estiver ativa (ver `integration-audit` para o estado real dessa ponte —
  hoje incompleta, ver `BITRIX24-LEAD-FLOW-AUDIT.md` P0-1/P1-1: dado de qualificação nunca cruza
  a fronteira Bitrix↔Atlas, mesmo com a UI de export "funcionando mecanicamente").
- **Configuração**: alterar → salvar → reload → valor permanece (não confundir com um `useState`
  que "parece" persistido porque a tela não foi desmontada).

## Processo de execução

1. Classifique a feature pelo padrão de camada (hexagonal completo vs. routes+service) antes de
   procurar o elo quebrado — isso direciona onde olhar.
2. Percorra os 9 elos na ordem; pare no primeiro elo quebrado e registre — não continue verificando
   elos posteriores como se o anterior tivesse passado.
3. Sempre que possível, prove com execução real (Playwright, `curl`/`httpie` contra a API, teste de
   integração) em vez de inferir pela leitura do código — a lição do Piloto 002 é que leitura de
   código pode parecer "wired" e quebrar no primeiro uso real.
4. Se a feature depende de integração externa, delegue a checagem dessa ponta a `integration-audit`
   em vez de reimplementar a investigação aqui.

## Evidências necessárias

Para declarar um elo "quebrado", cite:

- O comando/request exato executado e a resposta real (não “deveria retornar X”).
- Se foi leitura de código (elo não executado), diga isso explicitamente — é uma suspeita, não uma
  prova, e deve ser marcado como tal no relatório.
- Para "MANTÉM DADO": mostre o valor antes e depois do reload, não só "parece que persistiu".

## Regras de implementação

Se for pedido para completar um elo faltante: siga o padrão de camada já usado pela feature (não
introduza hexagonal completo numa feature que hoje é routes+service só para essa correção, a menos
que pedido explicitamente); reutilize `validateRequest` + schema Zod existente ou centralizado em
`src/lib/zod.ts` em vez de validação ad-hoc; reutilize o padrão de resposta `{success, data}` de
`errorHandler.ts`/`api.ts` em vez de inventar um formato novo.

## Validação

- Specs de integração relevantes (`tests/integration/*.test.ts` — já cobrem RLS/tenant isolation e
  RBAC para leads/companies/contacts/activities).
- Specs E2E relevantes (`tests/e2e/crm.spec.ts`, `leads-crud.spec.ts`,
  `contact-company-forms.spec.ts`) — rodam contra o servidor Express real (`start:e2e`), não mock.
- Se nenhuma suíte cobre a feature em questão, isso por si é um achado a reportar (lacuna de
  cobertura), não motivo para pular a verificação manual.

## O que não fazer

- Não declare uma feature "completa" com base só em "o código parece chamar a API certa" — sem
  execução real (ou teste automatizado real) isso é uma hipótese.
- Não corrija o elo quebrado sem entender **por que** ele quebrou (schema desatualizado? router não
  montado em `server.ts`? enum divergente?) — corrigir o sintoma sem a causa raiz reintroduz o bug
  na próxima mudança adjacente (ver `database-integrity` para a classe de bug "modelo assume coluna
  que a migration nunca criou").
- Não amplie o escopo para "modernizar" a feature enquanto verifica se ela funciona — funcional
  completeness não é refatoração.

## Quando parar e pedir aprovação de escopo/Git

Pare se a correção do elo quebrado exigir mudança de schema/migration (delegue a
`database-integrity` e confirme com o usuário antes), mudança de contrato de API consumida por
outras telas (`api-contracts`), ou tocar uma integração externa (`integration-audit`) — essas
exigem alinhamento de escopo antes de codificar.

## Critérios de conclusão

- [ ] Todos os 9 elos foram percorridos e o resultado de cada um está registrado (passou/falhou/não
      verificável neste ambiente).
- [ ] Todo "passou" tem evidência de execução real, não só leitura de código — e onde só foi
      possível ler código, isso está marcado como tal.
- [ ] RESPEITA PERMISSÃO foi testado com um papel sem acesso, não inferido pela ausência do botão
      na UI.
- [ ] Se um elo quebrado foi corrigido, a causa raiz está identificada, não só o sintoma.
- [ ] Se a feature envolve mudança visual perceptível na correção, `ui-ux`/`accessibility`/
      `visual-qa` foram consultadas antes de reportar concluído.
