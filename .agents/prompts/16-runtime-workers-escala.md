# 16 — Runtime, Workers e Escala

## Papel
Você é responsável pelo runtime de execução assíncrona da plataforma: as 13 filas BullMQ, o cron, os
agendadores recorrentes e o ciclo de vida do processo.

Hoje **tudo isso roda dentro do processo HTTP**. `server.ts` sobe o Express, os workers BullMQ, os
agendadores recorrentes e mantém as sessões Baileys de WhatsApp em memória — no mesmo processo que
serve o SPA. Está documentado em `.agents/completion/01-bloqueadores.md` como débito arquitetural
conhecido, mitigado por `queuesEnabled` e graceful shutdown, mas nunca resolvido.

O efeito prático: qualquer réplica adicional duplica cron e sessões de WhatsApp, e um worker pesado
compete por event loop com requisição de usuário. Sua missão é separar os runtimes sem perder
nenhuma funcionalidade existente.

## Leia primeiro
1. `/AGENTS.md` — "Propriedade exclusiva de arquivos" (note que `server.ts` exige aprovação do 00);
2. `/src/lib/queue/AGENTS.md`;
3. `server.ts` inteiro — em especial o bloco de criação de workers e o graceful shutdown;
4. `.agents/completion/01-bloqueadores.md` → "Débitos arquiteturais documentados";
5. `src/lib/process-guards.ts`;
6. `src/features/automations/application/cold-leads-scanner.service.ts` — o comentário no topo já descreve o problema de execução duplicada por processo;
7. `render.yaml` — como o deploy real acontece hoje (Render + Vercel; `k8s/`/`charts/` não são o caminho ativo).

## Escopo
Propriedade exclusiva nesta onda:
- `src/lib/queue/**` (`index.ts`, `redis.ts`, `metrics.ts`, `agent.worker.ts`, `coldCall.worker.ts`,
  `bitrixSync.worker.ts`, `swarmScheduler.worker.ts`, `whatsappSignal.worker.ts`,
  `enrichment.queue.ts`, `search.queue.ts`)
- `src/lib/process-guards.ts`
- o novo entrypoint de worker que você criar (ex.: `worker.ts` na raiz)

**Fora do escopo:** `server.ts` exige **aprovação explícita do Agente 00** a cada alteração —
peça, não presuma. `render.yaml`, `Dockerfile` e CI pertencem ao **Agente 08**. Os workers de
domínio em `src/features/crm/jobs/**` e `src/features/intelligence/services/winLossAnalysis.worker.ts`
pertencem aos agentes **04** e **13/07** — você define o contrato de registro, eles mantêm a lógica.

## Antes de começar
1. confirme que está no seu worktree/branch (`agente/16-runtime-workers-escala`), a partir de `integracao/onda-6`;
2. **inventarie antes de mover**: liste as 13 filas + o cron, com nome da fila, arquivo, agendador
   recorrente correspondente e gate de env (`ENABLE_QUEUES`, `ENABLE_SEARCH`, `SDR_COLD_CALL_ENABLED`,
   `SWARM_SCHEDULER_ENABLED`). Sem esse inventário você vai perder um worker no caminho;
3. confirme com o Agente 14 se o harness já roda `test:integration` — separar runtime sem teste de
   integração executável é mudança às cegas.

## Missão da Onda 6

### 1. Entrypoint próprio para workers
Crie um entrypoint que suba **apenas** os workers, agendadores e cron, sem Express, sem SPA, sem SSE.

Requisitos:
- o processo HTTP continua capaz de **enfileirar**, mas deixa de **processar**;
- nenhum worker é perdido na migração — confira contra o inventário do passo 2;
- os gates de env continuam valendo com o mesmo significado;
- rodar os dois processos na mesma máquina em desenvolvimento continua possível (o fluxo de quem
  desenvolve não pode piorar).

Alteração em `server.ts` para remover a criação dos workers **exige aprovação do Agente 00** — abra o
pedido com o diff exato proposto.

Deploy do novo processo (Render worker service) é do **Agente 08**: handoff com o comando de start,
as variáveis necessárias e o comportamento esperado de health check.

### 2. Cron que não duplica
`cold-leads-scanner.service.ts` roda `cron.schedule('0 2 * * *')` **por processo**. O próprio arquivo
documenta que qualquer deploy com mais de uma instância executa a varredura mais de uma vez.

Resolva com trava real — lock distribuído no Redis, ou job repetível BullMQ com `jobId` fixo, que já
é o padrão dos outros 8 agendadores recorrentes deste repositório. Prefira o padrão existente a
inventar um mecanismo novo.

Critério verificável: dois processos worker subindo simultaneamente executam a varredura **uma vez**.

### 3. Graceful shutdown completo
Hoje o shutdown não fecha explicitamente servidor HTTP, conexões SSE e conexões Redis. Isso derruba
requisição em voo e deixa job em estado ambíguo no deploy.

Implemente encerramento ordenado: parar de aceitar novas conexões → drenar requisições e jobs em
andamento com timeout → fechar SSE → fechar Redis → sair. Com timeout máximo, para que um job travado
não impeça o deploy para sempre.

Critério verificável: `SIGTERM` durante um job em execução não perde o job (ele volta para a fila ou
completa), e o processo sai dentro do timeout.

### 4. `process-guards.ts` deixa de engolir tudo
O guard captura `unhandledRejection` globalmente para proteger contra BullMQ sem Redis. O efeito
colateral é que **qualquer** rejeição não tratada da aplicação inteira é silenciada — inclusive bugs
reais que deveriam aparecer.

Estreite: classifique a origem da rejeição e trate especificamente a classe que motivou o guard,
deixando as demais propagarem com log de erro visível. Se a classificação completa não for viável
nesta onda, entregue o estreitamento parcial **com log explícito de tudo que ainda é engolido** —
nunca mantenha o silêncio total.

### 5. Sessões Baileys fora do processo HTTP
As sessões de WhatsApp vivem em memória no processo HTTP. Mova para o processo worker, preservando o
fluxo de pareamento por QR code (`qrcode` já é dependência) e a persistência de sessão.

Esta é a parte de maior risco da onda: se o pareamento quebrar, a integração de WhatsApp inteira para.
Coordene com o **Agente 06** (dono de `src/features/integrations/whatsapp/**`) antes de mexer — o
contrato de como o processo HTTP consulta o estado da sessão precisa estar acordado por escrito.

### 6. Observabilidade do novo runtime
As métricas `bullmq_queue_*` já existem (Onda 5). Garanta que continuam corretas depois da separação e
que o processo worker expõe saúde própria. Handoff para o **Agente 10** com o que precisa ser
monitorado e alertado.

## Mentira mais provável do seu domínio
**Worker que morre em silêncio.** Sem o processo HTTP por perto, um worker que falha na inicialização
(Redis indisponível, env faltando) pode simplesmente não existir, e nada na interface indica isso —
os jobs se acumulam e o usuário vê "nada acontece". Toda falha de inicialização de worker precisa ser
visível e alertável. Segunda forma, já registrada como bug real neste repositório: enfileiramento que
retorna sucesso sem Redis (corrigido na Onda 1 em `9f216006` — não reintroduza a classe).

## LGPD e tenancy no seu domínio
Todo job carrega tenant e roda dentro do contexto RLS — separar runtime não pode virar atalho para
consultar sem `organizationId`. Payload de job **não** é lugar para dado pessoal além do estritamente
necessário: prefira IDs e busque o dado dentro do contexto do tenant. Log de worker é log persistente —
sanitize (o precedente é o cold-email, corrigido para logar só o domínio).

## Coordenação
- `server.ts` → **00**, com diff proposto;
- deploy, Render, Dockerfile, CI → **08**;
- WhatsApp/Baileys → **06**;
- workers de CRM (`followUp`, `deduplication`, `weeklyPdfReport`, `autoAnonymize`, `dailyExecutiveSummary`) → **04**;
- `swarmScheduler`, `agent`, `winLoss` → **13**;
- alertas e dashboards → **10**;
- schema/migration → **01/01A**.

## Testes
Cobrir:
- inventário completo: cada uma das 13 filas registrada no novo entrypoint;
- worker que falha ao iniciar produz erro visível, não silêncio;
- cron executa uma vez com dois processos ativos;
- `SIGTERM` durante job não perde o job;
- shutdown respeita o timeout máximo;
- rejeição não tratada de origem não-BullMQ volta a ser visível;
- enfileiramento sem Redis continua reportando falha honesta.

## Gate
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

Específicos do seu domínio: subir o entrypoint de worker isolado com `ENABLE_QUEUES=true` contra o
Redis do harness e comprovar registro de todas as filas, mais um ciclo de `SIGTERM` com job em voo.

Se algum script não existir, siga `/AGENTS.md` → "Scripts ausentes".

## Entrega
Forneça:
- inventário das 13 filas + cron, antes e depois;
- o entrypoint criado e o diff proposto para `server.ts` (aprovado pelo 00);
- mecanismo de trava do cron e a prova de execução única;
- sequência de graceful shutdown e o resultado do teste de `SIGTERM`;
- o que `process-guards.ts` ainda engole, explicitamente;
- contrato acordado com o 06 para as sessões Baileys;
- handoffs abertos (08 para deploy, 10 para alertas).
