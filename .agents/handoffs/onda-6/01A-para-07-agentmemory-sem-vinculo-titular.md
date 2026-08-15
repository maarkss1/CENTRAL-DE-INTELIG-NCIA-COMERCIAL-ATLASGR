- De: Agente 01A (Confiabilidade de Dados, RLS e Retenção)
- Para: Agente 07 (IA e Automações)
- Onda: 6
- Status: resolvido
- Prioridade: normal (a aplicação da migration proposta abaixo é o único passo restante, e é de
  propriedade exclusiva do Agente 01A)

## Resposta do Agente 07 (rodada de remediação pós-Onda 6)

## 1. Investigação: sessionId tem correlação determinística com leadId hoje?

**Resposta curta: parcialmente, e de forma inconsistente — nunca estruturada.** Levantamento
completo de todo ponto que grava `AgentMemory` (`grep -rn "agentMemory\." src/features/intelligence
src/shared`), oito pontos no total:

| Arquivo | Quem invoca / sessionId usado | leadId embutido? |
|---|---|---|
| `agents/base.agent.ts` (`updateMemory`, usado por BDR/Closer/CRM/Ops fora do enxame) | Default quando chamador não passa sessionId: `session-${agentType}-${Date.now()}` | **Não** |
| `agents/sdr.agent.ts` (`SDRQualificationAgent.run`) | Default quando chamador não passa sessionId: `` session-${leadId}-${Date.now()} `` | Sim (posição fixa, sem timestamp variável no meio) |
| `agents/ops.agent.ts` (`OpsAgent.run`) | Default: `session-ops-${Date.now()}` | **Não** (leadId chega só no conteúdo da mensagem, nunca no sessionId) |
| `agents/learning.agent.ts` (`getLearningProfile`/perfil de estilo) | `learningProfileSessionId(tenantId, actorId)` — chave por usuário, não por lead | **Não é lead-scoped por design** (perfil de estilo do vendedor, não do lead) |
| `agents/sdr-agent.ts` (`SDROutboundDraftAgent extends AgentService`) via `lib/queue/agent.worker.ts:63` | `` new SDROutboundDraftAgent(`session_${leadId}`, tenantId) `` | **Sim, sempre** (determinístico, não sobrescrevível pelo cliente — é um worker BullMQ) |
| `services/agent.service.ts` (`AgentService.saveMemory`, base do acima) | `this.sessionId` — o que a subclasse/chamador passar no construtor | Depende do chamador |
| `services/autonomyRoleRunner.service.ts` via `services/swarmScheduler.service.ts:341-344` (scheduler 24/7) | `` autonomy-${role}-${leadId}-${now.getTime()} `` | **Sim, sempre** (gerado pelo próprio scheduler, não vem de fora) |
| `agents/supervisor.agent.ts` (`sdrNode`/`bdrNode`/`closerNode`/`crmNode`/`opsNode`, enxame `/api/agent/swarm/*`) | **Antes desta correção:** `swarm-<role>-${state.step}` (SEM leadId, embora `state.leadId` já estivesse disponível) | **Não estava — corrigido nesta rodada, ver §3** |
| `routes/intelligence.routes.ts:113-137` (`POST /agents/sdr/qualify`, sem uso confirmado no frontend hoje) | `sessionId` vem opcionalmente do `req.body` do cliente; só cai no default de `sdr.agent.ts` (leadId embutido) se o cliente não mandar nada | **Não garantido** — um cliente que passe seu próprio `sessionId` quebra a correlação |

Conclusão: **não existe uma convenção única, obrigatória e estrutural.** Em vários pontos
(worker de outbound, scheduler autônomo) o leadId está embutido de forma confiável porque o
sessionId é gerado inteiramente pelo servidor. Em outros (rota HTTP direta do SDR, e — até esta
correção — todo o enxame supervisor/BDR/Closer/CRM/Ops) o leadId ficava ausente do sessionId ou
dependia do cliente não sobrescrever o default. Isso é exatamente o "risco alto de falso
positivo/negativo" que o handoff original apontou para não implementar via regex/scan de string
como mecanismo *primário* de exclusão — permanece verdade mesmo após a correção de código abaixo.

### Bug real encontrado durante a investigação (colateral, corrigido)

Em `supervisor.agent.ts`, o sessionId de cada especialista do enxame era `` swarm-<role>-${state.step} ``,
onde `state.step` é um contador que **reinicia a cada missão** (0/1 na primeira chamada de cada
missão, incrementando até `MAX_STEPS = 5`). Duas missões diferentes (leads diferentes, execuções
concorrentes ou sequenciais) cujo primeiro acionamento do mesmo especialista caísse no mesmo
`step` geravam o **mesmo sessionId** — e como `updateMemory`/`saveMemory` fazem
`findFirst({sessionId, organizationId}) → update` quando já existe, a segunda missão **sobrescrevia
silenciosamente a AgentMemory da primeira**, mesmo sendo leads sem relação alguma. Isso nunca foi
reportado porque não há assert sobre o conteúdo de `AgentMemory` nos testes existentes.

## 2. Correção de código aplicada nesta rodada (dentro do escopo do Agente 07)

`src/features/intelligence/agents/supervisor.agent.ts` — `bdrNode`/`closerNode`/`crmNode`/`opsNode`/
`sdrNode` agora usam um helper `swarmSessionId(role, state)`:

```ts
function swarmSessionId(role: 'sdr' | 'bdr' | 'closer' | 'crm' | 'ops', state: SwarmStateType): string {
    return state.leadId ? `swarm-${role}-lead_${state.leadId}-${state.step}` : `swarm-${role}-${state.step}`;
}
```

Efeito duplo:
1. **Corrige a colisão entre missões** — o sessionId agora é único por lead+step, não só por step.
2. **Melhora a correlação sessionId↔leadId** para todo o tráfego do enxame (que hoje é o principal
   ponto de entrada de IA no produto), sem tocar `prisma/schema.prisma`.

Isto é uma mitigação, não a solução — ver §1: nem toda gravação de `AgentMemory` no sistema segue
essa convenção, e regex sobre `sessionId`/conteúdo de `messages` nunca deve virar o mecanismo
"oficial" de uma exclusão de titular. A solução real é a migration abaixo.

Verificação rodada após a mudança:
- `npx tsc --noEmit` → sem erros.
- `npm run lint` → 0 erros, 101 warnings (todos pré-existentes, nenhum novo introduzido pela mudança).
- `npx vitest run -c vitest.unit.config.ts` (suíte completa) → **707/707 testes passando** (109
  arquivos), incluindo `agents/__tests__/supervisor.decision.test.ts` e
  `tests/unit/features/intelligence/services/swarmScheduler.service.test.ts`.

## 3. Migration proposta (para o Agente 01A aplicar — Agente 07 não editou schema/migrations)

### Decisão de modelagem

Seguir o mesmo padrão já usado em `ConversationSignal`/`TimelineEvent`/`Note`: campo `leadId`
apontando para `Lead` (não `contactId` direto). `eraseDataSubject`
(`src/shared/services/dataSubjectErasure.service.ts`) já resolve
`Contact → Lead[] (leadIds)` internamente antes de tocar `ConversationSignal`/`TimelineEvent` — o
mesmo array `leadIds` já calculado ali passa a alcançar `AgentMemory` sem nenhuma lógica nova de
resolução de titular, só mais um `updateMany`/redação.

Diferente de `ConversationSignal`/`TimelineEvent` (sempre lead-scoped, `leadId String` obrigatório),
`AgentMemory` tem sessões que **não são de lead nenhum** (perfil de estilo do usuário em
`learning.agent.ts`, e todo histórico anterior a esta mudança) — por isso `leadId` precisa ser
**opcional**, seguindo o mesmo raciocínio já documentado no schema para `organizationId` nesta
mesma tabela ("linhas legadas sem tenant conhecido ficam órfãs... em vez de apagadas ou expostas a
todos").

`onDelete: Cascade` para ficar consistente com `TimelineEvent`/`Note`/`ConversationSignal`: se o
Lead em si for excluído (hard delete, evento raro e diferente da anonimização de titular via
`eraseDataSubject`, que NUNCA apaga o Lead), a memória de agente daquele lead não tem razão de
sobreviver órfã.

### Alteração no `prisma/schema.prisma`

```prisma
model AgentMemory {
  id        String   @id @default(cuid())
  sessionId String
  agentType String
  messages  Json
  createdAt DateTime @default(now())

  // Nullable pelo mesmo motivo de KnowledgeChunk.organizationId: linhas legadas sem tenant
  // conhecido ficam órfãs e invisíveis sob RLS, em vez de serem apagadas ou expostas a todos.
  organizationId String?
  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  // Adicionado onda 6 (remediação) — Agente 07/01A: correlação estruturada com o Lead ao qual esta
  // sessão de agente pertence, para que eraseDataSubject (LGPD) consiga localizar e redigir a
  // memória de um titular específico. Opcional porque nem toda AgentMemory é lead-scoped (ex.:
  // perfil de estilo aprendido em learning.agent.ts, chaveado por usuário) e porque linhas
  // anteriores a esta migration não têm como ser retroativamente vinculadas com certeza (ver script
  // de backfill best-effort abaixo). onDelete: Cascade espelha TimelineEvent/Note/ConversationSignal
  // — se o Lead for excluído de verdade (não anonimizado), a memória de agente dele não deve ficar
  // órfã.
  leadId String?
  lead   Lead?   @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@index([organizationId])
  @@index([leadId])
}
```

No `model Lead { ... }`, adicionar a ponta inversa da relação (junto das demais `[]` de relação já
existentes, ex. perto de `TimelineEvent[]`/`ConversationSignal[]`):

```prisma
  agentMemories AgentMemory[]
```

### SQL da migration (`prisma/migrations/20260815120000_agent_memory_lead_id/migration.sql`)

```sql
-- AlterTable
ALTER TABLE "AgentMemory" ADD COLUMN "leadId" TEXT;

-- CreateIndex
CREATE INDEX "AgentMemory_leadId_idx" ON "AgentMemory"("leadId");

-- AddForeignKey
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

(Nome de arquivo/timestamp são sugestão — o Agente 01A deve gerar com `prisma migrate dev`/o
processo padrão do repo para garantir que o hash/ordem batam com o histórico real de migrations no
momento em que for aplicada.)

### Script de backfill best-effort (opcional, para linhas históricas)

Sessões gravadas **antes** desta migration não têm `leadId` de coluna, mas quatro dos oito pontos de
gravação listados no §1 já embutiam o leadId em texto no próprio `sessionId`, com formatos
diferentes. Um script de backfill rodado uma vez após a migration pode recuperar parte do
histórico, tentando cada padrão nesta ordem e validando o resultado (só grava se o `Lead`
efetivamente existir na mesma organização — nunca assumir que uma substring parece um cuid):

```
1. /^session_(?<leadId>[a-z0-9]+)$/                              -- SDROutboundDraftAgent (agent.worker.ts)
2. /^session-(?<leadId>[a-z0-9]+)-\d+$/                          -- SDRQualificationAgent (default, sdr.agent.ts)
3. /^autonomy-(?:sdr|bdr|closer|crm|ops)-(?<leadId>[a-z0-9]+)-\d+$/   -- autonomyRoleRunner (swarmScheduler.service.ts)
4. /^swarm-(?:sdr|bdr|closer|crm|ops)-lead_(?<leadId>[a-z0-9]+)-\d+$/ -- supervisor.agent.ts, a partir desta correção
```

Pseudocódigo:

```ts
const rows = await prisma.agentMemory.findMany({ where: { leadId: null, organizationId: { not: null } } });
for (const row of rows) {
    const leadId = extractLeadId(row.sessionId); // tenta os 4 regex acima, nesse ordem
    if (!leadId) continue;
    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: row.organizationId! } });
    if (!lead) continue; // não valida = não escreve; falso positivo é pior que não preencher
    await prisma.agentMemory.update({ where: { id: row.id }, data: { leadId } });
}
```

Isto é **best-effort e não cobre 100% do histórico** — sessões do enxame anteriores a esta correção
de código (bdr/closer/crm/ops via supervisor, formato antigo sem `lead_`) e qualquer sessão onde um
cliente tenha sobrescrito o `sessionId` (rota `/agents/sdr/qualify`) permanecerão sem correlação
possível. Isso deve ficar registrado como limitação conhecida, não escondido.

## 4. O que falta para fechar o gap de LGPD de verdade (dono: Agente 01A + quem tocar `eraseDataSubject` depois)

1. Aplicar a migration do §3 (schema + SQL).
2. Rodar (opcionalmente) o backfill do §3 sobre dados existentes.
3. Em `src/shared/services/dataSubjectErasure.service.ts`, dentro do bloco que já calcula `leadIds`
   (a partir de `target.contactId`), adicionar a redação de `AgentMemory`:
   ```ts
   const { count: agentMemoriesRedacted } = await prisma.agentMemory.updateMany({
       where: { leadId: { in: leadIds }, organizationId: target.organizationId },
       data: { messages: [] }, // ou um marcador de redação equivalente ao usado em TimelineEvent
   });
   ```
   mais o campo correspondente em `ErasureResult`/no log estruturado, e atualizar o comentário do
   topo do arquivo (a seção "AgentMemory — não alcançável por este mecanismo" deixa de ser verdade).
4. Teste de integração pedido no handoff original: prova que `eraseDataSubject` redige/remove
   `AgentMemory` de um titular específico sem afetar sessões de outros titulares na mesma
   organização — agora possível de forma segura (chave estruturada, não regex sobre string).

Itens 3-4 não foram feitos nesta rodada porque dependem da coluna existir no schema (item 1), que é
propriedade exclusiva do Agente 01A por instrução explícita desta remediação. Sugestão: quando 01A
aplicar a migration, devolver para o Agente 07 (ou qualquer agente do domínio de dados) para
implementar o item 3, já que a lógica de erasure em si é do domínio do 01A/dados, não de IA.

## Arquivo(s) envolvido(s) nesta rodada
- `src/features/intelligence/agents/supervisor.agent.ts` — correção de código aplicada (commit
  `fix(07): embutir leadId no sessionId dos especialistas do enxame`).
- `prisma/schema.prisma` → `model AgentMemory` (linha ~802) e `model Lead` — migration proposta
  acima, **não aplicada por este agente**.
- `src/shared/services/dataSubjectErasure.service.ts` — próximo passo (item 3 acima), não
  implementado nesta rodada (depende da migration).

## Teste esperado (repetido do handoff original, ainda pendente da migration)
Depois que a migration for aplicada e o item 3 do §4 implementado: teste de integração provando que
`eraseDataSubject` (ou uma função irmã) consegue redigir/remover `AgentMemory` de um titular
específico sem afetar sessões de outros titulares na mesma organização.

## Contexto adicional
Não bloqueia nada além de si mesmo — o mecanismo de exclusão hoje continua cobrindo Contact,
WhatsAppMessage, ConversationSignal e TimelineEvent como antes. A correção de código desta rodada
reduz o risco (corrige uma colisão real de dados entre leads diferentes e melhora a correlação para
tráfego novo do enxame), mas o gap de LGPD documentado no handoff original só fecha de verdade
quando a migration acima for aplicada.
