# Onda 24 — Item 3/15: CYC-007, conectar dealClosure.ts ao fechamento manual

## Identificação
- Origem: `docs/CADENCE-CYCLE-AUDIT.md`, seção CYC-007 — `dealClosure.ts`
  (`isDeterministicCloseEvent`) existia bem desenhado e testado, mas nunca era chamado por
  `LeadUseCases.updateLeadStatus` — qualquer humano com papel de escrita movia um lead para
  "Negócios Ganhos" sem nenhuma evidência anexada.
- SHA de entrada: `main` pós-merge do PR da onda-23 (item 2, CYC-002)
- Branch: `claude/cyc-007-deal-closure`
- Status: **RESOLVIDO**

## Decisão de produto (confirmada com o usuário antes de implementar)

O próprio audit já sinalizava que este item não era uma correção pontual de baixo risco: exigir
evidência estruturada (assinatura/pagamento) antes de fechar bloquearia o fluxo manual em produção
hoje, já que CYC-005 (versionamento de proposta) e CYC-006 (assinatura eletrônica) ainda não têm
integração real de provedor. Levei duas opções ao usuário via `AskUserQuestion`:

1. **Auto-evidência via confirmação manual (escolhida)** — não muda o fluxo visível: ao mover para
   "Negócios Ganhos", o sistema cria automaticamente evidência real (Note + DealClosureEvent
   `manual_crm_confirmation`), e o gate bloqueia só fechamentos que pareçam vir de IA/automação.
2. Bloquear até existir evidência estruturada — rejeitada, quebraria o fluxo hoje em produção.

## O que foi encontrado na investigação (antes de implementar)

A auditoria original já sabia de 1 caminho de escrita (`LeadUseCases.updateLeadStatus`, drag no
Kanban). Reler o código nesta rodada encontrou **mais dois**, que também precisavam do gate para a
correção ser real e não deixar duas portas abertas:

1. `LeadUseCases.updateLeadStatus` — drag-and-drop no Kanban (`PATCH` só com `status`).
2. `LeadUseCases.updateLead` — edição completa do lead, quando o payload inclui `status`.
3. `PrismaCrm360Repository.updateLeadStage` — módulo CRM360 separado, quando a etapa de destino
   tem `leadStatus: Negocios_Ganhos` (`isWon: true` na seed de `DEAL_STAGES`).

## O que foi construído

- **`src/features/cadence/domain/dealClosure.ts`** — sem alterações; domínio puro já correto,
  só precisava de um chamador real.
- **`src/features/crm/application/dealClosureGate.ts`** (novo) — `ensureManualDealClosureAllowed`,
  orquestração que chama `evaluateDealClosure` com `type: 'manual_crm_confirmation'`,
  `evidenceRef` = id de uma `Note` criada na hora, `triggeredBy` = id do usuário autenticado. Lança
  `AppError` 403 quando `evaluateDealClosure` rejeita (hoje, só quando `triggeredBy` parece IA —
  nunca deveria acontecer com um `actorUserId` real, mas o gate existe justamente para isso).
- **`src/features/crm/infra/PrismaDealClosureGate.ts`** (novo) — implementação real do port:
  cria a `Note` e persiste o `DealClosureEvent` (enum Postgres mapeado, mesmo padrão de
  `PrismaCadenceRunRepository`). `DealClosureEvent` sai da lista de "tabelas mortas confirmadas".
- **3 pontos de chamada atualizados**, todos passando o `actorUserId` real do usuário autenticado
  (nunca um valor fabricado) e chamando o gate ANTES de qualquer escrita em `Lead.status`:
  - `LeadUseCases.updateLeadStatus`/`updateLead` (+ `LeadController.updateLead` repassando
    `req.user.id`).
  - `PrismaCrm360Repository.updateLeadStage` (+ `Crm360UseCases.updateLeadStage` +
    `Crm360Controller.moveRecord` repassando `req.user.id`), gate acionado só quando
    `stage.leadStatus === LeadStatus.Negocios_Ganhos` — os outros 11 status de
    `CrmPipelineStage` não são afetados.
- Todos os parâmetros novos (`actorUserId`) são opcionais nas assinaturas — nenhum chamador
  existente quebra; o gate só é obrigatório quando o destino é literalmente "Negócios Ganhos".

## Gate final
- typecheck: `npx tsc --noEmit` — limpo, 0 erros
- lint: `npm run lint` — 0 erros, 80 warnings (mesmo nível pré-existente do branch base)
- unit: `npx vitest run -c vitest.unit.config.ts` — **170/170 arquivos, 1326/1326 testes** (novo
  arquivo `tests/unit/features/crm/application/dealClosureGate.test.ts`, 6 casos: aceite humano
  real, rejeição para 4 variações de `actorUserId` com cara de IA/automação, verificação de
  `statusCode: 403`)
- integration: `npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts`
  (Postgres + Redis reais) — **36/36 arquivos, 161/161 testes**, incluindo o novo
  `tests/integration/dealClosureGate.test.ts` (8 casos cobrindo os 3 caminhos de escrita: humano
  real cria Note+DealClosureEvent reais; sem `actorUserId` rejeita e não move o lead; `actorUserId`
  com cara de IA rejeita e não grava evento; mover para um status/etapa que não é "Negócios Ganhos"
  nunca aciona o gate) — mais `rbac-e2e-crm-operations.test.ts`/`leads.test.ts` (13 testes) sem
  regressão
- build: `npm run build` e `npm run build:worker` — ambos limpos
- e2e: não executado (mudança de backend sem UI nova — o Kanban/CRM360 já existentes continuam
  funcionando exatamente como antes do ponto de vista do usuário)

## Skips e flakes
0 — nenhum teste pulado ou instável observado nesta rodada.

## Decisão

**Resolvido**, dentro do escopo decidido com o usuário. `dealClosure.ts` agora tem 3 chamadores
reais (não 1, como a auditoria original supunha) e todos os 3 passam pelo gate. A garantia central
do item — nenhum fechamento automatizado de negócio — é real e testada contra Postgres, não
teórica. O que fica fora de escopo (bloquear fechamento humano sem evidência estruturada) foi uma
decisão de produto explícita do usuário, documentada em `docs/CADENCE-CYCLE-AUDIT.md`, não uma
omissão. Criação de lead já fechado via `POST /api/crm/leads` (4º caminho teórico, sem fluxo de UI
real) documentada como fora de escopo desta rodada.
