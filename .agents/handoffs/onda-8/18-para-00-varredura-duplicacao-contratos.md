- De: 18
- Para: 00
- Onda: 8
- Status: aberto
- Prioridade: normal

## Problema
Varredura completa do repositório por duplicação de tipo/contrato (mesmo padrão de
`OverviewMetrics`: um tipo declarado de forma independente em mais de um lugar, descrevendo a
mesma forma de resposta de API/dado de domínio, sem import compartilhado). Além dos dois casos já
com handoff próprio a um dono (`OverviewMetrics` → 04/02, Comercial Inteligente → 04), encontrei 6
instâncias menores. Nenhuma é bug ativo hoje — todas têm campos batendo no momento desta varredura
— mas registro para o Coordenador decidir prioridade/distribuição entre ondas, já que abrangem
domínios de agentes diferentes e nenhuma foi pedida explicitamente pela minha missão desta onda.

## Arquivo(s) envolvido(s) e alteração sugerida por caso
1. **`ActivityListFilters`** — `src/features/activities/domain/Activity.ts:19-23` vs
   `src/features/activities/services/activity.service.ts:41-45`. Mesmo padrão "domain vs serviço
   legado" de `OverviewMetrics`/`analytics.service.ts` — vale checar se `activity.service.ts` ainda
   tem chamador vivo antes de decidir entre unificar ou remover código morto. Dono provável: 04
   (`src/features/activities/**` está no escopo dele).
2. **`IngestResult`** — `src/features/knowledge/ingestion.service.ts:23-29` (backend) vs
   `src/features/knowledge/knowledge.api.ts:30-35` (frontend). 4 campos idênticos
   (`id/title/chunkCount/embeddingFailures`). Dono provável: 07 (IA e Automações, RAG) + 02
   (consumo).
3. **`NotificationKind`** — `src/features/notifications/notification.service.ts:4` (backend) vs
   `src/features/notifications/notifications.api.ts:3` (frontend). União literal idêntica
   (`'Info'|'Sucesso'|'Alerta'|'Erro'`). Dono provável: 04/02 conforme quem administra
   `notifications`.
4. **`ActivityType`/`ActivityStatus` redeclarados em vez de importados** —
   `src/lib/zod.ts:29-30,37-38` é a fonte documentada (`ACTIVITY_TYPE`/`ACTIVITY_STATUS`), mas
   `src/features/calendar/calendar.api.ts:3-4` hardcoda a mesma união em vez de importar. Valores
   batem hoje; risco real se o backend mudar o enum e o frontend não acompanhar. Correção é trivial
   (trocar por import) — dono provável: 02 (frontend) ou 04 (calendar está listado no escopo dele).
5. **`Automation`/`AutomationTrigger`** — `src/features/automations/domain/Automation.ts:4-19`
   (backend, `trigger: AutomationTriggerLabel`, datas como `Date`, inclui `organizationId`) vs
   `src/features/automations/automations.api.ts:4,15-26` (frontend, `trigger: AutomationTrigger`,
   datas como `string`, sem `organizationId`). Diferença real de forma (não é cópia exata) —
   risco moderado, não tratar como duplicata simples: alguém do domínio de automações (07, por
   `AGENTS.md`) precisa confirmar qual é o formato correto antes de unificar.
6. **Entidades núcleo do CRM (`Company`/`Contact`/`Lead`/`Activity`/`Note`)** —
   `src/types/index.ts` (frontend, datas como `string`) vs `src/features/{companies,contacts,crm,
   activities,notes}/domain/*.ts` (backend, datas como `Date`). Mesmo padrão aplicado em escala
   muito maior que qualquer um dos casos acima — mas com a divergência Date→string esperada/
   sistemática de qualquer API JSON, não cópia acidental. Não recomendo tratar isso na Onda 8: é
   uma decisão de arquitetura maior (provavelmente um pacote de tipos gerados a partir do schema
   Zod/Prisma) que caberia como uma missão própria de uma onda futura, não como correção pontual.

## Teste esperado
Nenhum teste automatizado novo deste handoff em si — é um índice de descobertas para priorização.
Cada item, se e quando corrigido, deve seguir o mesmo padrão de teste dos handoffs 18-para-04 desta
onda: `npx tsc --noEmit` limpo após a extração para `src/shared/contracts/**`.

## Contexto adicional
Ver `.agents/handoffs/onda-8/18-para-04-unificar-overviewmetrics.md`,
`18-para-02-unificar-overviewmetrics-frontend.md` e
`18-para-04-duplicacao-commercial-intelligence-contract.md` para os dois casos já com dono e ação
proposta nesta mesma onda.
