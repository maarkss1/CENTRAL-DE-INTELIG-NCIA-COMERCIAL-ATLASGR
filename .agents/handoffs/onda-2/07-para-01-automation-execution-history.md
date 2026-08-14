- De: Agente 07 (IA, RAG, Agentes, Filas e Automações)
- Para: Agente 01 (Plataforma, Segurança e Dados)
- Onda: 2
- Status: resolvido
- Prioridade: alto

## Problema

`Automation` (`prisma/schema.prisma`, linha ~885) só tem telemetria agregada:
`lastRunAt`/`runCount`. Não existe nenhum modelo de histórico por execução. Hoje,
`AutomationEngine.handle()` (`src/features/automations/automation.engine.ts`) roda cada regra que
casa com o evento, atualiza `lastRunAt`/`runCount` em caso de sucesso e só registra falha via
`logger.error` (log estruturado, não persistido em tabela consultável). Isso significa:

- nenhuma automação individual pode ser auditada depois do fato (o que rodou, quando, com que
  payload, teve sucesso ou erro, quantas tentativas);
- uma falha silenciosa em produção só aparece se alguém estiver olhando o log agregador no momento;
- não há `correlationId` amarrando o evento que disparou a regra à execução da ação;
- isso bate diretamente no critério "não avançar" da Onda 2 em `EXECUCAO-ONDAS.md`: "automação sem
  histórico/status", e na definição de pronto local de
  `src/features/automations/AGENTS.md`: "cada execução possui status, passos, erro, retry e
  correlation id."

Não posso alterar `prisma/schema.prisma`/migrações (fora do meu escopo — exclusivo do Agente 01),
então a correção completa depende de uma migração sua.

## Arquivo(s) envolvido(s)
- `prisma/schema.prisma` — modelo `Automation` (linha ~885) precisa de uma relação 1:N para o
  histórico.
- `src/features/automations/automation.engine.ts` — `handle()`/`runAction()` são os pontos que
  passariam a gravar cada execução (eu assumo essa parte assim que o modelo existir).

## Alteração necessária

Sugestão de modelo (nome e campos exatos a seu critério, mas cobrindo):

```prisma
model AutomationExecution {
  id             String   @id @default(cuid())
  automationId   String
  automation     Automation @relation(fields: [automationId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  // Snapshot da config no momento da execução (a automação pode ser editada depois) — evita que o
  // histórico "minta" sobre o que rodou de fato.
  actionConfigSnapshot Json

  trigger        AutomationTrigger
  status         String   // ex.: "success" | "failed" | "skipped_condition"
  correlationId  String   // amarra ao evento (ex.: entity+entityId+trigger+timestamp) e a logs
  steps          Json?    // passos internos quando a ação tiver mais de uma etapa (ex.: SDR de voz)
  errorSanitized String?  // nunca stack trace bruto nem dado sensível — mensagem curta e segura
  retryCount     Int      @default(0)

  startedAt      DateTime @default(now())
  finishedAt     DateTime?

  @@index([organizationId, automationId, startedAt])
  @@index([correlationId])
}
```

Retenção: automações rodam a cada evento comercial (lead criado, mudança de status etc.) — pode
crescer rápido. Sugiro o mesmo critério de expurgo já usado em outras tabelas de log/histórico
recentes deste projeto (ver decisão análoga em `06A-extracoes-bitrix.md`, seção 13), a seu
critério.

## Teste esperado
Depois da migração, eu adiciono (no meu escopo):
- toda execução (sucesso e falha) grava uma linha em `AutomationExecution`, isolada por tenant;
- `correlationId` idêntico entre o log estruturado e a linha persistida;
- uma automação que falha continua não impedindo as demais regras do mesmo evento (comportamento
  atual de `handle()` já isola por `try/catch` por automação — só falta persistir o resultado).

## Contexto adicional
Não é bloqueador para o restante da minha entrega da Onda 2 (gateway, RAG, filas, Hub de IA,
segurança de tool/LGPD já foram tratados nesta onda dentro do meu escopo) — mas fica registrado como
pendência real, não como "temos histórico" por causa do `lastRunAt`/`runCount` agregado que já
existe. Enquanto a migração não chega, `cold-leads-scanner.service.ts`
(`src/features/automations/application/`) e `automation.engine.ts` já usam `runId`/log estruturado
com correlação nos logs — não é histórico persistente/consultável pela UI, mas evita a automação
"desaparecer" completamente sem rastro nenhum.

## Resolução
Resolvido na Onda 2.5 (ver `.agents/runs/onda-2.5.md`), sem criar uma tabela redundante: a
implementação reutiliza `AuditLog` (já persistente, tenant-scoped, sob RLS) em vez do modelo
`AutomationExecution` sugerido aqui. Contrato persistido por execução: `automationId`/nome,
`organizationId`, `correlationId` único, trigger/entidade/`entityId`, snapshot sanitizado de
`actionConfig`, status `success`/`failed`, início/fim/duração, `retryCount`, erro sanitizado — cobre
o mesmo requisito (auditoria pós-fato, correlação, retry, isolamento de tenant). Ver
`src/features/automations/automation-history.service.ts` e
`tests/unit/features/automation-engine-run.test.ts`. Confirmado presente em `main` nesta sessão
(Onda 4).
